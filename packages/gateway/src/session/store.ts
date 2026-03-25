import Redis from 'ioredis';
import { createChildLogger } from '@returnclaw/core';
import type { Session } from './types.js';

const log = createChildLogger({ component: 'session-store' });

export class SessionStore {
  private redis: Redis;
  private prefix: string;

  constructor(redisUrl: string, prefix: string = 'rc:session:') {
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });
    this.prefix = prefix;

    this.redis.on('error', (err) => {
      log.error({ err }, 'Redis connection error');
    });

    this.redis.on('connect', () => {
      log.info('Redis connected');
    });
  }

  private key(sessionId: string): string {
    return `${this.prefix}${sessionId}`;
  }

  private userSessionsKey(userId: string): string {
    return `${this.prefix}user:${userId}`;
  }

  async get(sessionId: string): Promise<Session | null> {
    const data = await this.redis.get(this.key(sessionId));
    if (!data) return null;

    const session = JSON.parse(data) as Session;
    session.createdAt = new Date(session.createdAt);
    session.updatedAt = new Date(session.updatedAt);
    session.expiresAt = new Date(session.expiresAt);
    for (const msg of session.history) {
      msg.timestamp = new Date(msg.timestamp);
    }
    return session;
  }

  async set(session: Session, ttlSeconds: number): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.setex(this.key(session.id), ttlSeconds, JSON.stringify(session));
    pipeline.sadd(this.userSessionsKey(session.userId), session.id);
    pipeline.expire(this.userSessionsKey(session.userId), ttlSeconds);
    await pipeline.exec();
  }

  async delete(sessionId: string, userId: string): Promise<void> {
    const pipeline = this.redis.pipeline();
    pipeline.del(this.key(sessionId));
    pipeline.srem(this.userSessionsKey(userId), sessionId);
    await pipeline.exec();
  }

  async getUserSessionIds(userId: string): Promise<string[]> {
    return this.redis.smembers(this.userSessionsKey(userId));
  }

  async getUserSessionCount(userId: string): Promise<number> {
    return this.redis.scard(this.userSessionsKey(userId));
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}
