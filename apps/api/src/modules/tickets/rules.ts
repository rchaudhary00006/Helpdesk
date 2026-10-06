/**
 * Pure ticket business rules: visibility, edit permissions, status transitions.
 * No I/O here — everything is unit tested in rules.test.ts.
 */
import { isStaff, type Role, type TicketStatus, type UpdateTicketInput } from '@helpdesk/shared';
import type { Prisma } from '@helpdesk/db';
import { conflict, forbidden } from '../../lib/errors';

export interface Actor {
  id: string;
  role: Role;
}

interface TicketRef {
  requesterId: string;
  status: TicketStatus;
}

export type FieldChanges = Record<string, { from: unknown; to: unknown }>;

/** Row-level filter applied to every ticket query. */
export function ticketScope(actor: Actor): Prisma.TicketWhereInput {
  // Customers only see tickets they raised. (Org-wide visibility for customers would go here.)
  return isStaff(actor.role) ? {} : { requesterId: actor.id };
}

export function canViewTicket(actor: Actor, ticket: Pick<TicketRef, 'requesterId'>) {
  return isStaff(actor.role) || ticket.requesterId === actor.id;
}

/** Fields a customer may change on their own ticket, and the values they may set. */
const CUSTOMER_STATUS_CHANGES: readonly TicketStatus[] = ['SOLVED'];

export function assertCanUpdate(actor: Actor, ticket: TicketRef, patch: UpdateTicketInput) {
  if (ticket.status === 'CLOSED') throw conflict('Closed tickets cannot be modified; open a follow-up instead');

  if (!isStaff(actor.role)) {
    const fields = Object.keys(patch);
    const onlyStatus = fields.length === 1 && fields[0] === 'status';
    if (!onlyStatus || !patch.status || !CUSTOMER_STATUS_CHANGES.includes(patch.status)) {
      throw forbidden('Customers can only mark their request as solved');
    }
  }
}

export function assertCanComment(
  actor: Actor,
  ticket: TicketRef,
  input: { isPublic: boolean; status?: TicketStatus },
) {
  if (ticket.status === 'CLOSED') throw conflict('This ticket is closed; open a follow-up instead');
  if (!isStaff(actor.role)) {
    if (!input.isPublic) throw forbidden('Only agents can add internal notes');
    if (input.status) throw forbidden('Only agents can change status while replying');
  }
}

/** Status the ticket should move to after a comment, mirroring standard helpdesk behaviour. */
export function nextStatusOnComment(
  actor: Actor,
  ticket: TicketRef,
  input: { isPublic: boolean; status?: TicketStatus },
): TicketStatus {
  if (input.status) return input.status;
  if (!input.isPublic) return ticket.status;
  if (isStaff(actor.role)) return ticket.status === 'NEW' ? 'OPEN' : ticket.status;
  // Requester replied — wake the ticket up if it was waiting on them or already solved.
  return ticket.status === 'PENDING' || ticket.status === 'SOLVED' ? 'OPEN' : ticket.status;
}

/** Timestamp bookkeeping that accompanies a status change. */
export function statusTransitionData(from: TicketStatus, to: TicketStatus, now: Date) {
  if (from === to) return {};
  const data: { status: TicketStatus; resolvedAt?: Date | null; closedAt?: Date } = { status: to };
  if (to === 'SOLVED') data.resolvedAt = now;
  else if (to === 'CLOSED') {
    data.closedAt = now;
    if (from !== 'SOLVED') data.resolvedAt = now;
  } else if (from === 'SOLVED') data.resolvedAt = null;
  return data;
}

/** Field-level diff of a patch against the current row, for the audit log. */
export function diffFields(before: Record<string, unknown>, patch: Record<string, unknown>): FieldChanges {
  const changes: FieldChanges = {};
  for (const [key, to] of Object.entries(patch)) {
    if (to === undefined) continue;
    const from = before[key] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from, to };
  }
  return changes;
}
