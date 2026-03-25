import { randomUUID } from 'node:crypto';
import {
  AgentType,
  AgentStatus,
  createChildLogger,
  AgentError,
} from '@returnclaw/core';
import type { AgentContext, AgentMessage, AgentResult } from '@returnclaw/core';

const log = createChildLogger({ component: 'agent-pipeline' });

export interface PipelineStep {
  agentType: AgentType;
  result: AgentResult | null;
  startedAt: Date;
  completedAt: Date | null;
  error: string | null;
}

export interface PipelineResult {
  pipelineId: string;
  steps: PipelineStep[];
  finalResult: AgentResult;
  totalDurationMs: number;
}

type AgentProcessFn = (
  agentType: AgentType,
  message: AgentMessage,
  context: AgentContext,
) => Promise<AgentResult>;

export class AgentPipeline {
  private agentProcessor: AgentProcessFn;

  constructor(agentProcessor: AgentProcessFn) {
    this.agentProcessor = agentProcessor;
  }

  async execute(
    startingAgent: AgentType,
    message: AgentMessage,
    context: AgentContext,
    maxSteps: number = 6,
  ): Promise<PipelineResult> {
    const pipelineId = randomUUID();
    const steps: PipelineStep[] = [];
    const pipelineStart = Date.now();

    let currentAgent = startingAgent;
    let currentMessage = message;
    let finalResult: AgentResult | null = null;

    log.info(
      { pipelineId, startingAgent, sessionId: context.sessionId },
      'Pipeline execution started',
    );

    for (let i = 0; i < maxSteps; i++) {
      const step: PipelineStep = {
        agentType: currentAgent,
        result: null,
        startedAt: new Date(),
        completedAt: null,
        error: null,
      };

      try {
        const stepContext: AgentContext = {
          ...context,
          turnId: randomUUID(),
          timestamp: new Date(),
          metadata: {
            ...context.metadata,
            pipelineId,
            pipelineStep: i,
          },
        };

        const result = await this.agentProcessor(currentAgent, currentMessage, stepContext);

        step.result = result;
        step.completedAt = new Date();
        steps.push(step);

        log.info(
          {
            pipelineId,
            step: i,
            agent: currentAgent,
            status: result.status,
            nextAgent: result.nextAgent,
          },
          'Pipeline step completed',
        );

        if (result.status === AgentStatus.ERROR) {
          // Route to escalation on error
          if (currentAgent !== AgentType.ESCALATION) {
            currentAgent = AgentType.ESCALATION;
            currentMessage = {
              role: 'system',
              content: `Previous agent (${step.agentType}) failed: ${result.response}`,
              timestamp: new Date(),
            };
            continue;
          }
          finalResult = result;
          break;
        }

        if (!result.nextAgent || result.status === AgentStatus.COMPLETED) {
          finalResult = result;
          break;
        }

        // Pass result to next agent
        currentAgent = result.nextAgent;
        currentMessage = {
          role: 'assistant',
          content: result.response,
          timestamp: new Date(),
        };
      } catch (err) {
        step.error = err instanceof Error ? err.message : String(err);
        step.completedAt = new Date();
        steps.push(step);

        log.error({ pipelineId, step: i, agent: currentAgent, err }, 'Pipeline step failed');

        if (currentAgent !== AgentType.ESCALATION) {
          currentAgent = AgentType.ESCALATION;
          currentMessage = {
            role: 'system',
            content: `Pipeline error at step ${i} (${step.agentType}): ${step.error}`,
            timestamp: new Date(),
          };
          continue;
        }

        throw new AgentError(
          currentAgent,
          `Pipeline failed at escalation: ${step.error}`,
          { pipelineId, steps },
        );
      }
    }

    if (!finalResult) {
      throw new AgentError('pipeline', 'Pipeline exceeded maximum steps without resolution', {
        pipelineId,
        maxSteps,
      });
    }

    const result: PipelineResult = {
      pipelineId,
      steps,
      finalResult,
      totalDurationMs: Date.now() - pipelineStart,
    };

    log.info(
      {
        pipelineId,
        totalSteps: steps.length,
        durationMs: result.totalDurationMs,
        finalStatus: finalResult.status,
      },
      'Pipeline execution completed',
    );

    return result;
  }
}
