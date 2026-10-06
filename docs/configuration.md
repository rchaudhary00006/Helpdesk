# Configuration & deployment

All apps read the root `.env` in development (loaded by `dotenv-cli` in the npm scripts). In production, set real environment variables per process. The API and worker validate their config at boot and **exit with a clear message** if something is missing or invalid.

> Never put `NODE_ENV` in `.env`. Next.js manages it, and production process managers set `NODE_ENV=production`.

## Environment reference

### Shared

| Variable | Used by | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | api, worker, db | (required) | Postgres connection string |
| `REDIS_URL` | api, worker | (required) | BullMQ, Socket.IO adapter |
| `WEB_ORIGIN` | api, worker | (required) | Public URL of the web app. CORS for sockets and links in emails |
| `UPLOAD_DIR` | api, worker | `../../storage/uploads` | Relative to the app dir. Must be the **same** volume for both |
| `LOG_LEVEL` | api, worker | `info` | Pino level |

### API (`apps/api`)

| Variable | Default | Notes |
| --- | --- | --- |
| `API_PORT` | `4000` | |
| `JWT_SECRET` | (required, ≥32 chars) | `openssl rand -base64 48`. Rotating it logs everyone out |
| `MAX_UPLOAD_MB` | `15` | Per file |
| `INBOUND_EMAIL_SECRET` | unset → inbound disabled | ≥24 chars |
| `INBOUND_ALLOWED_DOMAINS` | empty = anyone | e.g. `acme.com,partner.io` |
| `INBOUND_AUTO_CREATE_USERS` | `true` | Create customers for unknown senders |
| `INBOUND_MAX_PER_SENDER_PER_HOUR` | `20` | Loop and flood guard |
| `MAIL_FROM`, `SUPPORT_EMAIL` | | Our own addresses. Inbound mail from them is ignored |

### Worker (`apps/worker`)

| Variable | Default | Notes |
| --- | --- | --- |
| `SMTP_HOST` / `SMTP_PORT` | (required) / `1025` | Port 465 enables TLS automatically |
| `SMTP_USER` / `SMTP_PASS` | | Leave empty for Mailpit |
| `MAIL_FROM` | (required) | `"Helpdesk <support@yourco.com>"`. Its domain is used in threading Message-IDs |
| `SUPPORT_EMAIL` | | Reply-To address. When set, emails include the "reply above this line" marker |
| `AUTO_CLOSE_AFTER_HOURS` | `96` | SOLVED → CLOSED |
| `API_INTERNAL_URL` | `http://localhost:4000` | Used by the IMAP poller |
| `INBOUND_EMAIL_SECRET` | | Must match the API's value (for IMAP forwarding) |
| `IMAP_HOST` … `IMAP_POLL_SECONDS` | | See [email-to-ticket.md](./email-to-ticket.md#option-b-imap-polling-simplest-in-house-no-public-url-needed) |

### Web (`apps/web`)

| Variable | Default | Notes |
| --- | --- | --- |
| `API_INTERNAL_URL` | `http://localhost:4000` | Where Next proxies `/api/*`. Read at **build** time (rewrites are compiled in) |
| `NEXT_PUBLIC_SOCKET_URL` | `http://localhost:4000` | Socket.IO endpoint the browser connects to. Baked in at **build** time |

## Production checklist

**Topology.** Put everything behind one domain with a reverse proxy (nginx, Caddy, ALB):

```
https://helpdesk.yourco.com/            → web   (Next.js, `npm run start -w @helpdesk/web`)
https://helpdesk.yourco.com/api/        → web   (it proxies to the API internally)
https://helpdesk.yourco.com/socket.io/  → api   (WebSocket upgrade enabled!)
```

With this layout the session cookie, API calls and websocket all share one origin. Build web with `NEXT_PUBLIC_SOCKET_URL=https://helpdesk.yourco.com`.

**Before first deploy**

- [ ] `NODE_ENV=production` for all processes. This enables the `Secure` cookie flag (HTTPS required) and JSON logs.
- [ ] Strong, unique `JWT_SECRET` and `INBOUND_EMAIL_SECRET` stored in your secret manager
- [ ] `WEB_ORIGIN` set to the public HTTPS URL
- [ ] Real SMTP provider (SES, SendGrid, Postmark…). Configure **SPF, DKIM and DMARC** for the `MAIL_FROM` domain, or notifications land in spam
- [ ] Managed Postgres with automated backups
- [ ] Redis with **persistence (AOF)**. Scheduled SLA checks and queued emails live in Redis
- [ ] `UPLOAD_DIR` on a persistent volume shared by API and worker (S3 support is on the roadmap)
- [ ] Health check: `GET /api/health` (503 when DB or Redis is down)

**Every release**

```bash
npm ci
npm run build
npm run db:deploy     # applies pending migrations; run once per release, before starting new pods
# then start: node apps/api/dist/index.js · node apps/worker/dist/index.js · npm run start -w @helpdesk/web
```

**Scaling**

- API and web: stateless, so scale horizontally. Socket.IO broadcasts across replicas through the Redis adapter. Enable sticky sessions only if you allow long-polling (the client uses websocket-only by default).
- Worker: scale horizontally. Jobs are distributed, recurring schedules are upserted idempotently, and SLA and inbound processing are idempotent.
- Processes drain gracefully on `SIGTERM` (in-flight requests and jobs finish, with a 10 s cap on the API).

**Know before you go**

- If Redis data is lost, pending SLA timers are lost too, and existing tickets won't breach until their priority changes. A resync job is on the roadmap.
- Email-created customers have unusable passwords until an invite or reset flow exists (roadmap).
