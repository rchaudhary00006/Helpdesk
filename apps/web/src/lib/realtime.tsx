'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from '@helpdesk/shared';
import { qk } from '@/hooks/queries';

const SocketContext = createContext<Socket | null>(null);

/**
 * One socket per session. Server events are just "something changed" pings;
 * we translate them into React Query invalidations so data always comes from the permissioned API.
 */
export function RealtimeProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const qc = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const s = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000', {
      withCredentials: true,
      transports: ['websocket'],
    });

    s.on(SOCKET_EVENTS.ticketsChanged, () => {
      void qc.invalidateQueries({ queryKey: qk.tickets() });
      void qc.invalidateQueries({ queryKey: qk.counts });
    });
    s.on(SOCKET_EVENTS.ticketChanged, () => {
      void qc.invalidateQueries({ queryKey: qk.ticket() });
      void qc.invalidateQueries({ queryKey: qk.audit() });
    });
    s.on(SOCKET_EVENTS.notification, () => void qc.invalidateQueries({ queryKey: qk.notifications }));

    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [enabled, qc]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

/** Subscribe to live updates for a single ticket while the component is mounted. */
export function useTicketRoom(ticketId: string | undefined) {
  const socket = useContext(SocketContext);
  useEffect(() => {
    if (!socket || !ticketId) return;
    const join = () => socket.emit(SOCKET_EVENTS.joinTicket, ticketId);
    join();
    socket.on('connect', join); // rejoin after reconnects
    return () => {
      socket.off('connect', join);
      socket.emit(SOCKET_EVENTS.leaveTicket, ticketId);
    };
  }, [socket, ticketId]);
}
