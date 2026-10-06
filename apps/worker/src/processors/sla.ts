import type { Job } from 'bullmq';
import { prisma } from '@helpdesk/db';
import { rooms, SOCKET_EVENTS, type SlaCheckJob } from '@helpdesk/shared';
import { logger, notificationsQueue, socketEmitter } from '../lib';

const LABEL = { FIRST_RESPONSE: 'first response', RESOLUTION: 'resolution' } as const;

export async function processSlaCheck(job: Job<SlaCheckJob>) {
  const { ticketId, metric, dueAt } = job.data;
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return 'ticket-deleted';

  const isFr = metric === 'FIRST_RESPONSE';
  const currentDue = isFr ? ticket.firstResponseDueAt : ticket.resolutionDueAt;
  // Priority changed after this job was queued — a newer job owns this check.
  if (!currentDue || currentDue.toISOString() !== dueAt) return 'stale';

  const met = isFr ? !!ticket.firstRespondedAt : !!ticket.resolvedAt || ticket.status === 'CLOSED';
  if (met) return 'met';

  if (currentDue.getTime() > Date.now() + 1_000) {
    // Fired early (clock skew / manual retry) — try again at the real due time.
    await job.moveToDelayed(currentDue.getTime(), job.token);
    return 'rescheduled';
  }

  // Conditional update = idempotent even if two workers race on the same job.
  const { count } = await prisma.ticket.updateMany({
    where: { id: ticketId, ...(isFr ? { firstResponseBreached: false } : { resolutionBreached: false }) },
    data: isFr ? { firstResponseBreached: true } : { resolutionBreached: true },
  });
  if (count === 0) return 'already-breached';

  await prisma.auditLog.create({
    data: { ticketId, actorId: null, action: 'sla.breached', changes: { metric: { from: null, to: metric } } },
  });

  // Escalation: assignee → their group → admins.
  let recipientIds: string[] = [];
  if (ticket.assigneeId) recipientIds = [ticket.assigneeId];
  else if (ticket.groupId) {
    const members = await prisma.groupMember.findMany({ where: { groupId: ticket.groupId }, select: { userId: true } });
    recipientIds = members.map((m) => m.userId);
  }
  if (recipientIds.length === 0) {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', active: true }, select: { id: true } });
    recipientIds = admins.map((a) => a.id);
  }

  await notificationsQueue.add('sla.breached', {
    recipientIds,
    type: 'sla.breached',
    title: `SLA breached: ${LABEL[metric]} on #${ticket.number}`,
    body: `"${ticket.subject}" missed its ${LABEL[metric]} target (${ticket.priority} priority, due ${currentDue.toUTCString()}).`,
    ticketId,
    ticketNumber: ticket.number,
    channels: ['inapp', 'email'],
  });

  socketEmitter.to(rooms.ticket(ticketId)).emit(SOCKET_EVENTS.ticketChanged, { ticketId });
  socketEmitter.to(rooms.staff).emit(SOCKET_EVENTS.ticketsChanged, { ticketId });
  logger.warn({ ticket: ticket.number, metric }, 'SLA breached');
  return 'breached';
}
