import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import nodemailer from 'nodemailer';
import pino from 'pino';
import { Emitter } from '@socket.io/redis-emitter';
import { QUEUES, type EmailJob, type NotifyJob } from '@helpdesk/shared';
import { env } from './env';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    env.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
});

export const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

/** Publishes Socket.IO events through Redis; API instances (redis-adapter) deliver them to clients. */
export const socketEmitter = new Emitter(connection.duplicate());

export const mailer = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
});

export const notificationsQueue = new Queue<NotifyJob>(QUEUES.notifications, {
  connection,
  defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 5_000 }, removeOnComplete: 1000 },
});

export const emailQueue = new Queue<EmailJob>(QUEUES.email, {
  connection,
  defaultJobOptions: {
    attempts: 8,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  },
});

export const automationsQueue = new Queue(QUEUES.automations, { connection });

export const ticketUrl = (number: number) => `${env.WEB_ORIGIN}/tickets/${number}`;
