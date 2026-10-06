'use client';

import { Suspense, type ReactNode } from 'react';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { PageSpinner } from '@/components/ui/field';
import { useMe } from '@/hooks/queries';
import { RealtimeProvider } from '@/lib/realtime';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();

  return (
    <RealtimeProvider enabled={!!me}>
      <div className="flex h-screen overflow-hidden">
        <Suspense>
          <Sidebar />
        </Suspense>
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 overflow-y-auto">
            {isLoading || !me ? <PageSpinner /> : <Suspense fallback={<PageSpinner />}>{children}</Suspense>}
          </main>
        </div>
      </div>
    </RealtimeProvider>
  );
}
