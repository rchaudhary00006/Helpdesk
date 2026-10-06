import type { Ticket } from '@helpdesk/db';
import { slaJobId, type SlaMetric } from '@helpdesk/shared';
import { slaQueue } from '../../lib/queues';

/**
 * (Re)schedules one delayed BullMQ job per SLA metric, firing exactly at the due time.
 * Far cheaper than a cron that scans every open ticket each minute, and it scales with tickets.
 * The worker re-validates against the DB, so stale jobs are harmless.
 */
export async function scheduleSlaChecks(ticket: Ticket) {
  const metrics: { metric: SlaMetric; dueAt: Date | null; done: boolean }[] = [
    {
      metric: 'FIRST_RESPONSE',
      dueAt: ticket.firstResponseDueAt,
      done: !!ticket.firstRespondedAt || ticket.firstResponseBreached,
    },
    {
      metric: 'RESOLUTION',
      dueAt: ticket.resolutionDueAt,
      done: !!ticket.resolvedAt || ticket.resolutionBreached,
    },
  ];

  for (const { metric, dueAt, done } of metrics) {
    const jobId = slaJobId(ticket.id, metric);
    // remove() is a no-op for missing jobs; it can fail if the job is mid-processing, which is fine.
    await slaQueue.remove(jobId).catch(() => undefined);
    if (!dueAt || done) continue;
    await slaQueue.add(
      'check',
      { ticketId: ticket.id, metric, dueAt: dueAt.toISOString() },
      { jobId, delay: Math.max(0, dueAt.getTime() - Date.now()) },
    );
  }
}
