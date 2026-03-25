import type { AgentMessage, AgentType } from '@returnclaw/core';

export interface Session {
  id: string;
  userId: string;
  currentAgent: AgentType | null;
  history: AgentMessage[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export interface SessionCreateOptions {
  userId: string;
  initialAgent?: AgentType;
  metadata?: Record<string, unknown>;
  ttlSeconds?: number;
}

export interface SessionUpdateOptions {
  currentAgent?: AgentType | null;
  metadata?: Record<string, unknown>;
  appendMessage?: AgentMessage;
}
