import type { Prisma } from '@helpdesk/db';

export const userSelect = { id: true, name: true, email: true, role: true } satisfies Prisma.UserSelect;

export const ticketListInclude = {
  requester: { select: userSelect },
  assignee: { select: userSelect },
  group: { select: { id: true, name: true } },
} satisfies Prisma.TicketInclude;

export const commentSelect = {
  id: true,
  body: true,
  isPublic: true,
  via: true,
  createdAt: true,
  author: { select: userSelect },
  attachments: { select: { id: true, fileName: true, mimeType: true, size: true } },
} satisfies Prisma.CommentSelect;

export type TicketWithRefs = Prisma.TicketGetPayload<{ include: typeof ticketListInclude }>;
