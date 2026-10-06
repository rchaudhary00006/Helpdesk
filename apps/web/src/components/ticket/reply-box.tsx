'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { Lock, MessageSquare } from 'lucide-react';
import { STATUS_LABELS, TICKET_STATUSES, type TicketDetail, type TicketStatus } from '@helpdesk/shared';
import { AttachmentPicker } from '@/components/attachment-picker';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/field';
import { useAddComment } from '@/hooks/queries';
import { useUploads } from '@/hooks/use-uploads';

export function ReplyBox({ ticket, ticketRef, staff }: { ticket: TicketDetail; ticketRef: string; staff: boolean }) {
  const [mode, setMode] = useState<'public' | 'internal'>('public');
  const [body, setBody] = useState('');
  const [submitAs, setSubmitAs] = useState<TicketStatus | ''>('');
  const uploads = useUploads();
  const addComment = useAddComment(ticketRef);

  if (ticket.status === 'CLOSED') {
    return (
      <div className="card p-4 text-center text-sm text-slate-500">
        This ticket is closed. {staff ? 'Closed tickets are read-only.' : 'Please open a new request for follow-ups.'}
      </div>
    );
  }

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!body.trim() || addComment.isPending || uploads.uploading) return;
    // Clear the composer up front: the mutation resolves only after the thread refetches, and
    // clearing then would wipe anything the agent has started typing in the meantime.
    const draft = body;
    setBody('');
    setSubmitAs('');
    try {
      await addComment.mutateAsync({
        body: draft,
        isPublic: mode === 'public',
        status: submitAs && submitAs !== ticket.status ? submitAs : undefined,
        attachmentIds: uploads.ids,
      });
      uploads.reset();
    } catch {
      setBody((current) => (current ? current : draft)); // restore on failure; error banner shows why
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
  };

  const internal = mode === 'internal';

  return (
    <form onSubmit={submit} className={clsx('card overflow-hidden', internal && 'border-amber-300')}>
      {staff && (
        <div className="flex border-b border-slate-200 text-sm">
          {(
            [
              ['public', 'Public reply', MessageSquare],
              ['internal', 'Internal note', Lock],
            ] as const
          ).map(([m, label, Icon]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={clsx(
                'flex items-center gap-1.5 border-b-2 px-4 py-2 font-medium',
                mode === m
                  ? m === 'internal'
                    ? 'border-amber-500 text-amber-700'
                    : 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      )}
      <div className={clsx('space-y-2 p-3', internal && 'bg-amber-50')}>
        {addComment.error && <ErrorBanner message={addComment.error.message} />}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            internal
              ? 'Internal note — only visible to agents'
              : staff
                ? `Reply to ${ticket.requester.name}…`
                : 'Add a reply…'
          }
          className={clsx(
            'block min-h-[120px] w-full resize-y rounded-md border-0 bg-transparent p-1 text-sm focus:outline-none focus:ring-0',
          )}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <AttachmentPicker uploads={uploads} />
          <div className="flex items-center gap-2">
            {staff && (
              <select
                value={submitAs}
                onChange={(e) => setSubmitAs(e.target.value as TicketStatus | '')}
                className="field h-9 w-40 py-1"
                aria-label="Submit as status"
              >
                <option value="">Keep status</option>
                {TICKET_STATUSES.filter((s) => s !== 'CLOSED').map((s) => (
                  <option key={s} value={s}>
                    Submit as {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            )}
            <Button
              type="submit"
              loading={addComment.isPending}
              disabled={!body.trim() || uploads.uploading}
              className={clsx(internal && 'bg-amber-600 hover:bg-amber-700')}
              title="Ctrl/⌘ + Enter"
            >
              {internal ? 'Add note' : 'Send'}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
