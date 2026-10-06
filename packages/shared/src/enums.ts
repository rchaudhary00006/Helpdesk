// Keep these in sync with the enums in packages/db/prisma/schema.prisma.
// Declared here (not imported from Prisma) so the browser bundle never pulls in the Prisma client.

export const ROLES = ['ADMIN', 'AGENT', 'CUSTOMER'] as const;
export type Role = (typeof ROLES)[number];

export const TICKET_STATUSES = ['NEW', 'OPEN', 'PENDING', 'ON_HOLD', 'SOLVED', 'CLOSED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TICKET_TYPES = ['QUESTION', 'INCIDENT', 'PROBLEM', 'TASK'] as const;
export type TicketType = (typeof TICKET_TYPES)[number];

export const CHANNELS = ['WEB', 'EMAIL', 'API'] as const;
export type Channel = (typeof CHANNELS)[number];

export const SLA_METRICS = ['FIRST_RESPONSE', 'RESOLUTION'] as const;
export type SlaMetric = (typeof SLA_METRICS)[number];

export const STAFF_ROLES: readonly Role[] = ['ADMIN', 'AGENT'];
export const isStaff = (role: Role) => STAFF_ROLES.includes(role);

/** Statuses where the ticket is still "in flight" and SLA clocks matter. */
export const ACTIVE_STATUSES: readonly TicketStatus[] = ['NEW', 'OPEN', 'PENDING', 'ON_HOLD'];

export const STATUS_LABELS: Record<TicketStatus, string> = {
  NEW: 'New',
  OPEN: 'Open',
  PENDING: 'Pending',
  ON_HOLD: 'On-hold',
  SOLVED: 'Solved',
  CLOSED: 'Closed',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const TYPE_LABELS: Record<TicketType, string> = {
  QUESTION: 'Question',
  INCIDENT: 'Incident',
  PROBLEM: 'Problem',
  TASK: 'Task',
};
