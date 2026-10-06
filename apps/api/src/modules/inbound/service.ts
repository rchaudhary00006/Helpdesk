/**
 * Email-to-ticket ingestion. Every inbound source (provider webhook, IMAP poller) ends up here
 * with a raw MIME message, so threading/safety rules live in exactly one place.
 *
 * Ingestion goes through the normal ticket service, so SLA timers, notifications, realtime
 * updates and the audit log behave exactly as for tickets created in the UI.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { simpleParser, type ParsedMail } from 'mailparser';
import { prisma, Prisma, type Ticket, type User } from '@helpdesk/db';
import {
  autoReplyReason,
  cleanSubject,
  createTicketSchema,
  emailAddressOf,
  extractReply,
  isStaff,
  REPLY_MARKER,
  ticketNumberFromHeaders,
  ticketNumberFromSubject,
} from '@helpdesk/shared';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import type { AuthUser } from '../../middleware/auth';
import { addComment, createTicket } from '../tickets/service';

export type InboundOutcome =
  | { status: 'PROCESSED'; reason: 'created' | 'replied' | 'follow-up'; ticketNumber: number }
  | { status: 'IGNORED'; reason: string }
  | { status: 'DUPLICATE'; reason: string };

const MAX_ATTACHMENTS = 10;
const MAX_BODY = 20_000;

const ownAddresses = () =>
  new Set([env.MAIL_FROM, env.SUPPORT_EMAIL].filter((v): v is string => !!v).map(emailAddressOf));

function headerMap(mail: ParsedMail): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of mail.headers) out[k.toLowerCase()] = typeof v === 'string' ? v : JSON.stringify(v);
  return out;
}

/** Rejects mail whose sender failed DMARC (or both SPF and DKIM) — basic spoofing protection.
 *  Only enforced when the receiving MTA added an Authentication-Results header. */
function authFailure(headers: Record<string, string>): string | null {
  const ar = headers['authentication-results']?.toLowerCase();
  if (!ar) return null;
  if (/dmarc=fail/.test(ar)) return 'sender failed DMARC';
  if (/spf=(fail|softfail)/.test(ar) && /dkim=fail/.test(ar)) return 'sender failed SPF and DKIM';
  return null;
}

async function findOrCreateSender(address: string, displayName: string | undefined): Promise<User | null> {
  const existing = await prisma.user.findUnique({ where: { email: address } });
  if (existing) return existing.active ? existing : null;
  if (!env.INBOUND_AUTO_CREATE_USERS) return null;

  const domain = address.split('@')[1];
  const org = domain ? await prisma.organization.findUnique({ where: { domain } }) : null;
  try {
    return await prisma.user.create({
      data: {
        email: address,
        name: displayName?.trim() || address.split('@')[0]!,
        role: 'CUSTOMER',
        organizationId: org?.id,
        // Unusable random password: email-created customers must be invited to set one.
        passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
      },
    });
  } catch (err) {
    // Two emails from a new sender arriving at once — the other request created them.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return prisma.user.findUnique({ where: { email: address } });
    }
    throw err;
  }
}

/** Resolves which existing ticket (if any) this email continues. */
async function findThreadTicket(mail: ParsedMail): Promise<Ticket | null> {
  const refs = [mail.inReplyTo, ...(Array.isArray(mail.references) ? mail.references : [mail.references])];

  const byHeader = ticketNumberFromHeaders(refs);
  if (byHeader) return prisma.ticket.findUnique({ where: { number: byHeader } });

  // Replying to an earlier inbound email (e.g. the customer follows up on their own message).
  const knownIds = refs.filter((r): r is string => !!r);
  if (knownIds.length) {
    const prior = await prisma.inboundEmail.findFirst({
      where: { messageId: { in: knownIds }, ticketId: { not: null } },
      include: { ticket: true },
      orderBy: { receivedAt: 'desc' },
    });
    if (prior?.ticket) return prior.ticket;
  }

  const bySubject = ticketNumberFromSubject(mail.subject);
  return bySubject ? prisma.ticket.findUnique({ where: { number: bySubject } }) : null;
}

/** Stores real attachments (skips inline signature images) as unattached uploads owned by the sender. */
async function saveAttachments(mail: ParsedMail, uploaderId: string): Promise<string[]> {
  const files = mail.attachments
    .filter((a) => !a.related && a.content.length > 0 && a.content.length <= env.MAX_UPLOAD_MB * 1024 * 1024)
    .slice(0, MAX_ATTACHMENTS);

  const ids: string[] = [];
  for (const a of files) {
    const storageKey = randomUUID();
    await fs.writeFile(path.join(env.UPLOAD_DIR, storageKey), a.content);
    const row = await prisma.attachment.create({
      data: {
        uploaderId,
        storageKey,
        fileName: path.basename(a.filename ?? 'attachment').slice(0, 255),
        mimeType: a.contentType || 'application/octet-stream',
        size: a.content.length,
      },
    });
    ids.push(row.id);
  }
  return ids;
}

const toActor = (u: User): AuthUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  organizationId: u.organizationId,
});

function bodyText(mail: ParsedMail): string {
  // mailparser derives `text` from HTML when there's no text/plain part.
  const text = mail.text ?? (typeof mail.html === 'string' ? mail.html.replace(/<[^>]+>/g, ' ') : '');
  return text.replace(/\r\n?/g, '\n').trim();
}

async function processMail(mail: ParsedMail, from: string): Promise<InboundOutcome & { ticketId?: string }> {
  const headers = headerMap(mail);

  const auto = autoReplyReason(headers);
  if (auto) return { status: 'IGNORED', reason: auto };
  if (ownAddresses().has(from)) return { status: 'IGNORED', reason: 'sent from our own address (loop guard)' };
  if (/^(mailer-daemon|postmaster|no-?reply)@/.test(from)) return { status: 'IGNORED', reason: 'system sender' };

  const auth = authFailure(headers);
  if (auth) return { status: 'IGNORED', reason: auth };

  const domain = from.split('@')[1] ?? '';
  if (env.INBOUND_ALLOWED_DOMAINS.length && !env.INBOUND_ALLOWED_DOMAINS.includes(domain)) {
    return { status: 'IGNORED', reason: `domain ${domain} not allowed` };
  }

  const recent = await prisma.inboundEmail.count({
    where: { fromAddress: from, status: 'PROCESSED', receivedAt: { gte: new Date(Date.now() - 3_600_000) } },
  });
  if (recent >= env.INBOUND_MAX_PER_SENDER_PER_HOUR) return { status: 'IGNORED', reason: 'rate limited' };

  const sender = await findOrCreateSender(from, mail.from?.value[0]?.name);
  if (!sender) return { status: 'IGNORED', reason: 'unknown or inactive sender' };
  const actor = toActor(sender);

  const raw = bodyText(mail);
  const thread = await findThreadTicket(mail);
  // Only the requester or staff may reply into a thread — a guessed "[#42]" from anyone else
  // must not land in someone else's ticket.
  const mayReply = thread && (isStaff(sender.role) || thread.requesterId === sender.id);

  if (thread && mayReply && thread.status !== 'CLOSED') {
    const body = extractReply(raw);
    const attachmentIds = await saveAttachments(mail, sender.id);
    if (!body && attachmentIds.length === 0) return { status: 'IGNORED', reason: 'empty reply' };

    // Staff email replies become INTERNAL notes: agent notification emails quote internal notes,
    // and a careless "reply" must never leak those to the customer. Agents reply publicly in the UI.
    await addComment(
      actor,
      thread.id,
      { body: (body || '(attachments only)').slice(0, MAX_BODY), isPublic: !isStaff(sender.role), attachmentIds },
      { via: 'EMAIL' },
    );
    return { status: 'PROCESSED', reason: 'replied', ticketNumber: thread.number, ticketId: thread.id };
  }

  // New ticket — or a follow-up when replying to a closed ticket.
  const followUpOf = thread && mayReply ? thread : null;
  const cleaned = cleanSubject(mail.subject);
  const subject = cleaned.length >= 3 ? cleaned : `Email from ${sender.name}`;
  // New mail keeps its full body (forwards, cc'd threads); only cut a stray reply marker.
  const markerAt = raw.indexOf(REPLY_MARKER);
  let description = (followUpOf ? extractReply(raw) : markerAt >= 0 ? raw.slice(0, markerAt) : raw).trim();
  if (followUpOf) description = `Follow-up to #${followUpOf.number}\n\n${description}`;

  const attachmentIds = await saveAttachments(mail, sender.id);
  const input = createTicketSchema.parse({
    subject: (followUpOf ? `Follow-up: ${subject}` : subject).slice(0, 200),
    description: (description || '(no message body)').slice(0, MAX_BODY),
    attachmentIds,
  });
  const ticket = await createTicket(actor, input, { channel: 'EMAIL' });
  return {
    status: 'PROCESSED',
    reason: followUpOf ? 'follow-up' : 'created',
    ticketNumber: ticket.number,
    ticketId: ticket.id,
  };
}

export async function ingestRawEmail(raw: Buffer): Promise<InboundOutcome> {
  const mail = await simpleParser(raw, { skipImageLinks: true });
  const from = mail.from?.value[0]?.address ? emailAddressOf(mail.from.value[0].address) : null;
  // No Message-ID? Derive a stable one from the content so retries still dedupe.
  const messageId = mail.messageId ?? `<sha256-${createHash('sha256').update(raw).digest('hex')}@generated>`;
  const subject = (mail.subject ?? '').slice(0, 500);

  // Claim the Message-ID first: the unique constraint makes concurrent/retried deliveries safe.
  try {
    await prisma.inboundEmail.create({ data: { messageId, fromAddress: from ?? '(none)', subject } });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    const prior = await prisma.inboundEmail.findUniqueOrThrow({ where: { messageId } });
    if (prior.status !== 'FAILED') return { status: 'DUPLICATE', reason: `already ${prior.status.toLowerCase()}` };
    await prisma.inboundEmail.update({ where: { messageId }, data: { status: 'PROCESSING', reason: 'retry' } });
  }

  try {
    const outcome = from ? await processMail(mail, from) : ({ status: 'IGNORED', reason: 'no sender' } as const);
    await prisma.inboundEmail.update({
      where: { messageId },
      data: {
        status: outcome.status === 'PROCESSED' ? 'PROCESSED' : 'IGNORED',
        reason: outcome.reason,
        ticketId: 'ticketId' in outcome ? outcome.ticketId : undefined,
      },
    });
    logger.info({ messageId, from, ...outcome }, 'Inbound email handled');
    const { ticketId: _omit, ...publicOutcome } = outcome as InboundOutcome & { ticketId?: string };
    return publicOutcome;
  } catch (err) {
    await prisma.inboundEmail
      .update({ where: { messageId }, data: { status: 'FAILED', reason: String((err as Error).message).slice(0, 500) } })
      .catch(() => undefined);
    throw err; // → 500, so the provider / IMAP poller retries later
  }
}
