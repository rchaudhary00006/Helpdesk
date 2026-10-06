import path from 'node:path';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  WEB_ORIGIN: z.string().url(),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().min(1),
  AUTO_CLOSE_AFTER_HOURS: z.coerce.number().positive().default(96),
  UPLOAD_DIR: z.string().default('../../storage/uploads'),

  // ---- Email-to-ticket
  /** The support inbox customers reply to (Reply-To on every outgoing email). */
  SUPPORT_EMAIL: z.string().optional(),
  API_INTERNAL_URL: z.string().url().default('http://localhost:4000'),
  INBOUND_EMAIL_SECRET: z.string().optional(),
  /** Optional IMAP mailbox polling (Google Workspace / Microsoft 365 / any IMAP server). */
  IMAP_HOST: z.string().optional(),
  IMAP_PORT: z.coerce.number().int().default(993),
  IMAP_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  IMAP_USER: z.string().optional(),
  IMAP_PASS: z.string().optional(),
  IMAP_MAILBOX: z.string().default('INBOX'),
  IMAP_POLL_SECONDS: z.coerce.number().int().min(10).default(30),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  UPLOAD_DIR: path.resolve(process.cwd(), parsed.data.UPLOAD_DIR),
};
