'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { formatDistanceToNowStrict } from 'date-fns';
import { ChevronLeft, ChevronRight, Inbox, Search } from 'lucide-react';
import { PRIORITIES, PRIORITY_LABELS, type Priority } from '@helpdesk/shared';
import { Avatar, PriorityLabel, SlaText, StatusBadge } from '@/components/ui/badges';
import { ErrorBanner, PageSpinner } from '@/components/ui/field';
import { useIsStaff, useTickets } from '@/hooks/queries';
import { useDebounce } from '@/hooks/use-debounce';
import { CUSTOMER_VIEWS, STAFF_VIEWS, viewToParams } from '@/lib/views';

const PAGE_SIZE = 25;

export default function TicketsPage() {
  const router = useRouter();
  const search = useSearchParams();
  const staff = useIsStaff();
  const views = staff ? STAFF_VIEWS : CUSTOMER_VIEWS;
  const view = views.find((v) => v.id === search.get('view')) ?? views[0]!;

  const [q, setQ] = useState('');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [page, setPage] = useState(1);
  const debouncedQ = useDebounce(q);

  // Reset paging whenever the view or filters change.
  const [lastKey, setLastKey] = useState('');
  const key = `${view.id}|${debouncedQ}|${priority}`;
  if (key !== lastKey) {
    setLastKey(key);
    setPage(1);
  }

  const params = useMemo(() => {
    const p = viewToParams(view);
    if (debouncedQ) p.set('q', debouncedQ);
    if (priority) p.set('priority', priority);
    if (view.id === 'breached') p.set('sort', 'resolutionDueAt');
    if (view.id === 'breached') p.set('order', 'asc');
    p.set('page', String(page));
    p.set('pageSize', String(PAGE_SIZE));
    return p;
  }, [view, debouncedQ, priority, page]);

  const { data, isLoading, error, isFetching } = useTickets(params);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{view.label}</h1>
          <p className="text-sm text-slate-500">
            {data ? `${data.total} ticket${data.total === 1 ? '' : 's'}` : ' '}
            {isFetching && !isLoading && <span className="ml-2 text-slate-400">· updating…</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search subject, #number, tag…"
              className="field w-72 pl-8"
              aria-label="Search tickets"
            />
          </div>
          <select
            className="field w-36"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority | '')}
            aria-label="Filter by priority"
          >
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <ErrorBanner message={error.message} />}

      {isLoading ? (
        <PageSpinner />
      ) : data && data.data.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Inbox className="mb-2 h-8 w-8 text-slate-300" />
          <p className="font-medium text-slate-600">No tickets here</p>
          <p className="text-sm text-slate-400">
            {q || priority ? 'Try clearing your filters.' : 'Nice — this view is empty.'}
          </p>
        </div>
      ) : (
        data && (
          <div className="card overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-20 px-4 py-2.5 font-medium">#</th>
                  <th className="px-4 py-2.5 font-medium">Subject</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Priority</th>
                  {staff && <th className="px-4 py-2.5 font-medium">Requester</th>}
                  <th className="px-4 py-2.5 font-medium">Assignee</th>
                  {staff && <th className="px-4 py-2.5 font-medium">Next SLA</th>}
                  <th className="px-4 py-2.5 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.data.map((t) => {
                  // Show whichever SLA clock is currently running.
                  const firstPending = !t.firstRespondedAt && t.firstResponseDueAt;
                  return (
                    <tr
                      key={t.id}
                      onClick={() => router.push(`/tickets/${t.number}`)}
                      className="cursor-pointer hover:bg-slate-50"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        <Link href={`/tickets/${t.number}`} onClick={(e) => e.stopPropagation()}>
                          #{t.number}
                        </Link>
                      </td>
                      <td className="max-w-md px-4 py-3">
                        <p className={clsx('truncate', t.status === 'NEW' ? 'font-semibold' : 'font-medium')}>
                          {t.subject}
                        </p>
                        {t.tags.length > 0 && (
                          <p className="mt-0.5 truncate text-xs text-slate-400">{t.tags.map((x) => `#${x}`).join(' ')}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-4 py-3">
                        <PriorityLabel priority={t.priority} />
                      </td>
                      {staff && <td className="px-4 py-3 text-slate-600">{t.requester.name}</td>}
                      <td className="px-4 py-3">
                        {t.assignee ? (
                          <span className="inline-flex items-center gap-2 text-slate-600">
                            <Avatar name={t.assignee.name} className="h-6 w-6 text-[10px]" />
                            {t.assignee.name}
                          </span>
                        ) : (
                          <span className="text-slate-400">{t.group ? t.group.name : 'Unassigned'}</span>
                        )}
                      </td>
                      {staff && (
                        <td className="px-4 py-3">
                          {['SOLVED', 'CLOSED'].includes(t.status) ? (
                            <span className="text-sm text-slate-400">—</span>
                          ) : firstPending ? (
                            <SlaText dueAt={t.firstResponseDueAt} metAt={null} breached={t.firstResponseBreached} />
                          ) : (
                            <SlaText dueAt={t.resolutionDueAt} metAt={null} breached={t.resolutionBreached} />
                          )}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        {formatDistanceToNowStrict(new Date(t.updatedAt), { addSuffix: true })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-sm text-slate-500">
                <span>
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-1">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="rounded p-1 hover:bg-slate-100 disabled:opacity-40"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded p-1 hover:bg-slate-100 disabled:opacity-40"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
