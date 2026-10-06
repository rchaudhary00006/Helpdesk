'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  PRIORITIES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TICKET_STATUSES,
  TICKET_TYPES,
  TYPE_LABELS,
  type TicketDetail,
  type UpdateTicketInput,
} from '@helpdesk/shared';
import { Avatar, PriorityLabel, SlaText, StatusBadge } from '@/components/ui/badges';
import { Button } from '@/components/ui/button';
import { ErrorBanner, Field } from '@/components/ui/field';
import { useAgents, useGroups, useMe, useUpdateTicket } from '@/hooks/queries';

function Card({ title, children, busy }: { title: string; children: React.ReactNode; busy?: boolean }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function TagsEditor({ tags, disabled, onSave }: { tags: string[]; disabled: boolean; onSave: (t: string[]) => void }) {
  const [value, setValue] = useState(tags.join(', '));
  const commit = () => {
    const next = [...new Set(value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))];
    if (next.join(',') !== tags.join(',')) onSave(next);
  };
  return (
    <input
      className="field"
      value={value}
      disabled={disabled}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), e.preventDefault())}
      placeholder="Add tags…"
    />
  );
}

export function RequesterCard({ ticket }: { ticket: TicketDetail }) {
  return (
    <Card title="Requester">
      <div className="flex items-center gap-2.5">
        <Avatar name={ticket.requester.name} />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-medium">{ticket.requester.name}</p>
          <p className="truncate text-xs text-slate-500">{ticket.requester.email}</p>
          {ticket.organization && <p className="truncate text-xs text-slate-400">{ticket.organization.name}</p>}
        </div>
      </div>
    </Card>
  );
}

export function StaffProperties({ ticket, ticketRef }: { ticket: TicketDetail; ticketRef: string }) {
  const { data: me } = useMe();
  const { data: agents } = useAgents(true);
  const { data: groups } = useGroups(true);
  const update = useUpdateTicket(ticketRef);
  const closed = ticket.status === 'CLOSED';
  const set = (patch: UpdateTicketInput) => update.mutate(patch);

  return (
    <Card title="Properties" busy={update.isPending}>
      {update.error && <ErrorBanner message={update.error.message} />}

      <Field label="Assignee" htmlFor="assignee">
        <select
          id="assignee"
          className="field"
          disabled={closed}
          value={ticket.assignee?.id ?? ''}
          onChange={(e) => set({ assigneeId: e.target.value || null })}
        >
          <option value="">Unassigned</option>
          {agents?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {!closed && me && ticket.assignee?.id !== me.id && (
          <button onClick={() => set({ assigneeId: me.id })} className="text-xs text-brand-600 hover:underline">
            Take it
          </button>
        )}
      </Field>

      <Field label="Group" htmlFor="group">
        <select
          id="group"
          className="field"
          disabled={closed}
          value={ticket.group?.id ?? ''}
          onChange={(e) => set({ groupId: e.target.value || null })}
        >
          <option value="">—</option>
          {groups?.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Status" htmlFor="status">
          <select
            id="status"
            className="field"
            disabled={closed}
            value={ticket.status}
            onChange={(e) => set({ status: e.target.value as TicketDetail['status'] })}
          >
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority" htmlFor="priority">
          <select
            id="priority"
            className="field"
            disabled={closed}
            value={ticket.priority}
            onChange={(e) => set({ priority: e.target.value as TicketDetail['priority'] })}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Type" htmlFor="type">
        <select
          id="type"
          className="field"
          disabled={closed}
          value={ticket.type}
          onChange={(e) => set({ type: e.target.value as TicketDetail['type'] })}
        >
          {TICKET_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Tags">
        {/* key resets local input state when tags change remotely */}
        <TagsEditor key={ticket.tags.join(',')} tags={ticket.tags} disabled={closed} onSave={(tags) => set({ tags })} />
      </Field>
    </Card>
  );
}

export function SlaCard({ ticket }: { ticket: TicketDetail }) {
  // Once solved/closed, an unmet target is no longer counting down.
  const stopped = ticket.status === 'SOLVED' || ticket.status === 'CLOSED';
  const due = (d: string | null, met: string | null) => (stopped && !met ? null : d);
  return (
    <Card title="SLA">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">First response</span>
        <SlaText
          dueAt={due(ticket.firstResponseDueAt, ticket.firstRespondedAt)}
          metAt={ticket.firstRespondedAt}
          breached={ticket.firstResponseBreached}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">Resolution</span>
        <SlaText dueAt={due(ticket.resolutionDueAt, ticket.resolvedAt)} metAt={ticket.resolvedAt} breached={ticket.resolutionBreached} />
      </div>
    </Card>
  );
}

export function CustomerProperties({ ticket, ticketRef }: { ticket: TicketDetail; ticketRef: string }) {
  const update = useUpdateTicket(ticketRef);
  const canSolve = !['SOLVED', 'CLOSED'].includes(ticket.status);
  return (
    <Card title="Details">
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-500">Status</dt>
          <dd>
            <StatusBadge status={ticket.status} />
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Priority</dt>
          <dd>
            <PriorityLabel priority={ticket.priority} />
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Assigned to</dt>
          <dd className="text-slate-700">{ticket.assignee?.name ?? 'Support team'}</dd>
        </div>
      </dl>
      {update.error && <ErrorBanner message={update.error.message} />}
      {canSolve && (
        <Button
          variant="secondary"
          className="w-full"
          loading={update.isPending}
          onClick={() => update.mutate({ status: 'SOLVED' })}
        >
          Mark as solved
        </Button>
      )}
    </Card>
  );
}
