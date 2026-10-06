import type { Server as HttpServer } from 'node:http';
import { parse as parseCookie } from 'cookie';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { prisma } from '@helpdesk/db';
import { isStaff, rooms, SOCKET_EVENTS } from '@helpdesk/shared';
import { env } from '../config/env';
import { createRedis } from '../lib/redis';
import { logger } from '../lib/logger';
import { SESSION_COOKIE, userFromToken, type AuthUser } from '../middleware/auth';
import { canViewTicket } from '../modules/tickets/rules';

let io: Server | null = null;

export function initRealtime(server: HttpServer) {
  // Redis adapter: lets multiple API replicas share rooms, and lets the worker emit
  // via @socket.io/redis-emitter (SLA breaches, notifications).
  const pub = createRedis();
  const sub = pub.duplicate();

  io = new Server(server, {
    cors: { origin: env.WEB_ORIGIN, credentials: true },
    adapter: createAdapter(pub, sub),
  });

  io.use(async (socket, next) => {
    const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
    const user = await userFromToken(cookies[SESSION_COOKIE]).catch(() => null);
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as AuthUser;
    socket.join(rooms.user(user.id));
    if (isStaff(user.role)) socket.join(rooms.staff);

    socket.on(SOCKET_EVENTS.joinTicket, async (ticketId: unknown) => {
      if (typeof ticketId !== 'string') return;
      const ticket = await prisma.ticket
        .findUnique({ where: { id: ticketId }, select: { requesterId: true } })
        .catch(() => null);
      if (ticket && canViewTicket(user, ticket)) socket.join(rooms.ticket(ticketId));
    });
    socket.on(SOCKET_EVENTS.leaveTicket, (ticketId: unknown) => {
      if (typeof ticketId === 'string') socket.leave(rooms.ticket(ticketId));
    });
  });

  logger.info('Realtime (Socket.IO) ready');
  return io;
}

export const realtime = {
  /** Tell viewers a ticket changed. Payload is ids only; clients refetch through the permissioned API. */
  ticketChanged(ticket: { id: string; requesterId: string }, opts: { internalOnly?: boolean } = {}) {
    if (!io) return;
    const ticketRoom = opts.internalOnly
      ? io.to(rooms.ticket(ticket.id)).except(rooms.user(ticket.requesterId))
      : io.to(rooms.ticket(ticket.id));
    ticketRoom.emit(SOCKET_EVENTS.ticketChanged, { ticketId: ticket.id });

    const lists = opts.internalOnly ? io.to(rooms.staff) : io.to(rooms.staff).to(rooms.user(ticket.requesterId));
    lists.emit(SOCKET_EVENTS.ticketsChanged, { ticketId: ticket.id });
  },
};

export const closeRealtime = () => new Promise<void>((resolve) => (io ? io.close(() => resolve()) : resolve()));
