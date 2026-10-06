# Email-to-ticket

Customers email `support@yourcompany.com` and the email becomes a ticket. Their replies to our notification emails land on the same ticket. Everything goes through **one** pipeline (`apps/api/src/modules/inbound/service.ts`), so email tickets get SLA timers, notifications, audit and realtime exactly like web tickets.

```mermaid
flowchart LR
  C[Customer mail client] -->|sends| MX[(support@ mailbox)]
  MX -->|Option A: provider webhook<br/>SendGrid · Mailgun · SES · Postmark| IN
  MX -->|Option B: IMAP| POLL[worker IMAP poller] -->|raw MIME| IN
  IN["POST /api/inbound/email"] --> P{pipeline}
  P -->|new| T[create ticket]
  P -->|reply| R[add comment]
  P -->|auto-reply / spoof / dup| X[ignore + log]
  T & R --> N[notifications → email with<br/>Reply-To: support@ + threading headers] --> C
```

## Setup

All options need these in `.env`:

```bash
SUPPORT_EMAIL=support@yourcompany.com        # Reply-To on all outgoing mail
INBOUND_EMAIL_SECRET=<openssl rand -hex 24>  # unset = endpoint disabled (404)
MAIL_FROM="Helpdesk <support@yourcompany.com>"
```

### Option A: provider webhook (recommended for production)

Point the provider's inbound route at `https://helpdesk.yourcompany.com/api/inbound/email` and have it send the **raw MIME** message.

| Provider | Configure | Auth |
| --- | --- | --- |
| **SendGrid Inbound Parse** | Tick *"POST the raw, full MIME message"* (sends field `email`) | `https://x:SECRET@host/api/inbound/email` |
| **Mailgun Routes** | Action `forward("https://api:SECRET@host/api/inbound/email/mime")`. The URL must end in `mime` for Mailgun to send the raw message (field `body-mime`) | Basic auth in the URL |
| **AWS SES** | Receipt rule → SNS/Lambda that POSTs the raw message with `Content-Type: message/rfc822` | `Authorization: Bearer SECRET` |
| **Anything else** | POST raw RFC 822 bytes, `Content-Type: message/rfc822` | Bearer / Basic / `?token=` |

### Option B: IMAP polling (simplest in-house; no public URL needed)

Works with Google Workspace, Microsoft 365, or any IMAP mailbox. The worker polls for unseen messages, forwards each to the API, and marks it `\Seen` only once the API has accepted it.

```bash
IMAP_HOST=imap.gmail.com     # or outlook.office365.com
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER=support@yourcompany.com
IMAP_PASS=<app password>     # Gmail: App Password · M365: app password, or enable basic auth for IMAP
IMAP_MAILBOX=INBOX           # folder to watch
IMAP_POLL_SECONDS=30
API_INTERNAL_URL=http://localhost:4000   # how the worker reaches the API
```

Restart the worker. It logs `IMAP polling enabled`.

## How replies find their ticket

Every outgoing email about ticket 42 carries:

```
Message-ID:  <ticket-42.<unique>@yourcompany.com>
References:  <ticket-42@yourcompany.com>
Reply-To:    support@yourcompany.com
Subject:     [#42] New reply on …
Body:        ##- Please type your reply above this line -##
```

Inbound mail is matched in this order:
1. `In-Reply-To` / `References` contain `<ticket-42…>`.
2. `References` match an earlier inbound email's `Message-ID` (the customer followed up on their own message).
3. Subject contains `[#42]`.

The reply text is cleaned by `extractReply()` in `packages/shared/src/email.ts`. It cuts at the reply marker, Gmail/Apple "On … wrote:", Outlook "From:/Sent:" headers, `-- ` signatures and "Sent from my iPhone". New tickets keep their full body, so forwarded emails keep their content.

## Rules (what happens to an email)

| Situation | Result |
| --- | --- |
| Unknown sender, no thread | New ticket. Sender becomes a CUSTOMER and is linked to an Organization whose `domain` matches. They can't log in until invited. |
| Requester replies | Public comment (`via EMAIL`). Reopens PENDING/SOLVED tickets. |
| **Agent replies by email** | **Internal note**, never public. Agent emails may quote internal notes, so agents reply to customers from the UI. |
| Someone else replies with `[#42]` | **New ticket**. Nobody can inject comments into a ticket that isn't theirs. |
| Reply to a CLOSED ticket | New "Follow-up: …" ticket that references the original. |
| Same `Message-ID` again (provider retry) | `DUPLICATE`, no-op. |
| `Auto-Submitted`, `Precedence: bulk/list`, `X-Autoreply`, `List-Id` | Ignored. This stops out-of-office loops. |
| From our own address, `mailer-daemon@`, `noreply@` | Ignored (loop guard). |
| `Authentication-Results` shows `dmarc=fail`, or SPF and DKIM both fail | Ignored (spoofing). |
| Sender's domain not in `INBOUND_ALLOWED_DOMAINS` (if set) | Ignored. |
| More than `INBOUND_MAX_PER_SENDER_PER_HOUR` from one sender | Ignored (flood or loop protection). |
| `INBOUND_AUTO_CREATE_USERS=false` and sender unknown | Ignored. |
| Inline images (signature logos, `cid:`) | Skipped. Real attachments (up to 10, each ≤ `MAX_UPLOAD_MB`) are kept. |

Every email gets a row in `InboundEmail` with its outcome. Agents can see it in the UI under **Admin → Email log**.

Outgoing mail sets `Auto-Submitted: auto-generated` and `X-Auto-Response-Suppress: All`, so well-behaved servers don't auto-reply to us.

## Testing locally

**Webhook path.** Sample emails live in `examples/emails/`:

```bash
SECRET=$(grep ^INBOUND_EMAIL_SECRET= .env | cut -d= -f2)
curl -H "Authorization: Bearer $SECRET" -H "Content-Type: message/rfc822" \
     --data-binary @examples/emails/new-ticket.eml localhost:4000/api/inbound/email
# → {"status":"PROCESSED","reason":"created","ticketNumber":…}
```

To test a reply, open the confirmation email in Mailpit (http://localhost:8025) and copy its `Message-ID`. Then send an `.eml` with `In-Reply-To: <that id>` from the same sender.

**IMAP path**, with a local GreenMail server:

```bash
docker compose --profile imap up -d greenmail
# in .env:
IMAP_HOST=localhost
IMAP_PORT=3143
IMAP_SECURE=false
IMAP_USER=support@helpdesk.local
IMAP_PASS=support
# restart `npm run dev`, then send real SMTP mail into the mailbox:
node -e 'require("nodemailer").createTransport({host:"localhost",port:3025}).sendMail({from:"dave@acme.test",to:"support@helpdesk.local",subject:"Test via IMAP",text:"hello"}).then(()=>console.log("sent"))'
```

Within `IMAP_POLL_SECONDS` the ticket appears.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Endpoint returns 404 | `INBOUND_EMAIL_SECRET` isn't set on the **API**. |
| 401 | The secret the provider or worker sends doesn't match. |
| Email arrived but no ticket | **Admin → Email log** shows the reason (auto-reply, DMARC, rate limited…). |
| Replies create new tickets instead of threading | The client stripped headers *and* the `[#N]` subject token. Or the replier isn't the requester (by design). |
| IMAP: `Unexpected close` / auth errors in worker logs | Wrong host, port or TLS settings, or the account needs an app password. Gmail and M365 often block plain passwords. |
| Customer's quoted text shows up in the ticket | Their client used an unusual quote header. Add a pattern to `extractReply()` with a test in `email.test.ts`. |

## Not yet supported

CC'd people as ticket followers, HTML rendering of email bodies (we store plain text), per-group inbound addresses (`billing@` → Billing group), Mailgun HMAC signature verification, and S3 storage for attachments.
