import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { prisma } from '@helpdesk/db';
import { env } from './config/env';
import { logger } from './lib/logger';
import { redis } from './lib/redis';
import { errorHandler, notFoundHandler } from './middleware/error';
import { attachmentsRouter } from './modules/attachments/routes';
import { authRouter } from './modules/auth/routes';
import { inboundRouter } from './modules/inbound/routes';
import { notificationsRouter } from './modules/notifications/routes';
import { ticketsRouter } from './modules/tickets/routes';
import { groupsRouter, usersRouter } from './modules/users/routes';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

  app.get('/api/health', async (_req, res) => {
    const [db, cache] = await Promise.allSettled([prisma.$queryRaw`SELECT 1`, redis.ping()]);
    const ok = db.status === 'fulfilled' && cache.status === 'fulfilled';
    res.status(ok ? 200 : 503).json({ ok, db: db.status, redis: cache.status });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/tickets', ticketsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/groups', groupsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/attachments', attachmentsRouter);
  app.use('/api/inbound', inboundRouter);

  app.use(notFoundHandler);
  app.use(errorHandler); // Express 5 forwards rejected promises from async handlers here.

  return app;
}
