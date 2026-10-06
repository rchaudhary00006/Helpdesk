import { ImapFlow } from 'imapflow';
import { env } from '../env';
import { logger } from '../lib';

const BATCH = 50;

export const imapEnabled = () => !!(env.IMAP_HOST && env.IMAP_USER && env.INBOUND_EMAIL_SECRET);

/**
 * Polls the support mailbox and forwards each unseen message (raw MIME) to the API's inbound
 * endpoint — the same path provider webhooks use, so there's one ingestion pipeline.
 * A message is marked \Seen only once the API has accepted it; transient failures retry next poll,
 * and Message-ID dedupe on the API makes double delivery harmless.
 */
export async function pollImap() {
  const client = new ImapFlow({
    host: env.IMAP_HOST!,
    port: env.IMAP_PORT,
    secure: env.IMAP_SECURE,
    auth: { user: env.IMAP_USER!, pass: env.IMAP_PASS ?? '' },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock(env.IMAP_MAILBOX);
  let forwarded = 0;
  try {
    const uids = (await client.search({ seen: false }, { uid: true })) || [];
    for (const uid of uids.slice(0, BATCH)) {
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg || !msg.source) continue;

      const res = await fetch(`${env.API_INTERNAL_URL}/api/inbound/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'message/rfc822', Authorization: `Bearer ${env.INBOUND_EMAIL_SECRET}` },
        body: msg.source,
      });

      if (res.ok || res.status === 400 || res.status === 413) {
        // 400/413 = permanently unprocessable; mark seen so we don't retry forever.
        if (!res.ok) logger.warn({ uid, status: res.status, body: await res.text() }, 'Inbound email rejected');
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
        forwarded++;
      } else {
        logger.warn({ uid, status: res.status }, 'Inbound email forward failed; will retry next poll');
        if (res.status === 401 || res.status === 404) break; // misconfiguration — stop hammering
      }
    }
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }
  if (forwarded) logger.info({ forwarded }, 'IMAP poll forwarded messages');
  return forwarded;
}
