import { timingSafeEqual } from 'node:crypto';
import express, { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { prisma } from '@helpdesk/db';
import { env } from '../../config/env';
import { badRequest, notFound, unauthorized } from '../../lib/errors';
import { requireAuth, requireStaff } from '../../middleware/auth';
import { ingestRawEmail } from './service';

const MAX_EMAIL_BYTES = 40 * 1024 * 1024;

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Accepts the shared secret as a Bearer token, HTTP Basic password, or ?token= query param —
 * providers differ in what they can send (SendGrid/Mailgun webhooks support basic-auth URLs).
 */
const requireInboundSecret: RequestHandler = (req, _res, next) => {
  const secret = env.INBOUND_EMAIL_SECRET;
  if (!secret) throw notFound('Route'); // feature disabled
  const auth = req.headers.authorization ?? '';
  let provided = typeof req.query.token === 'string' ? req.query.token : '';
  if (auth.startsWith('Bearer ')) provided = auth.slice(7);
  else if (auth.startsWith('Basic ')) provided = Buffer.from(auth.slice(6), 'base64').toString().split(':').slice(1).join(':');
  if (!provided || !safeEqual(provided, secret)) throw unauthorized('Invalid inbound email secret');
  next();
};

// Multipart fields that carry the full raw MIME message, per provider.
const RAW_MIME_FIELDS = ['email', 'body-mime', 'raw', 'message'];
const multipart = multer({ storage: multer.memoryStorage(), limits: { fieldSize: MAX_EMAIL_BYTES, fileSize: MAX_EMAIL_BYTES } });

export const inboundRouter = Router();

/**
 * POST /api/inbound/email
 *  - Content-Type: message/rfc822 → body is the raw email (IMAP poller, SES/S3, Cloudflare, curl)
 *  - multipart/form-data with field `email` (SendGrid "send raw") or `body-mime` (Mailgun MIME route)
 * Responds 200 for every *handled* outcome (incl. ignored/duplicate) so providers don't retry;
 * 5xx only for transient failures, which providers retry.
 */
// `/email/mime` alias: Mailgun only forwards raw MIME when the route URL ends in "mime".
inboundRouter.post(
  ['/email', '/email/mime'],
  requireInboundSecret,
  express.raw({ type: ['message/rfc822', 'text/plain', 'application/octet-stream'], limit: MAX_EMAIL_BYTES }),
  multipart.any(),
  async (req, res) => {
    let raw: Buffer | null = Buffer.isBuffer(req.body) && req.body.length ? req.body : null;
    if (!raw) {
      const field = RAW_MIME_FIELDS.find((f) => typeof req.body?.[f] === 'string');
      const file = (req.files as Express.Multer.File[] | undefined)?.find((f) => RAW_MIME_FIELDS.includes(f.fieldname));
      raw = field ? Buffer.from(req.body[field] as string) : (file?.buffer ?? null);
    }
    if (!raw) throw badRequest(`Expected a raw MIME body (message/rfc822) or a multipart field: ${RAW_MIME_FIELDS.join(', ')}`);

    res.json(await ingestRawEmail(raw));
  },
);

/** Recent inbound emails and what happened to them — for admins debugging mail flow. */
inboundRouter.get('/emails', requireAuth, requireStaff, async (_req, res) => {
  res.json(
    await prisma.inboundEmail.findMany({
      orderBy: { receivedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        messageId: true,
        fromAddress: true,
        subject: true,
        status: true,
        reason: true,
        receivedAt: true,
        ticket: { select: { id: true, number: true } },
      },
    }),
  );
});
