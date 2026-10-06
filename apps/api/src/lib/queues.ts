import { Queue } from 'bullmq';
import { QUEUES, type NotifyJob, type SlaCheckJob } from '@helpdesk/shared';
import { redis } from './redis';

export const notificationsQueue = new Queue<NotifyJob>(QUEUES.notifications, {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export const slaQueue = new Queue<SlaCheckJob>(QUEUES.sla, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
    // Must be removed on completion: SLA jobs use deterministic ids and a lingering
    // completed job would make the next add() with the same id a silent no-op.
    removeOnComplete: true,
    removeOnFail: 1000,
  },
});

export function enqueueNotification(job: NotifyJob) {
  if (job.recipientIds.length === 0) return Promise.resolve();
  return notificationsQueue.add(job.type, job);
}

export const closeQueues = () => Promise.all([notificationsQueue.close(), slaQueue.close()]);
