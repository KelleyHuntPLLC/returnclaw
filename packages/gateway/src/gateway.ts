import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import {
  AgentType,
  AgentStatus,
  createChildLogger,
  AgentError,
} from '@returnclaw/core';
import type { AgentContext, AgentMessage, AgentResult } from '@returnclaw/core';
import { SessionManager } from './session/manager.js';
import { IntentRouter } from './router/intent.js';
import { AgentPipeline, type PipelineResult } from './router/pipeline.js';

const log = createChildLogger({ component: 'gateway' });

export interface GatewayConfig {
  redisUrl: string;
}

export class Gateway extends EventEmitter {
  private static instance: Gateway | null = null;

  readonly sessionManager: SessionManager;
  private intentRouter: IntentRouter;
  private pipeline: AgentPipeline;
  private agentProcessors: Map<
    AgentType,
    (message: AgentMessage, context: AgentContext) => Promise<AgentResult>
  >;

  private constructor(config: GatewayConfig) {
    super();
    this.sessionManager = new SessionManager(config.redisUrl);
    this.intentRouter = new IntentRouter();
    this.agentProcessors = new Map();

    this.pipeline = new AgentPipeline(
      async (agentType, message, context) => {
        const processor = this.agentProcessors.get(agentType);
        if (!processor) {
          throw new AgentError(agentType, `No processor registered for agent type: ${agentType}`);
        }
        return processor(message, context);
      },
    );

    log.info('Gateway initialized');
  }

  static create(config: GatewayConfig): Gateway {
    if (!Gateway.instance) {
      Gateway.instance = new Gateway(config);
    }
    return Gateway.instance;
  }

  static getInstance(): Gateway {
    if (!Gateway.instance) {
      throw new Error('Gateway not initialized. Call Gateway.create() first.');
    }
    return Gateway.instance;
  }

  registerAgentProcessor(
    agentType: AgentType,
    processor: (message: AgentMessage, context: AgentContext) => Promise<AgentResult>,
  ): void {
    this.agentProcessors.set(agentType, processor);
    log.info({ agentType }, 'Agent processor registered');
  }

  async processMessage(
    sessionId: string,
    message: AgentMessage,
  ): Promise<PipelineResult> {
    const session = await this.sessionManager.getSession(sessionId);

    // Classify intent
    const classification = await this.intentRouter.classify(message.content);

    this.emit('intent:classified', {
      sessionId,
      userId: session.userId,
      intent: classification.intent,
      confidence: classification.confidence,
    });

    if (classification.clarificationNeeded && classification.confidence < 0.5) {
      // Return clarification request without entering the pipeline
      return {
        pipelineId: randomUUID(),
        steps: [],
        finalResult: {
          agentType: AgentType.TRIAGE,
          status: AgentStatus.AWAITING_INPUT as const,
          response: classification.clarificationQuestion ?? 'Could you clarify what you need help with?',
          actions: [],
          metadata: { intent: classification.intent, confidence: classification.confidence },
        },
        totalDurationMs: 0,
      };
    }

    const context: AgentContext = {
      sessionId,
      userId: session.userId,
      turnId: randomUUID(),
      timestamp: new Date(),
      metadata: {
        intent: classification.intent,
        confidence: classification.confidence,
        entities: classification.extractedEntities,
      },
    };

    // Update session with current agent
    await this.sessionManager.updateSession(sessionId, {
      currentAgent: classification.suggestedAgent,
    });

    const result = await this.pipeline.execute(
      classification.suggestedAgent,
      message,
      context,
    );

    // Store assistant response in session history
    await this.sessionManager.addMessage(sessionId, {
      role: 'assistant',
      content: result.finalResult.response,
      timestamp: new Date(),
    });

    this.emit('pipeline:completed', {
      sessionId,
      pipelineId: result.pipelineId,
      totalDurationMs: result.totalDurationMs,
    });

    return result;
  }

  async shutdown(): Promise<void> {
    log.info('Gateway shutting down');
    await this.sessionManager.close();
    Gateway.instance = null;
    this.emit('shutdown');
  }
}
