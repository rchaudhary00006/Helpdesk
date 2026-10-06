'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { Clock, LifeBuoy, Mail, Plus } from 'lucide-react';
import { useIsStaff, useMe, useTicketCounts } from '@/hooks/queries';
import { CUSTOMER_VIEWS, STAFF_VIEWS } from '@/lib/views';

export function Sidebar() {
  const staff = useIsStaff();
  const { data: me } = useMe();
  const pathname = usePathname();
  const search = useSearchParams();
  const { data: counts } = useTicketCounts(staff);
  const views = staff ? STAFF_VIEWS : CUSTOMER_VIEWS;
  const activeView = pathname === '/tickets' ? (search.get('view') ?? views[0]!.id) : null;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-900 text-slate-300">
      <div className="flex h-14 items-center gap-2 px-4 text-white">
        <LifeBuoy className="h-5 w-5 text-brand-500" />
        <span className="font-semibold tracking-tight">Helpdesk</span>
      </div>

      <div className="px-3 pb-3">
        <Link
          href="/tickets/new"
          className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-brand-600 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> New ticket
        </Link>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Views</p>
        {views.map((v) => {
          const count = v.countKey ? counts?.[v.countKey] : undefined;
          return (
            <Link
              key={v.id}
              href={`/tickets?view=${v.id}`}
              className={clsx(
                'flex items-center justify-between rounded-md px-2 py-1.5 text-sm',
                activeView === v.id ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/60 hover:text-white',
              )}
            >
              <span>{v.label}</span>
              {count !== undefined && (
                <span
                  className={clsx(
                    'rounded px-1.5 text-xs tabular-nums',
                    v.id === 'breached' && count > 0 ? 'bg-red-600 text-white' : 'text-slate-400',
                  )}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}

        {staff && (
          <>
            <p className="px-2 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Admin</p>
            <Link
              href="/admin/email-log"
              className={clsx(
                'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                pathname === '/admin/email-log' ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/60 hover:text-white',
              )}
            >
              <Mail className="h-4 w-4" /> Email log
            </Link>
            {me?.role === 'ADMIN' && (
              <Link
                href="/admin/sla"
                className={clsx(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                  pathname === '/admin/sla' ? 'bg-slate-800 text-white' : 'hover:bg-slate-800/60 hover:text-white',
                )}
              >
                <Clock className="h-4 w-4" /> SLA &amp; hours
              </Link>
            )}
          </>
        )}
      </nav>
    </aside>
  );
}
