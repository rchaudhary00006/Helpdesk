import { z } from 'zod';
import { prisma, Prisma, type Channel, type Ticket } from '@helpdesk/db';
import {
  ACTIVE_STATUSES,
  computeSlaTargets,
  type BusinessInterval,
  isStaff,
  type createCommentSchema,
  type createTicketSchema,
  type ListTicketsQuery,
  type TicketCounts,
  type UpdateTicketInput,
} from '@helpdesk/shared';
import { bus } from '../../events/bus';
import { badRequest, notFound } from '../../lib/errors';
import type { AuthUser } from '../../middleware/auth';
import {
  assertCanComment,
  assertCanUpdate,
  canViewTicket,
  diffFields,
  nextStatusOnComment,
  statusTransitionData,
  ticketScope,
  type FieldChanges,
} from './rules';
import { commentSelect, ticketListInclude, userSelect } from './selects';

type CreateTicket = z.output<typeof createTicketSchema>;
type CreateComment = z.output<typeof createCommentSchema>;

const MAX_INT4 = 2_147_483_647;

/** URLs use the human ticket number (/tickets/1042); the API also accepts the internal id. */
function whereIdOrNumber(idOrNumber: string): Prisma.TicketWhereUniqueInput {
  if (/^\d+$/.test(idOrNumber)) {
    const n = Number(idOrNumber);
    if (n <= MAX_INT4) return { number: n };
  }
  return { id: idOrNumber };
}

/** Loads a ticket the actor can see. Returns 404 (not 403) otherwise so ids can't be probed. */
async function loadVisibleTicket(actor: AuthUser, idOrNumber: string): Promise<Ticket> {
  const ticket = await prisma.ticket.findUnique({ where: whereIdOrNumber(idOrNumber) });
  if (!ticket || !canViewTicket(actor, ticket)) throw notFound('Ticket');
  return ticket;
}

async function linkAttachments(
  tx: Prisma.TransactionClient,
  uploaderId: string,
  attachmentIds: string[],
  ticketId: string,
  commentId: string,
) {
  const ids = [...new Set(attachmentIds)];
  if (ids.length === 0) return;
  // Only the uploader's own, not-yet-used uploads can be attached.
  const { count } = await tx.attachment.updateMany({
    where: { id: { in: ids }, uploaderId, ticketId: null },
    data: { ticketId, commentId },
  });
  if (count !== ids.length) throw badRequest('One or more attachments are invalid or already used');
}

/** SLA due dates for a priority, in business hours when the policy has a schedule. */
async function slaTargetsFor(priority: Ticket['priority'], from: Date) {
  const policy = await prisma.slaPolicy.findUnique({
    where: { priority },
    include: { schedule: { include: { holidays: { select: { date: true } } } } },
  });
  if (!policy) return { firstResponseDueAt: null, resolutionDueAt: null, slaBusinessHours: false };

  const schedule = policy.schedule
    ? {
        timezone: policy.schedule.timezone,
        intervals: policy.schedule.intervals as unknown as BusinessInterval[],
        holidays: policy.schedule.holidays.map((h) => h.date),
      }
    : null;
  return { ...computeSlaTargets(from, policy, schedule), slaBusinessHours: !!schedule };
}

// ---------------------------------------------------------------- queries

export async function listTickets(actor: AuthUser, q: ListTicketsQuery) {
  const filters: Prisma.TicketWhereInput[] = [ticketScope(actor)];

  if (q.status?.length) filters.push({ status: { in: q.status } });
  if (q.priority) filters.push({ priority: q.priority });
  if (q.groupId) filters.push({ groupId: q.groupId });
  if (q.breached) filters.push({ OR: [{ firstResponseBreached: true }, { resolutionBreached: true }] });
  if (q.assignee === 'me') filters.push({ assigneeId: actor.id });
  else if (q.assignee === 'unassigned') filters.push({ assigneeId: null });
  else if (q.assignee) filters.push({ assigneeId: q.assignee });

  if (q.q) {
    const numeric = q.q.replace(/^#/, '');
    const or: Prisma.TicketWhereInput[] = [
      { subject: { contains: q.q, mode: 'insensitive' } },
      { tags: { has: q.q.toLowerCase() } },
    ];
    if (/^\d+$/.test(numeric) && Number(numeric) <= MAX_INT4) or.push({ number: Number(numeric) });
    filters.push({ OR: or });
  }

  const orderBy: Prisma.TicketOrderByWithRelationInput[] =
    q.sort === 'resolutionDueAt'
      ? [{ resolutionDueAt: { sort: q.order, nulls: 'last' } }]
      : [{ [q.sort]: q.order }];
  orderBy.push({ number: 'desc' }); // stable tiebreaker for pagination

  const where: Prisma.TicketWhereInput = { AND: filters };
  const [data, total] = await prisma.$transaction([
    prisma.ticket.findMany({
      where,
      include: ticketListInclude,
      orderBy,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.ticket.count({ where }),
  ]);

  return { data, total, page: q.page, pageSize: q.pageSize };
}

export async function ticketCounts(actor: AuthUser): Promise<TicketCounts> {
  const active = { status: { in: [...ACTIVE_STATUSES] } };
  const [unassigned, mine, open, pending, solved, breached] = await prisma.$transaction([
    prisma.ticket.count({ where: { ...active, assigneeId: null } }),
    prisma.ticket.count({ where: { ...active, assigneeId: actor.id } }),
    prisma.ticket.count({ where: { status: { in: ['NEW', 'OPEN'] } } }),
    prisma.ticket.count({ where: { status: 'PENDING' } }),
    prisma.ticket.count({ where: { status: 'SOLVED' } }),
    prisma.ticket.count({
      where: { ...active, OR: [{ firstResponseBreached: true }, { resolutionBreached: true }] },
    }),
  ]);
  return { unassigned, mine, open, pending, solved, breached };
}

export async function getTicket(actor: AuthUser, idOrNumber: string) {
  const ticket = await prisma.ticket.findUnique({
    where: whereIdOrNumber(idOrNumber),
    include: {
      ...ticketListInclude,
      organization: { select: { id: true, name: true } },
      comments: {
        // Internal notes never leave the API for customers.
        where: isStaff(actor.role) ? {} : { isPublic: true },
        orderBy: { createdAt: 'asc' },
        select: commentSelect,
      },
    },
  });
  if (!ticket || !canViewTicket(actor, ticket)) throw notFound('Ticket');
  return ticket;
}

export async function getAuditLog(actor: AuthUser, idOrNumber: string) {
  const ticket = await loadVisibleTicket(actor, idOrNumber);
  return prisma.auditLog.findMany({
    where: { ticketId: ticket.id },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { id: true, action: true, changes: true, createdAt: true, actor: { select: userSelect } },
  });
}

// ---------------------------------------------------------------- commands

export async function createTicket(actor: AuthUser, input: CreateTicket, opts: { channel?: Channel } = {}) {
  const channel = opts.channel ?? 'WEB';
  const now = new Date();
  const sla = await slaTargetsFor(input.priority, now);

  const ticket = await prisma.$transaction(async (tx) => {
    const t = await tx.ticket.create({
      data: {
        subject: input.subject,
        priority: input.priority,
        type: input.type,
        tags: [...new Set(input.tags)],
        channel,
        requesterId: actor.id,
        organizationId: actor.organizationId,
        createdAt: now,
        ...sla,
      },
      include: ticketListInclude,
    });
    // The description is simply the first public comment, like Zendesk.
    const comment = await tx.comment.create({
      data: { ticketId: t.id, authorId: actor.id, body: input.description, isPublic: true, via: channel },
    });
    await linkAttachments(tx, actor.id, input.attachmentIds, t.id, comment.id);
    await tx.auditLog.create({ data: { ticketId: t.id, actorId: actor.id, action: 'ticket.created' } });
    return t;
  });

  bus.emit('ticket.created', { ticket, actor });
  return ticket;
}

export async function updateTicket(actor: AuthUser, idOrNumber: string, patch: UpdateTicketInput) {
  const before = await loadVisibleTicket(actor, idOrNumber);
  assertCanUpdate(actor, before, patch);

  if (patch.tags) patch.tags = [...new Set(patch.tags)];
  const changes: FieldChanges = diffFields(before, patch);

  // Assigning a NEW ticket implicitly opens it.
  if (changes.assigneeId && patch.assigneeId && before.status === 'NEW' && !patch.status) {
    changes.status = { from: 'NEW', to: 'OPEN' };
  }
  if (Object.keys(changes).length === 0) return getTicket(actor, before.id);

  if (changes.assigneeId?.to) {
    const assignee = await prisma.user.findFirst({
      where: { id: changes.assigneeId.to as string, active: true, role: { in: ['ADMIN', 'AGENT'] } },
    });
    if (!assignee) throw badRequest('Assignee must be an active agent');
  }
  if (changes.groupId?.to) {
    const group = await prisma.group.findUnique({ where: { id: changes.groupId.to as string } });
    if (!group) throw badRequest('Group does not exist');
  }

  const now = new Date();
  const data: Prisma.TicketUncheckedUpdateInput = Object.fromEntries(
    Object.entries(changes).map(([field, c]) => [field, c.to]),
  );
  if (changes.status) {
    Object.assign(data, statusTransitionData(before.status, changes.status.to as Ticket['status'], now));
  }
  if (changes.priority) {
    // SLA targets are measured from creation, so re-prioritising can pull a deadline into the past.
    Object.assign(data, await slaTargetsFor(changes.priority.to as Ticket['priority'], before.createdAt));
  }

  const ticket = await prisma.$transaction(async (tx) => {
    const t = await tx.ticket.update({ where: { id: before.id }, data, include: ticketListInclude });
    await tx.auditLog.create({
      data: {
        ticketId: t.id,
        actorId: actor.id,
        action: 'ticket.updated',
        changes: changes as Prisma.InputJsonValue,
      },
    });
    return t;
  });

  bus.emit('ticket.updated', { ticket, before, changes, actor });
  return getTicket(actor, ticket.id);
}

export async function addComment(
  actor: AuthUser,
  idOrNumber: string,
  input: CreateComment,
  opts: { via?: Channel } = {},
) {
  const before = await loadVisibleTicket(actor, idOrNumber);
  assertCanComment(actor, before, input);

  const now = new Date();
  const nextStatus = nextStatusOnComment(actor, before, input);
  const data: Prisma.TicketUncheckedUpdateInput = {
    updatedAt: now,
    ...statusTransitionData(before.status, nextStatus, now),
  };
  const isFirstAgentResponse =
    input.isPublic && isStaff(actor.role) && !before.firstRespondedAt && actor.id !== before.requesterId;
  if (isFirstAgentResponse) data.firstRespondedAt = now;

  const { comment, ticket } = await prisma.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: {
        ticketId: before.id,
        authorId: actor.id,
        body: input.body,
        isPublic: input.isPublic,
        via: opts.via ?? 'WEB',
        createdAt: now,
      },
    });
    await linkAttachments(tx, actor.id, input.attachmentIds, before.id, comment.id);
    const ticket = await tx.ticket.update({ where: { id: before.id }, data, include: ticketListInclude });
    await tx.auditLog.create({
      data: {
        ticketId: before.id,
        actorId: actor.id,
        action: input.isPublic ? 'comment.public' : 'comment.internal',
        changes:
          nextStatus !== before.status ? { status: { from: before.status, to: nextStatus } } : undefined,
      },
    });
    return { comment, ticket };
  });

  bus.emit('comment.created', { ticket, before, comment, actor });
  return prisma.comment.findUniqueOrThrow({ where: { id: comment.id }, select: commentSelect });
}
