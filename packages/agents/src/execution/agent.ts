import {
  AgentType,
  AgentStatus,
  DEEP_LINK_TEMPLATES,
  type SupportedRetailer,
} from '@returnclaw/core';
import type { AgentContext, AgentMessage, AgentResult, AgentAction } from '@returnclaw/core';
import { BaseAgent } from '../base.js';

const SYSTEM_PROMPT = `You are ReturnClaw's execution agent. After a return has been deemed eligible by the policy agent, you help the user complete the return process.

Your job:
1. Generate the correct deep link to the retailer's return/order page
2. Provide clear step-by-step instructions for completing the return
3. Offer to generate a return shipping label
4. Offer to schedule a pickup or find nearby drop-off locations

IMPORTANT COMPLIANCE RULES:
- NEVER access retailer accounts directly
- ONLY provide deep links that take the user to the retailer's own return page
- The user must complete the actual return submission on the retailer's website
- You are a guide, not an automation tool that bypasses retailer interfaces

Respond with JSON:
{
  "response": "Your step-by-step instructions for the user",
  "deepLink": "URL to the retailer's return/order page",
  "steps": ["Step 1...", "Step 2...", ...],
  "offerLabel": boolean,
  "offerPickup": boolean,
  "nextAgent": "carrier" | null
}`;

interface ExecutionOutput {
  response: string;
  deepLink: string;
  steps: string[];
  offerLabel: boolean;
  offerPickup: boolean;
  nextAgent: string | null;
}

export class ExecutionAgent extends BaseAgent {
  readonly type = AgentType.EXECUTION;
  readonly description = 'Handles return workflow execution with deep links and step-by-step guidance';

  async process(input: AgentMessage, context: AgentContext): Promise<AgentResult> {
    this.logAction('execution_start', {
      sessionId: context.sessionId,
      retailer: context.metadata['retailerName'],
    });

    try {
      const retailerName = (context.metadata['retailerName'] as string) ?? '';
      const eligible = context.metadata['eligible'] as boolean;

      if (!eligible) {
        return {
          agentType: this.type,
          status: AgentStatus.ERROR,
          response: 'This item doesn\'t appear to be eligible for return. Let me get you to someone who can help.',
          actions: [],
          nextAgent: AgentType.ESCALATION,
          metadata: {},
        };
      }

      // Try to resolve retailer deep link
      const retailerKey = this.resolveRetailerKey(retailerName);
      const knownDeepLink = retailerKey ? DEEP_LINK_TEMPLATES[retailerKey] : null;

      const contextMessage = `
The user wants to return an item from ${retailerName}.
Policy check passed. The item is eligible for return.
Known return page URL: ${knownDeepLink ?? 'unknown'}
Previous context: ${input.content}

Generate step-by-step return instructions specific to ${retailerName}.`;

      const response = await this.callLLM(
        [{ role: 'user', content: contextMessage }],
        SYSTEM_PROMPT,
        { temperature: 0.2, maxTokens: 1500 },
      );

      let parsed: ExecutionOutput;
      try {
        parsed = JSON.parse(response) as ExecutionOutput;
      } catch {
        return {
          agentType: this.type,
          status: AgentStatus.COMPLETED,
          response,
          actions: [],
          metadata: {},
        };
      }

      const actions: AgentAction[] = [];

      if (parsed.deepLink) {
        actions.push({
          type: 'deep_link',
          payload: {
            url: parsed.deepLink,
            retailer: retailerName,
          },
          requiresConfirmation: false,
        });
      }

      if (parsed.offerLabel) {
        actions.push({
          type: 'generate_label',
          payload: { retailer: retailerName },
          requiresConfirmation: true,
        });
      }

      if (parsed.offerPickup) {
        actions.push({
          type: 'schedule_pickup',
          payload: { retailer: retailerName },
          requiresConfirmation: true,
        });
      }

      const nextAgent = parsed.nextAgent === 'carrier' ? AgentType.CARRIER : undefined;

      this.logAction('execution_complete', {
        retailer: retailerName,
        deepLink: parsed.deepLink,
        stepsCount: parsed.steps.length,
        actionsCount: actions.length,
      });

      return {
        agentType: this.type,
        status: AgentStatus.COMPLETED,
        response: parsed.response,
        actions,
        nextAgent,
        metadata: {
          deepLink: parsed.deepLink,
          steps: parsed.steps,
          offerLabel: parsed.offerLabel,
          offerPickup: parsed.offerPickup,
        },
      };
    } catch (err) {
      this.log.error({ err, sessionId: context.sessionId }, 'Execution failed');
      return {
        agentType: this.type,
        status: AgentStatus.ERROR,
        response: 'I ran into an issue setting up the return. Let me try a different approach.',
        actions: [],
        nextAgent: AgentType.ESCALATION,
        metadata: { error: err instanceof Error ? err.message : String(err) },
      };
    }
  }

  private resolveRetailerKey(retailerName: string): SupportedRetailer | null {
    const normalized = retailerName.toLowerCase().replace(/[^a-z]/g, '');
    const mapping: Record<string, SupportedRetailer> = {
      amazon: 'amazon',
      walmart: 'walmart',
      target: 'target',
      bestbuy: 'bestbuy',
      costco: 'costco',
      apple: 'apple',
      nike: 'nike',
      homedepot: 'homedepot',
      nordstrom: 'nordstrom',
      macys: 'macys',
    };
    return mapping[normalized] ?? null;
  }
}
