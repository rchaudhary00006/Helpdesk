import http from 'node:http';
import { prisma } from '@helpdesk/db';
import { env } from './config/env';
import { createApp } from './app';
import { registerSubscribers } from './events/subscribers';
import { logger } from './lib/logger';
import { closeQueues } from './lib/queues';
import { redis } from './lib/redis';
import { closeRealtime, initRealtime } from './realtime/socket';

const server = http.createServer(createApp());
initRealtime(server);
registerSubscribers();

server.listen(env.API_PORT, () => logger.info(`API listening on http://localhost:${env.API_PORT}`));

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  const force = setTimeout(() => process.exit(1), 10_000).unref();
  try {
    await closeRealtime(); // also closes the HTTP server
    await closeQueues();
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  } finally {
    clearTimeout(force);
    process.exit(0);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled rejection'));
