'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { format } from 'date-fns';
import type { InboundEmailDto } from '@helpdesk/shared';
import { ErrorBanner, PageSpinner } from '@/components/ui/field';
import { useIsStaff } from '@/hooks/queries';
import { api } from '@/lib/api';

const statusStyle: Record<InboundEmailDto['status'], string> = {
  PROCESSED: 'bg-emerald-100 text-emerald-700',
  IGNORED: 'bg-slate-100 text-slate-600',
  FAILED: 'bg-red-100 text-red-700',
  PROCESSING: 'bg-amber-100 text-amber-800',
};

export default function EmailLogPage() {
  const staff = useIsStaff();
  const { data, isLoading, error } = useQuery({
    queryKey: ['inbound-emails'],
    queryFn: api.inboundEmails,
    enabled: staff,
    refetchInterval: 15_000,
  });

  if (!staff) return <div className="p-6"><ErrorBanner message="Only agents can view the email log." /></div>;

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Email log</h1>
      <p className="mb-4 text-sm text-slate-500">
        The last 100 inbound emails and what happened to each. Use it to debug &ldquo;why didn&apos;t my email become a ticket?&rdquo;
      </p>
      {error && <ErrorBanner message={error.message} />}
      {isLoading ? (
        <PageSpinner />
      ) : !data?.length ? (
        <div className="card py-16 text-center text-sm text-slate-400">No inbound email received yet.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Received</th>
                <th className="px-4 py-2.5 font-medium">From</th>
                <th className="px-4 py-2.5 font-medium">Subject</th>
                <th className="px-4 py-2.5 font-medium">Result</th>
                <th className="px-4 py-2.5 font-medium">Ticket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{format(new Date(e.receivedAt), 'MMM d, HH:mm:ss')}</td>
                  <td className="px-4 py-2.5">{e.fromAddress}</td>
                  <td className="max-w-xs truncate px-4 py-2.5" title={e.subject}>{e.subject || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={clsx('rounded px-1.5 py-0.5 text-xs font-medium', statusStyle[e.status])}>
                      {e.status.toLowerCase()}
                    </span>
                    {e.reason && <span className="ml-2 text-xs text-slate-500">{e.reason}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {e.ticket ? (
                      <Link href={`/tickets/${e.ticket.number}`} className="font-mono text-brand-600 hover:underline">
                        #{e.ticket.number}
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
