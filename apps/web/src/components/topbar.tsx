'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { formatDistanceToNowStrict } from 'date-fns';
import { Bell, LogOut } from 'lucide-react';
import { api } from '@/lib/api';
import { qk, useMe, useNotifications } from '@/hooks/queries';
import { Avatar } from './ui/badges';

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onOutside]);
  return ref;
}

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const router = useRouter();
  const { data } = useNotifications();
  const ref = useClickOutside(() => setOpen(false));

  const openNotification = async (id: string, ticketId: string | null, read: boolean) => {
    setOpen(false);
    if (!read) {
      await api.markNotificationRead(id);
      void qc.invalidateQueries({ queryKey: qk.notifications });
    }
    if (ticketId) router.push(`/tickets/${ticketId}`);
  };

  const markAll = async () => {
    await api.markAllNotificationsRead();
    void qc.invalidateQueries({ queryKey: qk.notifications });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {!!data?.unread && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {data.unread > 9 ? '9+' : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="card absolute right-0 z-20 mt-1 w-96 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            {!!data?.unread && (
              <button onClick={markAll} className="text-xs text-brand-600 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {data?.data.length ? (
              data.data.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => openNotification(n.id, n.ticketId, !!n.readAt)}
                    className={clsx('block w-full px-4 py-3 text-left hover:bg-slate-50', !n.readAt && 'bg-brand-50/60')}
                  >
                    <p className={clsx('text-sm', !n.readAt && 'font-medium')}>{n.title}</p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-slate-400">
                      {formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true })}
                    </p>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-4 py-8 text-center text-sm text-slate-400">You&apos;re all caught up</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Topbar() {
  const { data: me } = useMe();
  const qc = useQueryClient();

  const logout = async () => {
    await api.logout();
    qc.clear();
    window.location.href = '/login';
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-end gap-2 border-b border-slate-200 bg-white px-6">
      <NotificationsBell />
      {me && (
        <div className="flex items-center gap-2 border-l border-slate-200 pl-3">
          <Avatar name={me.name} className="h-7 w-7" />
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-medium">{me.name}</p>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{me.role.toLowerCase()}</p>
          </div>
          <button
            onClick={logout}
            className="ml-1 rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Log out"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      )}
    </header>
  );
}
