import type {
  AttachmentDto,
  AuditLogDto,
  BusinessScheduleDto,
  BusinessScheduleInput,
  HolidayDto,
  HolidayInput,
  SlaPolicyDto,
  UpdateSlaPolicyInput,
  CommentDto,
  CreateCommentInput,
  CreateTicketInput,
  GroupSummary,
  InboundEmailDto,
  LoginInput,
  Me,
  NotificationDto,
  Paginated,
  TicketCounts,
  TicketDetail,
  TicketListItem,
  UpdateTicketInput,
  UserSummary,
} from '@helpdesk/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public issues?: { fieldErrors?: Record<string, string[]> },
  ) {
    super(message);
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & { json?: unknown; body?: BodyInit };

let redirecting = false;

async function request<T>(path: string, { json, headers, ...init }: RequestOptions = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: json !== undefined ? { 'Content-Type': 'application/json', ...headers } : headers,
    body: json !== undefined ? JSON.stringify(json) : init.body,
  });

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    // Session expired/invalid: clear the cookie first, otherwise middleware bounces /login back to the app.
    if (res.status === 401 && !path.startsWith('/auth/') && !redirecting) {
      redirecting = true;
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}`;
    }
    throw new ApiError(
      res.status,
      data?.error?.code ?? 'UNKNOWN',
      data?.error?.message ?? res.statusText,
      data?.error?.issues,
    );
  }
  return data as T;
}

export const api = {
  login: (input: LoginInput) => request<Me>('/auth/login', { method: 'POST', json: input }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  me: () => request<Me>('/auth/me'),

  listTickets: (params: URLSearchParams) => request<Paginated<TicketListItem>>(`/tickets?${params}`),
  ticketCounts: () => request<TicketCounts>('/tickets/counts'),
  getTicket: (ref: string) => request<TicketDetail>(`/tickets/${encodeURIComponent(ref)}`),
  createTicket: (input: CreateTicketInput) => request<TicketListItem>('/tickets', { method: 'POST', json: input }),
  updateTicket: (ref: string, patch: UpdateTicketInput) =>
    request<TicketDetail>(`/tickets/${encodeURIComponent(ref)}`, { method: 'PATCH', json: patch }),
  addComment: (ref: string, input: CreateCommentInput) =>
    request<CommentDto>(`/tickets/${encodeURIComponent(ref)}/comments`, { method: 'POST', json: input }),
  auditLog: (ref: string) => request<AuditLogDto[]>(`/tickets/${encodeURIComponent(ref)}/audit`),

  agents: () => request<UserSummary[]>('/users/agents'),
  groups: () => request<GroupSummary[]>('/groups'),

  notifications: () => request<{ data: NotificationDto[]; unread: number }>('/notifications'),
  markNotificationRead: (id: string) => request<void>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => request<void>('/notifications/read-all', { method: 'POST' }),

  inboundEmails: () => request<InboundEmailDto[]>('/inbound/emails'),

  slaPolicies: () => request<SlaPolicyDto[]>('/sla/policies'),
  updateSlaPolicy: (priority: string, input: UpdateSlaPolicyInput) =>
    request<SlaPolicyDto>(`/sla/policies/${priority}`, { method: 'PUT', json: input }),
  schedules: () => request<BusinessScheduleDto[]>('/sla/schedules'),
  createSchedule: (input: BusinessScheduleInput) =>
    request<BusinessScheduleDto>('/sla/schedules', { method: 'POST', json: input }),
  updateSchedule: (id: string, input: BusinessScheduleInput) =>
    request<BusinessScheduleDto>(`/sla/schedules/${id}`, { method: 'PUT', json: input }),
  addHoliday: (scheduleId: string, input: HolidayInput) =>
    request<HolidayDto>(`/sla/schedules/${scheduleId}/holidays`, { method: 'POST', json: input }),
  removeHoliday: (scheduleId: string, holidayId: string) =>
    request<void>(`/sla/schedules/${scheduleId}/holidays/${holidayId}`, { method: 'DELETE' }),

  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<AttachmentDto>('/attachments', { method: 'POST', body: form });
  },
};

export const attachmentUrl = (id: string) => `/api/attachments/${id}`;
