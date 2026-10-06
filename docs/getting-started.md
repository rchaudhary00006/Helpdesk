# Getting started

Goal: the app running locally with demo data, in about 10 minutes.

## Prerequisites

| Tool | Version | Check |
| --- | --- | --- |
| Node.js | **18.18+** (20 LTS recommended) | `node -v` |
| npm | 9+ | `npm -v` |
| Docker + Compose v2 | any recent | `docker compose version` |

These ports must be free: **3000** (web), **4000** (API), **5432** (Postgres), **6379** (Redis), **1025/8025** (Mailpit).

## 1. Install and configure

```bash
git clone <repo-url> helpdesk && cd helpdesk
cp .env.example .env
```

Open `.env` and set two secrets (everything else works as-is for local dev):

```bash
openssl rand -base64 48   # → paste into JWT_SECRET
openssl rand -hex 24      # → paste into INBOUND_EMAIL_SECRET (enables email-to-ticket)
```

Then:

```bash
npm install        # installs all workspaces and generates the Prisma client
npm run setup      # starts Docker services, applies migrations, seeds demo data
```

## 2. Run it

```bash
npm run dev        # API + worker + web, with hot reload, in one terminal
```

| URL | What |
| --- | --- |
| http://localhost:3000 | The app |
| http://localhost:8025 | **Mailpit**: every email the app sends lands here (nothing goes to real inboxes) |
| http://localhost:4000/api/health | API health check (DB + Redis) |

## 3. Log in

All demo users have the password **`Password123!`**. The login page has one-click buttons.

| Email | Role | Notes |
| --- | --- | --- |
| `admin@helpdesk.local` | Admin | Gets SLA escalations for unassigned tickets |
| `alice@helpdesk.local` | Agent | Member of *L1 Support* |
| `bob@helpdesk.local` | Agent | Member of *L1 Support* and *DevOps* |
| `carol@acme.test` | Customer | Acme Corp |
| `dave@acme.test` | Customer | Acme Corp |

**Try this:** open an incognito window as Carol and a normal one as Alice. Create a ticket as Carol, then assign it, add an internal note and reply as Alice. Carol's window updates live, never shows the note, and an email appears in Mailpit.

**Try SLA settings:** log in as Admin → *SLA & hours*. Change working hours or add a holiday and watch the *"If a ticket came in now"* preview move.

**Try email-to-ticket:**

```bash
SECRET=$(grep ^INBOUND_EMAIL_SECRET= .env | cut -d= -f2)
curl -H "Authorization: Bearer $SECRET" -H "Content-Type: message/rfc822" \
     --data-binary @examples/emails/new-ticket.eml http://localhost:4000/api/inbound/email
```

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Run all three apps with hot reload |
| `npm test` | Unit tests (Vitest) in `packages/shared` and `apps/api` |
| `npm run typecheck` | `tsc` across every workspace. CI-equivalent, so run it before pushing |
| `npm run build` | Production builds of all apps |
| `npm run db:studio` | Prisma Studio, a GUI for the database |
| `npm run db:seed` | Re-run the seed (idempotent) |
| `npm run infra:up` / `infra:down` | Start / stop the Docker services |

Run a single app: `npm run dev -w @helpdesk/api` (or `@helpdesk/worker`, `@helpdesk/web`).

### Reset everything to a clean seed

```bash
docker compose down -v   # ⚠ deletes the local DB + Redis volumes
npm run setup
```

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Invalid environment configuration: { JWT_SECRET: [...] }` on startup | A required `.env` value is missing or too short. The message names it. |
| `EADDRINUSE :::4000` (or 3000/5432) | Something else is on that port. Stop it or change `API_PORT` / the compose port mapping. |
| `npm run setup` hangs at "Waiting" | Docker is slow pulling images on first run. `docker compose ps` shows progress. |
| Prisma: `Can't reach database server` | `npm run infra:up`, then check `docker compose ps` shows postgres as *healthy*. |
| Redirect loop or stuck on login | Clear cookies for `localhost:3000`. (The app already clears invalid sessions on 401, so this should be rare.) |
| Changes to `schema.prisma` not reflected in types | `npm run generate -w @helpdesk/db` (migrations do this automatically). |
| Next.js warns about "non-standard NODE_ENV" | Don't put `NODE_ENV` in `.env`. Next.js manages it. |
| No emails in Mailpit | Is the **worker** running? Emails are sent by background jobs, not the API. |
| Realtime updates don't arrive | Browser console → is the WebSocket to `:4000` connected? `NEXT_PUBLIC_SOCKET_URL` must point at the API. |

Next: [Architecture](./architecture.md)
