import { z } from 'zod';

export enum AgentType {
  TRIAGE = 'triage',
  POLICY = 'policy',
  EXECUTION = 'execution',
  CARRIER = 'carrier',
  COMPLIANCE = 'compliance',
  ESCALATION = 'escalation',
}

export enum AgentStatus {
  IDLE = 'idle',
  PROCESSING = 'processing',
  AWAITING_INPUT = 'awaiting_input',
  COMPLETED = 'completed',
  ERROR = 'error',
}

export interface AgentContext {
  sessionId: string;
  userId: string;
  turnId: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  timestamp: Date;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

export interface AgentResult {
  agentType: AgentType;
  status: AgentStatus;
  response: string;
  actions: AgentAction[];
  nextAgent?: AgentType;
  metadata: Record<string, unknown>;
}

export interface AgentAction {
  type: 'deep_link' | 'generate_label' | 'schedule_pickup' | 'send_notification' | 'escalate';
  payload: Record<string, unknown>;
  requiresConfirmation: boolean;
}

export interface Tool {
  name: string;
  description: string;
  parameters: z.ZodType;
  execute: (args: Record<string, unknown>, context: AgentContext) => Promise<unknown>;
}

export const AgentContextSchema = z.object({
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  turnId: z.string().uuid(),
  timestamp: z.coerce.date(),
  metadata: z.record(z.unknown()),
});

export const AgentMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string(),
  toolCalls: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        arguments: z.record(z.unknown()),
        result: z.unknown().optional(),
      }),
    )
    .optional(),
  timestamp: z.coerce.date(),
});
