# API reference

Base URL: `/api`. In the browser, call it through the Next.js origin (`http://localhost:3000/api/...`), which proxies to the API.

**Auth:** session cookie `hd_session` (httpOnly JWT, 7 days), set by `POST /auth/login`.
**Errors** always look like:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request", "issues": { "fieldErrors": { "subject": ["..."] } } } }
```

| Status | Meaning |
| --- | --- |
| 400 | Validation failed (`issues` has per-field messages) |
| 401 | Not logged in / session expired |
| 403 | Logged in but not allowed (e.g. customer editing priority) |
| 404 | Not found **or not visible to you** (deliberately the same) |
| 409 | Conflict, e.g. modifying a CLOSED ticket |
| 429 | Login rate limit (20 per 15 min per IP) |

`:ref` below accepts the ticket number (`42`) or its id.

## Auth

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| POST | `/auth/login` | `{ email, password }` | Sets cookie, returns `Me` |
| POST | `/auth/logout` | | Clears cookie |
| GET | `/auth/me` | | Current user, org, groups |

## Tickets

| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/tickets` | all | Customers only see their own. Query params below |
| GET | `/tickets/counts` | staff | Sidebar counts: unassigned, mine, open, pending, solved, breached |
| POST | `/tickets` | all | `{ subject, description, priority?, type?, tags?, attachmentIds? }` |
| GET | `/tickets/:ref` | all | Includes comments. Internal notes are omitted for customers |
| PATCH | `/tickets/:ref` | all* | Any of `{ subject, status, priority, type, assigneeId, groupId, tags }`. *Customers may only send `{ status: "SOLVED" }` |
| POST | `/tickets/:ref/comments` | all | `{ body, isPublic?, status?, attachmentIds? }`. `isPublic:false` and `status` are staff-only |
| GET | `/tickets/:ref/audit` | staff | Activity log, newest first |

**`GET /tickets` query params:**

| Param | Example | Notes |
| --- | --- | --- |
| `status` | `status=NEW&status=OPEN` | Repeatable |
| `priority` | `URGENT` | |
| `assignee` | `me`, `unassigned`, `<userId>` | |
| `groupId` | | |
| `breached` | `true` | Any SLA breached |
| `q` | `printer`, `#42`, `billing` | Subject (contains), exact number, or exact tag |
| `sort` / `order` | `updatedAt` · `createdAt` · `priority` · `resolutionDueAt` / `asc` · `desc` | |
| `page` / `pageSize` | `1` / `25` | `pageSize` max 100 |

Response: `{ data: TicketListItem[], total, page, pageSize }`.

**Automatic behaviour:**
- Assigning a NEW ticket makes it OPEN.
- An agent's public reply on NEW makes it OPEN and stamps `firstRespondedAt`.
- A requester reply on PENDING or SOLVED reopens it to OPEN.
- Changing priority recomputes SLA targets, measured from creation time.

## Attachments

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/attachments` | `multipart/form-data`, field `file`. Max `MAX_UPLOAD_MB`. Returns `{ id, fileName, mimeType, size }`. Pass the `id` in `attachmentIds` when creating a ticket or comment |
| GET | `/attachments/:id` | Always a download. Same visibility as the ticket and comment |

Each upload can be attached only once, and only by its uploader. Unused uploads are deleted after 24 h.

## Users, groups, notifications

| Method | Path | Who |
| --- | --- | --- |
| GET | `/users/agents` | staff |
| GET | `/groups` | staff |
| GET | `/notifications` | all. `{ data: last 30, unread }` |
| POST | `/notifications/:id/read` | all |
| POST | `/notifications/read-all` | all |

## Inbound email

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/inbound/email` | `INBOUND_EMAIL_SECRET` as Bearer, Basic password, or `?token=` | Raw MIME (`message/rfc822`) or multipart field `email` / `body-mime`. See [email-to-ticket.md](./email-to-ticket.md) |
| GET | `/inbound/emails` | staff session | Last 100 inbound emails with outcome |

Response: `{ status: "PROCESSED" | "IGNORED" | "DUPLICATE", reason, ticketNumber? }`. These are always 200, so providers don't retry handled mail. A 5xx means a transient failure, which the sender should retry.

## Health

`GET /health` → `200 { ok: true, db: "fulfilled", redis: "fulfilled" }`, or `503` if a dependency is down.

## Realtime (Socket.IO)

Connect to `NEXT_PUBLIC_SOCKET_URL` with credentials (the session cookie authenticates).

| Direction | Event | Payload |
| --- | --- | --- |
| client → server | `ticket:join` / `ticket:leave` | `ticketId` (permission-checked) |
| server → client | `ticket:changed` | `{ ticketId }`. Refetch that ticket |
| server → client | `tickets:changed` | `{ ticketId? }`. Refetch lists and counts |
| server → client | `notification:new` | `{ type }`. Refetch notifications |
