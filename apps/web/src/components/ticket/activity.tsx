'use client';

import { formatDistanceToNowStrict } from 'date-fns';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
  type AuditLogDto,
  type Priority,
  type TicketStatus,
  type TicketType,
} from '@helpdesk/shared';
import { useAgents, useAuditLog, useGroups } from '@/hooks/queries';

type Lookup = (field: string, value: unknown) => string;

const FIELD_LABELS: Record<string, string> = {
  status: 'status',
  priority: 'priority',
  type: 'type',
  assigneeId: 'assignee',
  groupId: 'group',
  subject: 'subject',
  tags: 'tags',
};

function describe(entry: AuditLogDto, lookup: Lookup): string {
  const changes = entry.changes
    ? Object.entries(entry.changes)
        .filter(([field]) => FIELD_LABELS[field])
        .map(([field, c]) => `${FIELD_LABELS[field]}: ${lookup(field, c.from)} → ${lookup(field, c.to)}`)
    : [];
  const suffix = changes.length ? ` (${changes.join('; ')})` : '';

  switch (entry.action) {
    case 'ticket.created':
      return 'created the ticket';
    case 'ticket.updated':
      return `updated ${changes.join('; ')}`;
    case 'comment.public':
      return `replied${suffix}`;
    case 'comment.internal':
      return `added an internal note${suffix}`;
    case 'sla.breached': {
      const metric = (entry.changes?.metric?.to as string) ?? '';
      return `SLA breached — ${metric === 'FIRST_RESPONSE' ? 'first response' : 'resolution'}`;
    }
    case 'automation.auto_closed':
      return 'closed automatically after being solved';
    default:
      return entry.action;
  }
}

export function ActivityLog({ ticketRef }: { ticketRef: string }) {
  const { data: entries, isLoading } = useAuditLog(ticketRef, true);
  const { data: agents } = useAgents(true);
  const { data: groups } = useGroups(true);

  const lookup: Lookup = (field, value) => {
    if (value === null || value === undefined || value === '') return 'none';
    if (field === 'assigneeId') return agents?.find((a) => a.id === value)?.name ?? 'someone';
    if (field === 'groupId') return groups?.find((g) => g.id === value)?.name ?? 'a group';
    if (field === 'status') return STATUS_LABELS[value as TicketStatus] ?? String(value);
    if (field === 'priority') return PRIORITY_LABELS[value as Priority] ?? String(value);
    if (field === 'type') return TYPE_LABELS[value as TicketType] ?? String(value);
    if (Array.isArray(value)) return value.length ? value.join(', ') : 'none';
    return String(value);
  };

  return (
    <section className="card p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Activity</h2>
      {isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : (
        <ol className="relative space-y-3 border-l border-slate-200 pl-4">
          {entries?.map((e) => (
            <li key={e.id} className="text-xs leading-snug">
              <span className="absolute -left-[4.5px] mt-1 h-2 w-2 rounded-full bg-slate-300" />
              <span className="font-medium text-slate-700">{e.actor?.name ?? 'System'}</span>{' '}
              <span className="text-slate-600">{describe(e, lookup)}</span>
              <p className="text-slate-400">{formatDistanceToNowStrict(new Date(e.createdAt), { addSuffix: true })}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
