import IORedis from 'ioredis';
import { env } from '../config/env';

// BullMQ requires maxRetriesPerRequest: null on its connections.
export const createRedis = () => new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const redis = createRedis();
