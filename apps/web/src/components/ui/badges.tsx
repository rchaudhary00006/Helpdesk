import clsx from 'clsx';
import { formatDistanceToNowStrict } from 'date-fns';
import {
  PRIORITY_LABELS,
  slaState,
  STATUS_LABELS,
  type Priority,
  type SlaState,
  type TicketStatus,
} from '@helpdesk/shared';

const statusStyles: Record<TicketStatus, string> = {
  NEW: 'bg-amber-100 text-amber-800 ring-amber-200',
  OPEN: 'bg-red-100 text-red-700 ring-red-200',
  PENDING: 'bg-sky-100 text-sky-700 ring-sky-200',
  ON_HOLD: 'bg-slate-200 text-slate-700 ring-slate-300',
  SOLVED: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  CLOSED: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        statusStyles[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

const priorityDot: Record<Priority, string> = {
  LOW: 'bg-slate-300',
  NORMAL: 'bg-sky-400',
  HIGH: 'bg-orange-400',
  URGENT: 'bg-red-600 animate-pulse',
};

export function PriorityLabel({ priority }: { priority: Priority }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-slate-700">
      <span className={clsx('h-2 w-2 rounded-full', priorityDot[priority])} />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

const slaStyles: Record<SlaState, string> = {
  none: 'text-slate-400',
  ok: 'text-slate-600',
  at_risk: 'text-amber-700 font-medium',
  breached: 'text-red-600 font-semibold',
  met: 'text-emerald-600',
};

export function SlaText({
  dueAt,
  metAt,
  breached,
}: {
  dueAt: string | null;
  metAt: string | null;
  breached: boolean;
}) {
  const state = slaState(dueAt, metAt, breached);
  let text = '—';
  if (state === 'met') text = 'Met';
  else if (dueAt) {
    const rel = formatDistanceToNowStrict(new Date(dueAt));
    text = new Date(dueAt).getTime() < Date.now() ? `${rel} overdue` : `in ${rel}`;
    if (state === 'breached' && metAt) text = 'Missed';
  }
  return (
    <span className={clsx('text-sm', slaStyles[state])} title={dueAt ? new Date(dueAt).toLocaleString() : undefined}>
      {text}
    </span>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  // Stable colour per name.
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  return (
    <span
      className={clsx(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
        className,
      )}
      style={{ backgroundColor: `hsl(${hue} 55% 45%)` }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
