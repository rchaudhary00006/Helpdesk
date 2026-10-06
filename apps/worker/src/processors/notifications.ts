import type { Job } from 'bullmq';
import { prisma } from '@helpdesk/db';
import {
  emailDomainOf,
  REPLY_MARKER,
  rooms,
  SOCKET_EVENTS,
  ticketMessageId,
  ticketThreadId,
  type EmailJob,
  type NotifyJob,
} from '@helpdesk/shared';
import { env } from '../env';
import { emailQueue, mailer, socketEmitter, ticketUrl } from '../lib';

/** Fans a notification out to in-app rows + one email job per recipient. */
export async function processNotification(job: Job<NotifyJob>) {
  const { recipientIds, channels, type, title, body, ticketId, ticketNumber } = job.data;

  const users = await prisma.user.findMany({
    where: { id: { in: recipientIds }, active: true },
    select: { id: true, email: true, name: true },
  });
  if (users.length === 0) return { delivered: 0 };

  if (channels.includes('inapp')) {
    // Idempotent on retry: skip users who already got this exact notification from this job.
    const already = await prisma.notification.findMany({
      where: { userId: { in: users.map((u) => u.id) }, type, title, ticketId: ticketId ?? null, createdAt: { gte: new Date(job.timestamp) } },
      select: { userId: true },
    });
    const done = new Set(already.map((n) => n.userId));
    const pending = users.filter((u) => !done.has(u.id));
    await prisma.notification.createMany({
      data: pending.map((u) => ({ userId: u.id, type, title, body, ticketId })),
    });
    for (const u of pending) socketEmitter.to(rooms.user(u.id)).emit(SOCKET_EVENTS.notification, { type });
  }

  if (channels.includes('email')) {
    const link = ticketNumber ? `\n\nView ticket: ${ticketUrl(ticketNumber)}` : '';
    await emailQueue.addBulk(
      users.map((u) => ({
        name: type,
        data: {
          to: u.email,
          subject: ticketNumber && !title.includes(`#${ticketNumber}`) ? `[#${ticketNumber}] ${title}` : title,
          text: `Hi ${u.name},\n\n${body ?? title}${link}\n\n— Helpdesk`,
          ticketNumber,
        } satisfies EmailJob,
        // Deterministic id → a retried fan-out job won't enqueue duplicate emails.
        opts: { jobId: `${job.id}_${u.id}` },
      })),
    );
  }

  return { delivered: users.length };
}

export async function processEmail(job: Job<EmailJob>) {
  const { to, subject, text, ticketNumber } = job.data;
  const domain = emailDomainOf(env.MAIL_FROM);
  // Per-ticket thread root, echoed back by mail clients in In-Reply-To/References on reply —
  // that's how inbound replies find their ticket (see packages/shared/src/email.ts).
  const thread = ticketNumber ? ticketThreadId(ticketNumber, domain) : undefined;
  const replyable = !!(ticketNumber && env.SUPPORT_EMAIL);

  const info = await mailer.sendMail({
    from: env.MAIL_FROM,
    to,
    replyTo: env.SUPPORT_EMAIL,
    subject,
    text: replyable ? `${REPLY_MARKER}\n\n${text}` : text,
    messageId: ticketNumber ? ticketMessageId(ticketNumber, String(job.id).replace(/[^\w-]/g, ''), domain) : undefined,
    headers: {
      ...(thread ? { 'In-Reply-To': thread, References: thread } : {}),
      // Mark as automatic so well-behaved servers don't send out-of-office replies back (mail loops).
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'All',
    },
  });
  return { messageId: info.messageId };
}
