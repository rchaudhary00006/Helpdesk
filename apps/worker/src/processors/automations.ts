import fs from 'node:fs/promises';
import path from 'node:path';
import type { Job } from 'bullmq';
import { prisma } from '@helpdesk/db';
import { rooms, SOCKET_EVENTS } from '@helpdesk/shared';
import { env } from '../env';
import { logger, socketEmitter } from '../lib';
import { pollImap } from './imap';

const BATCH = 500;

/** Solved tickets with no activity for AUTO_CLOSE_AFTER_HOURS become Closed (read-only). */
async function autoCloseSolved() {
  const cutoff = new Date(Date.now() - env.AUTO_CLOSE_AFTER_HOURS * 3_600_000);
  const candidates = await prisma.ticket.findMany({
    where: { status: 'SOLVED', updatedAt: { lt: cutoff } },
    select: { id: true },
    take: BATCH,
  });
  if (candidates.length === 0) return 0;

  const ids = candidates.map((t) => t.id);
  const now = new Date();
  const closed = await prisma.$transaction(async (tx) => {
    // Re-check status inside the write so a ticket reopened mid-run isn't closed.
    await tx.ticket.updateMany({
      where: { id: { in: ids }, status: 'SOLVED' },
      data: { status: 'CLOSED', closedAt: now },
    });
    const closedIds = (
      await tx.ticket.findMany({ where: { id: { in: ids }, closedAt: now }, select: { id: true } })
    ).map((t) => t.id);
    await tx.auditLog.createMany({
      data: closedIds.map((ticketId) => ({
        ticketId,
        actorId: null,
        action: 'automation.auto_closed',
        changes: { status: { from: 'SOLVED', to: 'CLOSED' } },
      })),
    });
    return closedIds.length;
  });

  socketEmitter.to(rooms.staff).emit(SOCKET_EVENTS.ticketsChanged, {});
  logger.info({ closed }, 'Auto-closed solved tickets');
  return closed;
}

/** Deletes uploads that were never attached to a ticket (abandoned forms). */
async function cleanupOrphanUploads() {
  const cutoff = new Date(Date.now() - 24 * 3_600_000);
  const orphans = await prisma.attachment.findMany({
    where: { ticketId: null, createdAt: { lt: cutoff } },
    select: { id: true, storageKey: true },
    take: BATCH,
  });
  for (const o of orphans) {
    await fs.rm(path.join(env.UPLOAD_DIR, o.storageKey), { force: true });
    await prisma.attachment.delete({ where: { id: o.id } });
  }
  if (orphans.length) logger.info({ removed: orphans.length }, 'Removed orphan uploads');
  return orphans.length;
}

export async function processAutomation(job: Job) {
  switch (job.name) {
    case 'auto-close':
      return autoCloseSolved();
    case 'cleanup-uploads':
      return cleanupOrphanUploads();
    case 'imap-poll':
      return pollImap();
    default:
      throw new Error(`Unknown automation: ${job.name}`);
  }
}
