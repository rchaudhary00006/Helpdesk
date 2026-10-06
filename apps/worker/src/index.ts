import { Worker, type Processor } from 'bullmq';
import { prisma } from '@helpdesk/db';
import { QUEUES } from '@helpdesk/shared';
import { automationsQueue, connection, emailQueue, logger, notificationsQueue } from './lib';
import { env } from './env';
import { processAutomation } from './processors/automations';
import { imapEnabled } from './processors/imap';
import { processEmail, processNotification } from './processors/notifications';
import { processSlaCheck } from './processors/sla';

function startWorker(queue: string, processor: Processor, concurrency: number) {
  const worker = new Worker(queue, processor, { connection, concurrency });
  worker.on('failed', (job, err) =>
    logger.error({ queue, job: job?.name, id: job?.id, attempts: job?.attemptsMade, err }, 'Job failed'),
  );
  worker.on('error', (err) => logger.error({ queue, err }, 'Worker error'));
  return worker;
}

const workers = [
  startWorker(QUEUES.notifications, processNotification, 10),
  startWorker(QUEUES.email, processEmail, 5),
  startWorker(QUEUES.sla, processSlaCheck, 10),
  startWorker(QUEUES.automations, processAutomation, 1),
];

async function registerSchedules() {
  // upsert = safe to run on every boot / from multiple replicas.
  await automationsQueue.upsertJobScheduler('auto-close', { every: 15 * 60_000 }, { name: 'auto-close' });
  await automationsQueue.upsertJobScheduler('cleanup-uploads', { every: 60 * 60_000 }, { name: 'cleanup-uploads' });
  if (imapEnabled()) {
    await automationsQueue.upsertJobScheduler('imap-poll', { every: env.IMAP_POLL_SECONDS * 1000 }, { name: 'imap-poll' });
    logger.info({ host: env.IMAP_HOST, mailbox: env.IMAP_MAILBOX }, 'IMAP polling enabled');
  } else {
    await automationsQueue.removeJobScheduler('imap-poll');
  }
}

registerSchedules()
  .then(() => logger.info('Worker started: notifications, email, sla, automations'))
  .catch((err) => {
    logger.fatal({ err }, 'Failed to register schedules');
    process.exit(1);
  });

async function shutdown(signal: string) {
  logger.info({ signal }, 'Draining workers');
  // close() waits for in-flight jobs to finish.
  await Promise.allSettled(workers.map((w) => w.close()));
  await Promise.allSettled([notificationsQueue.close(), emailQueue.close(), automationsQueue.close()]);
  await Promise.allSettled([prisma.$disconnect(), connection.quit()]);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
