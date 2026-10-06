# Helpdesk

In-house incident & ticket management (Zendesk-style): web and email tickets, assignment, internal notes, SLA timers with escalation, realtime updates, notifications and a full audit trail.

**Stack:** Next.js 15 · Express 5 · PostgreSQL + Prisma · Redis + BullMQ · Socket.IO · TypeScript (npm workspaces)

## Quick start

```bash
cp .env.example .env     # set JWT_SECRET (openssl rand -base64 48) and INBOUND_EMAIL_SECRET (openssl rand -hex 24)
npm install
npm run setup            # docker services + migrations + demo data
npm run dev              # web :3000 · api :4000 · worker
```

Open http://localhost:3000 and log in with a demo account (password `Password123!`). Outgoing emails appear in Mailpit at http://localhost:8025.

## Documentation

| | |
| --- | --- |
| [Overview](docs/README.md) | What it is, core concepts |
| [Getting started](docs/getting-started.md) | Setup, demo accounts, commands, troubleshooting |
| [Architecture](docs/architecture.md) | Processes, request flow, data model, design decisions |
| [Development guide](docs/development-guide.md) | Conventions, recipes (add a field, endpoint, job), testing, PR checklist |
| [API reference](docs/api.md) | REST endpoints, errors, realtime events |
| [Email-to-ticket](docs/email-to-ticket.md) | Webhook / IMAP setup, threading, safety rules |
| [SLA & business hours](docs/sla.md) | Targets, working hours, holidays, how due dates are computed |
| [Configuration & deployment](docs/configuration.md) | Every env var, production checklist |

## Repository layout

```
apps/web          Next.js UI
apps/api          Express REST API + Socket.IO
apps/worker       Background jobs: email, SLA, automations, IMAP
packages/db       Prisma schema, migrations, seed
packages/shared   Zod schemas, enums, types, SLA + email helpers (shared by all apps)
examples/emails   Sample .eml files for testing email-to-ticket
docs/             Project documentation
```

## Roadmap

- [x] Tickets, comments & internal notes, attachments, assignment, groups
- [x] SLA timers with escalation, auto-close automation, audit log
- [x] Realtime updates and in-app + email notifications
- [x] Email-to-ticket (provider webhook + IMAP polling, threading, loop/spoof protection)
- [x] SLA business hours, split shifts, holidays and time zones, with an admin UI
- [ ] Pause SLA while Pending / On-hold; per-group schedules
- [ ] Admin UI: users & groups; customer invite / password reset; SSO (OIDC)
- [ ] Transactional outbox for domain events; SLA timer resync if Redis is lost
- [ ] Optimistic concurrency on ticket updates
- [ ] Macros, trigger builder, custom views, CSAT, reporting
- [ ] Email: CC followers, per-group inbound addresses, Mailgun signature verification
- [ ] S3 attachments; full-text search over comments
- [ ] Dockerfiles + CI pipeline; integration tests against a test DB
