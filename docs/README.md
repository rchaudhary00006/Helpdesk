# Helpdesk documentation

Helpdesk is our in-house incident and ticket management tool, a lightweight Zendesk. Customers and staff raise tickets through the web app or by email. Agents triage, assign and reply. SLA timers, notifications and an audit trail run automatically.

## Start here

| If you want to… | Read |
| --- | --- |
| Get it running on your machine (≈10 min) | [Getting started](./getting-started.md) |
| Understand how the pieces fit together | [Architecture](./architecture.md) |
| Build a feature, write tests, add a migration | [Development guide](./development-guide.md) |
| Look up an endpoint | [API reference](./api.md) |
| Set up or debug email-to-ticket | [Email-to-ticket](./email-to-ticket.md) |
| Configure env vars / deploy to production | [Configuration & deployment](./configuration.md) |

## The 60-second tour

```
apps/web      Next.js 15 UI (agents + customers)         → http://localhost:3000
apps/api      Express 5 REST API + Socket.IO              → http://localhost:4000
apps/worker   BullMQ jobs: emails, SLA timers, automations, IMAP polling
packages/db       Prisma schema, migrations, seed
packages/shared   Zod schemas, enums, types, email + SLA helpers (used by ALL apps)
```

**Stack:** TypeScript everywhere · Next.js 15 / React 19 · TanStack Query · Tailwind 3 · Express 5 · Prisma 6 + PostgreSQL 16 · BullMQ + Redis 7 · Socket.IO · Vitest · npm workspaces.

## Core concepts

- **Ticket.** Has a human number (`#42`), status, priority, type, requester, assignee, group and tags. The first comment is the description.
- **Comment.** Either a *public reply* (the customer sees it) or an *internal note* (staff only; the API never sends these to customers).
- **Status lifecycle:** `NEW → OPEN → PENDING / ON_HOLD → SOLVED → CLOSED`. CLOSED is read-only and set automatically after a ticket has been SOLVED for a while.
- **SLA.** Each priority has first-response and resolution targets. A breach flags the ticket, writes an audit entry and escalates: assignee, then their group, then admins.
- **Roles.** `CUSTOMER` (own tickets only), `AGENT` and `ADMIN` (everything).
- **Channels.** Tickets and comments come from `WEB` or `EMAIL`.

## Status

The MVP is feature-complete and covered by unit tests plus a browser E2E pass. See the roadmap in the root [README](../README.md#roadmap) for what's next.
