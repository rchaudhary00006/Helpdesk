import { prisma } from '@helpdesk/db';
import { isStaff, STATUS_LABELS, type TicketStatus } from '@helpdesk/shared';
import { enqueueNotification } from '../lib/queues';
import { realtime } from '../realtime/socket';
import { scheduleSlaChecks } from '../modules/tickets/sla-scheduler';
import { bus } from './bus';

const excerpt = (s: string, n = 400) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function registerSubscribers() {
  // ---- realtime
  bus.on('ticket.created', ({ ticket }) => realtime.ticketChanged(ticket));
  bus.on('ticket.updated', ({ ticket }) => realtime.ticketChanged(ticket));
  bus.on('comment.created', ({ ticket, comment }) =>
    realtime.ticketChanged(ticket, { internalOnly: !comment.isPublic }),
  );

  // ---- SLA timers
  bus.on('ticket.created', ({ ticket }) => scheduleSlaChecks(ticket));
  bus.on('ticket.updated', ({ ticket, changes }) => {
    if (changes.priority || changes.status) return scheduleSlaChecks(ticket);
  });
  bus.on('comment.created', ({ ticket, before }) => {
    if (ticket.firstRespondedAt && !before.firstRespondedAt) return scheduleSlaChecks(ticket);
  });

  // ---- notifications
  bus.on('ticket.created', async ({ ticket, actor }) => {
    if (!isStaff(actor.role)) {
      await enqueueNotification({
        recipientIds: [ticket.requesterId],
        type: 'ticket.received',
        title: `We received your request: ${ticket.subject}`,
        body: 'Our team will get back to you shortly. Reply to this ticket any time to add details.',
        ticketId: ticket.id,
        ticketNumber: ticket.number,
        channels: ['email'],
      });
    }
    // Urgent tickets page every agent in-app; everything else waits in the Unassigned view.
    if (ticket.priority === 'URGENT') {
      const staff = await prisma.user.findMany({
        where: { active: true, role: { in: ['ADMIN', 'AGENT'] }, id: { not: actor.id } },
        select: { id: true },
      });
      await enqueueNotification({
        recipientIds: staff.map((s) => s.id),
        type: 'ticket.urgent',
        title: `URGENT #${ticket.number}: ${ticket.subject}`,
        ticketId: ticket.id,
        ticketNumber: ticket.number,
        channels: ['inapp', 'email'],
      });
    }
  });

  bus.on('ticket.updated', async ({ ticket, changes, actor }) => {
    if (changes.assigneeId && ticket.assigneeId && ticket.assigneeId !== actor.id) {
      await enqueueNotification({
        recipientIds: [ticket.assigneeId],
        type: 'ticket.assigned',
        title: `#${ticket.number} was assigned to you`,
        body: `${actor.name} assigned "${ticket.subject}" to you.`,
        ticketId: ticket.id,
        ticketNumber: ticket.number,
        channels: ['inapp', 'email'],
      });
    }
    if (changes.status?.to === 'SOLVED' && actor.id !== ticket.requesterId) {
      await enqueueNotification({
        recipientIds: [ticket.requesterId],
        type: 'ticket.solved',
        title: `Your request #${ticket.number} has been solved`,
        body: 'If this did not fix the problem, just reply and the ticket will reopen.',
        ticketId: ticket.id,
        ticketNumber: ticket.number,
        channels: ['email'],
      });
    }
  });

  bus.on('comment.created', async ({ ticket, comment, actor, before }) => {
    const statusNote =
      ticket.status !== before.status ? `\n\nStatus: ${STATUS_LABELS[ticket.status as TicketStatus]}` : '';

    if (comment.isPublic && actor.id !== ticket.requesterId) {
      await enqueueNotification({
        recipientIds: [ticket.requesterId],
        type: 'comment.reply',
        title: `New reply on #${ticket.number}: ${ticket.subject}`,
        body: `${actor.name} wrote:\n\n${excerpt(comment.body)}${statusNote}`,
        ticketId: ticket.id,
        ticketNumber: ticket.number,
        channels: ['inapp', 'email'],
      });
    }
    if (ticket.assigneeId && ticket.assigneeId !== actor.id) {
      await enqueueNotification({
        recipientIds: [ticket.assigneeId],
        type: comment.isPublic ? 'comment.reply' : 'comment.internal',
        title: `${comment.isPublic ? 'New reply' : 'Internal note'} on #${ticket.number}`,
        body: `${actor.name}: ${excerpt(comment.body, 200)}`,
        ticketId: ticket.id,
        ticketNumber: ticket.number,
        // Requester replies also email the agent; agent-to-agent notes stay in-app.
        channels: actor.id === ticket.requesterId ? ['inapp', 'email'] : ['inapp'],
      });
    }
  });
}
