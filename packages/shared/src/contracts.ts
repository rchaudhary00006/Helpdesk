import type { SlaMetric } from './enums';

// ---- BullMQ queues (API produces, worker consumes) ----

export const QUEUES = {
  notifications: 'notifications',
  /** One job per recipient so a single bad address retries alone. */
  email: 'email',
  sla: 'sla',
  automations: 'automations',
} as const;

export interface EmailJob {
  to: string;
  subject: string;
  text: string;
  ticketNumber?: number;
}

export type NotifyChannel = 'inapp' | 'email';

export interface NotifyJob {
  recipientIds: string[];
  type: string;
  title: string;
  body?: string;
  ticketId?: string;
  /** Used for "[#1042]" subject prefixes and email threading headers. */
  ticketNumber?: number;
  channels: NotifyChannel[];
}

export interface SlaCheckJob {
  ticketId: string;
  metric: SlaMetric;
  /** ISO timestamp the job was scheduled for; lets the worker ignore stale jobs after a reschedule. */
  dueAt: string;
}

/** BullMQ custom job ids must not contain ":" */
export const slaJobId = (ticketId: string, metric: SlaMetric) => `sla_${ticketId}_${metric}`;

// ---- Socket.IO ----
// Events only carry ids. Clients refetch over HTTP so permission checks (e.g. internal
// notes hidden from customers) live in exactly one place: the REST API.

export const SOCKET_EVENTS = {
  joinTicket: 'ticket:join',
  leaveTicket: 'ticket:leave',
  ticketChanged: 'ticket:changed',
  ticketsChanged: 'tickets:changed',
  notification: 'notification:new',
} as const;

export const rooms = {
  user: (id: string) => `user:${id}`,
  ticket: (id: string) => `ticket:${id}`,
  staff: 'staff',
} as const;
