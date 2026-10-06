'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import { ChevronLeft } from 'lucide-react';
import { TYPE_LABELS } from '@helpdesk/shared';
import { ActivityLog } from '@/components/ticket/activity';
import { Conversation } from '@/components/ticket/conversation';
import { CustomerProperties, RequesterCard, SlaCard, StaffProperties } from '@/components/ticket/properties';
import { ReplyBox } from '@/components/ticket/reply-box';
import { PriorityLabel, StatusBadge } from '@/components/ui/badges';
import { ErrorBanner, PageSpinner } from '@/components/ui/field';
import { useIsStaff, useTicket } from '@/hooks/queries';
import { ApiError } from '@/lib/api';
import { useTicketRoom } from '@/lib/realtime';

export default function TicketPage() {
  const { ref } = useParams<{ ref: string }>();
  const staff = useIsStaff();
  const { data: ticket, isLoading, error } = useTicket(ref);
  useTicketRoom(ticket?.id);

  if (isLoading) return <PageSpinner />;
  if (error || !ticket) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="p-6">
        <ErrorBanner message={notFound ? 'Ticket not found, or you don’t have access to it.' : (error?.message ?? 'Error')} />
        <Link href="/tickets" className="mt-3 inline-block text-sm text-brand-600 hover:underline">
          Back to tickets
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <Link href="/tickets" className="mb-1 inline-flex items-center text-xs text-slate-500 hover:text-slate-700">
          <ChevronLeft className="h-3.5 w-3.5" /> Tickets
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold">
            <span className="mr-2 font-mono text-slate-400">#{ticket.number}</span>
            {ticket.subject}
          </h1>
          <StatusBadge status={ticket.status} />
          <PriorityLabel priority={ticket.priority} />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {TYPE_LABELS[ticket.type]} via {ticket.channel.toLowerCase()} · opened by {ticket.requester.name} on{' '}
          {format(new Date(ticket.createdAt), 'PP p')}
          {ticket.group && <> · {ticket.group.name}</>}
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-6 p-6 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-4">
          <Conversation comments={ticket.comments} requesterId={ticket.requester.id} />
          <ReplyBox ticket={ticket} ticketRef={ref} staff={staff} />
        </div>

        <aside className="w-full shrink-0 space-y-4 lg:w-80">
          {staff ? (
            <>
              <RequesterCard ticket={ticket} />
              <StaffProperties ticket={ticket} ticketRef={ref} />
              <SlaCard ticket={ticket} />
              <ActivityLog ticketRef={ref} />
            </>
          ) : (
            <CustomerProperties ticket={ticket} ticketRef={ref} />
          )}
        </aside>
      </div>
    </div>
  );
}
