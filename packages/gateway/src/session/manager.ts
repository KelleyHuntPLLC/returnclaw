import { randomUUID } from 'node:crypto';
import {
  createChildLogger,
  SESSION_TTL_SECONDS,
  SESSION_MAX_PER_USER,
  SessionNotFoundError,
  RateLimitError,
} from '@returnclaw/core';
import type { AgentMessage } from '@returnclaw/core';
import { SessionStore } from './store.js';
import type { Session, SessionCreateOptions, SessionUpdateOptions } from './types.js';

const log = createChildLogger({ component: 'session-manager' });

export class SessionManager {
  private store: SessionStore;

  constructor(redisUrl: string) {
    this.store = new SessionStore(redisUrl);
  }

  async createSession(options: SessionCreateOptions): Promise<Session> {
    const { userId, initialAgent = null, metadata = {}, ttlSeconds = SESSION_TTL_SECONDS } = options;

    const sessionCount = await this.store.getUserSessionCount(userId);
    if (sessionCount >= SESSION_MAX_PER_USER) {
      throw new RateLimitError(0);
    }

    const now = new Date();
    const session: Session = {
      id: randomUUID(),
      userId,
      currentAgent: initialAgent,
      history: [],
      metadata,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
    };

    await this.store.set(session, ttlSeconds);
    log.info({ sessionId: session.id, userId }, 'Session created');
    return session;
  }

  async getSession(sessionId: string): Promise<Session> {
    const session = await this.store.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }
    return session;
  }

  async updateSession(sessionId: string, updates: SessionUpdateOptions): Promise<Session> {
    const session = await this.getSession(sessionId);

    if (updates.currentAgent !== undefined) {
      session.currentAgent = updates.currentAgent;
    }

    if (updates.metadata) {
      session.metadata = { ...session.metadata, ...updates.metadata };
    }

    if (updates.appendMessage) {
      session.history.push(updates.appendMessage);
    }

    session.updatedAt = new Date();

    const remainingTtl = Math.max(
      0,
      Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
    );
    await this.store.set(session, remainingTtl || SESSION_TTL_SECONDS);

    return session;
  }

  async addMessage(sessionId: string, message: AgentMessage): Promise<Session> {
    return this.updateSession(sessionId, { appendMessage: message });
  }

  async destroySession(sessionId: string): Promise<void> {
    const session = await this.store.get(sessionId);
    if (session) {
      await this.store.delete(sessionId, session.userId);
      log.info({ sessionId, userId: session.userId }, 'Session destroyed');
    }
  }

  async getUserSessions(userId: string): Promise<Session[]> {
    const sessionIds = await this.store.getUserSessionIds(userId);
    const sessions: Session[] = [];

    for (const id of sessionIds) {
      const session = await this.store.get(id);
      if (session) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  async isHealthy(): Promise<boolean> {
    return this.store.ping();
  }

  async close(): Promise<void> {
    await this.store.close();
  }
}
