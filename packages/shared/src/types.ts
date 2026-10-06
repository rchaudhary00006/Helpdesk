// API response shapes (dates are ISO strings over the wire).
import type { Channel, Priority, Role, TicketStatus, TicketType } from './enums';

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Me extends UserSummary {
  organization: { id: string; name: string } | null;
  groups: { id: string; name: string }[];
}

export interface GroupSummary {
  id: string;
  name: string;
}

export interface AttachmentDto {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface CommentDto {
  id: string;
  body: string;
  isPublic: boolean;
  via: Channel;
  createdAt: string;
  author: UserSummary;
  attachments: AttachmentDto[];
}

export interface TicketListItem {
  id: string;
  number: number;
  subject: string;
  status: TicketStatus;
  priority: Priority;
  type: TicketType;
  channel: Channel;
  tags: string[];
  requester: UserSummary;
  assignee: UserSummary | null;
  group: GroupSummary | null;
  firstResponseDueAt: string | null;
  resolutionDueAt: string | null;
  firstRespondedAt: string | null;
  firstResponseBreached: boolean;
  resolutionBreached: boolean;
  /** SLA clock counts working hours only (vs 24/7). */
  slaBusinessHours: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketDetail extends TicketListItem {
  resolvedAt: string | null;
  closedAt: string | null;
  organization: { id: string; name: string } | null;
  comments: CommentDto[];
}

export interface AuditLogDto {
  id: string;
  action: string;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  createdAt: string;
  actor: UserSummary | null;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string | null;
  ticketId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface InboundEmailDto {
  id: string;
  messageId: string;
  fromAddress: string;
  subject: string;
  status: 'PROCESSING' | 'PROCESSED' | 'IGNORED' | 'FAILED';
  reason: string | null;
  receivedAt: string;
  ticket: { id: string; number: number } | null;
}

export interface HolidayDto {
  id: string;
  date: string;
  name: string;
}

export interface BusinessScheduleDto {
  id: string;
  name: string;
  timezone: string;
  intervals: { day: number; start: string; end: string }[];
  holidays: HolidayDto[];
}

export interface SlaPolicyDto {
  id: string;
  priority: Priority;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  scheduleId: string | null;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TicketCounts {
  unassigned: number;
  mine: number;
  open: number;
  pending: number;
  solved: number;
  breached: number;
}
