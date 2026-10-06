import path from 'node:path';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(4000),
  WEB_ORIGIN: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  UPLOAD_DIR: z.string().default('../../storage/uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(15),

  // ---- Inbound email (email-to-ticket). Endpoint is disabled unless a secret is set.
  INBOUND_EMAIL_SECRET: z.string().min(24, 'INBOUND_EMAIL_SECRET must be at least 24 characters').optional(),
  /** Comma-separated sender domains allowed to open tickets. Empty = anyone. */
  INBOUND_ALLOWED_DOMAINS: z
    .string()
    .optional()
    .transform((v) => (v ?? '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean)),
  /** Create customer accounts for unknown senders (they can't log in until invited). */
  INBOUND_AUTO_CREATE_USERS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Loop/flood protection. */
  INBOUND_MAX_PER_SENDER_PER_HOUR: z.coerce.number().int().positive().default(20),
  /** Our own addresses — mail from these is ignored to prevent loops. */
  MAIL_FROM: z.string().optional(),
  SUPPORT_EMAIL: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast at boot rather than with a confusing error on the first request.
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  UPLOAD_DIR: path.resolve(process.cwd(), parsed.data.UPLOAD_DIR),
  isProd: parsed.data.NODE_ENV === 'production',
};
