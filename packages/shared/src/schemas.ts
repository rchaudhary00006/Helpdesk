import { z } from 'zod';
import { PRIORITIES, TICKET_STATUSES, TICKET_TYPES } from './enums';
import { isValidTimeZone } from './sla';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

const tag = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9_-]+$/, 'Tags may only contain letters, numbers, - and _');

export const createTicketSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(1).max(20_000),
  priority: z.enum(PRIORITIES).default('NORMAL'),
  type: z.enum(TICKET_TYPES).default('QUESTION'),
  tags: z.array(tag).max(20).default([]),
  attachmentIds: z.array(z.string()).max(10).default([]),
});
export type CreateTicketInput = z.input<typeof createTicketSchema>;

export const updateTicketSchema = z
  .object({
    subject: z.string().trim().min(3).max(200),
    status: z.enum(TICKET_STATUSES),
    priority: z.enum(PRIORITIES),
    type: z.enum(TICKET_TYPES),
    assigneeId: z.string().nullable(),
    groupId: z.string().nullable(),
    tags: z.array(tag).max(20),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No fields to update');
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(20_000),
  isPublic: z.boolean().default(true),
  /** Optionally change status in the same action ("Submit as Pending"). */
  status: z.enum(TICKET_STATUSES).optional(),
  attachmentIds: z.array(z.string()).max(10).default([]),
});
export type CreateCommentInput = z.input<typeof createCommentSchema>;

export const TICKET_SORTS = ['updatedAt', 'createdAt', 'priority', 'resolutionDueAt'] as const;

export const listTicketsQuerySchema = z.object({
  status: z
    .union([z.enum(TICKET_STATUSES), z.array(z.enum(TICKET_STATUSES))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  priority: z.enum(PRIORITIES).optional(),
  /** "me", "unassigned", or a user id */
  assignee: z.string().optional(),
  groupId: z.string().optional(),
  /** Only tickets that have breached any SLA target. */
  breached: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  q: z.string().trim().max(200).optional(),
  sort: z.enum(TICKET_SORTS).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;

// ---- SLA & business hours (admin)

const hhmm = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, 'Use HH:MM (24h)');
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export const businessIntervalSchema = z
  .object({ day: z.number().int().min(0).max(6), start: hhmm, end: hhmm })
  .refine((i) => toMin(i.start) < toMin(i.end), { message: 'End must be after start', path: ['end'] });

export const businessScheduleSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    timezone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
    intervals: z.array(businessIntervalSchema).min(1, 'Add at least one working period').max(50),
  })
  .refine(
    (s) =>
      s.intervals.every((a, i) =>
        s.intervals.every(
          (b, j) => i === j || a.day !== b.day || toMin(a.end) <= toMin(b.start) || toMin(b.end) <= toMin(a.start),
        ),
      ),
    { message: 'Working periods on the same day overlap', path: ['intervals'] },
  );
export type BusinessScheduleInput = z.infer<typeof businessScheduleSchema>;

export const holidaySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    // Round-trip check: Date.parse silently rolls "2026-02-30" over to March 2.
    .refine((d) => {
      const t = Date.parse(`${d}T00:00:00Z`);
      return !Number.isNaN(t) && new Date(t).toISOString().startsWith(d);
    }, 'Invalid date'),
  name: z.string().trim().min(1).max(80),
});
export type HolidayInput = z.infer<typeof holidaySchema>;

const MAX_SLA_MINUTES = 60 * 24 * 90;
export const updateSlaPolicySchema = z
  .object({
    firstResponseMinutes: z.number().int().min(1).max(MAX_SLA_MINUTES),
    resolutionMinutes: z.number().int().min(1).max(MAX_SLA_MINUTES),
    /** null = 24/7 calendar time */
    scheduleId: z.string().nullable(),
  })
  .refine((p) => p.firstResponseMinutes <= p.resolutionMinutes, {
    message: 'First response target must not exceed resolution target',
    path: ['firstResponseMinutes'],
  });
export type UpdateSlaPolicyInput = z.infer<typeof updateSlaPolicySchema>;
