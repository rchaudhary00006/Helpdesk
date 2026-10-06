import { ACTIVE_STATUSES, type TicketCounts, type TicketStatus } from '@helpdesk/shared';

export interface View {
  id: string;
  label: string;
  params: Record<string, string | readonly TicketStatus[]>;
  countKey?: keyof TicketCounts;
}

/** Saved views — the agent's primary navigation, like Zendesk's left rail. */
export const STAFF_VIEWS: View[] = [
  { id: 'unassigned', label: 'Unassigned', params: { status: ACTIVE_STATUSES, assignee: 'unassigned' }, countKey: 'unassigned' },
  { id: 'mine', label: 'My open tickets', params: { status: ACTIVE_STATUSES, assignee: 'me' }, countKey: 'mine' },
  { id: 'open', label: 'All open', params: { status: ['NEW', 'OPEN'] }, countKey: 'open' },
  { id: 'breached', label: 'SLA breached', params: { status: ACTIVE_STATUSES, breached: 'true' }, countKey: 'breached' },
  { id: 'pending', label: 'Pending', params: { status: ['PENDING'] }, countKey: 'pending' },
  { id: 'solved', label: 'Recently solved', params: { status: ['SOLVED'] }, countKey: 'solved' },
  { id: 'all', label: 'All tickets', params: {} },
];

export const CUSTOMER_VIEWS: View[] = [
  { id: 'all', label: 'My requests', params: {} },
  { id: 'active', label: 'Open requests', params: { status: ACTIVE_STATUSES } },
  { id: 'solved', label: 'Solved', params: { status: ['SOLVED', 'CLOSED'] } },
];

export function viewToParams(view: View) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(view.params)) {
    if (typeof v === 'string') p.set(k, v);
    else v.forEach((s) => p.append(k, s));
  }
  return p;
}
