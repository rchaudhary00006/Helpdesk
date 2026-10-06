import { z } from 'zod';
import { PRIORITIES, TICKET_STATUSES, TICKET_TYPES } from './enums';

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
