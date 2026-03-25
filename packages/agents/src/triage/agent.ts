import {
  AgentType,
  AgentStatus,
} from '@returnclaw/core';
import type { AgentContext, AgentMessage, AgentResult } from '@returnclaw/core';
import { BaseAgent } from '../base.js';

const SYSTEM_PROMPT = `You are ReturnClaw's triage agent. Your job is to understand what the user needs and route them to the right specialist.

You MUST classify the user's intent into one of these categories:
1. RETURN_REQUEST — User wants to return a product. Extract: retailer name, item description, order date/number if mentioned, return reason.
2. ORDER_INQUIRY — User is asking about order status or order details.
3. POLICY_QUESTION — User is asking about a retailer's return policy.
4. CARRIER_STATUS — User is asking about shipping/tracking for a return.
5. GENERAL_HELP — User needs general assistance with ReturnClaw.

For RETURN_REQUEST, you must gather:
- Which retailer (Amazon, Walmart, Target, etc.)
- What item they want to return
- When they bought it (approximate is fine)
- Why they want to return it

If any of these are missing, ask a SINGLE clarifying question to get the most critical missing info. Prioritize: retailer > item > reason > date.

Be warm, efficient, and concise. You're a helpful friend, not a corporate bot.

Respond with JSON:
{
  "classification": "RETURN_REQUEST" | "ORDER_INQUIRY" | "POLICY_QUESTION" | "CARRIER_STATUS" | "GENERAL_HELP",
  "response": "Your conversational response to the user",
  "extracted": {
    "retailer": string | null,
    "item": string | null,
    "orderNumber": string | null,
    "orderDate": string | null,
    "reason": string | null
  },
  "readyToRoute": boolean,
  "nextAgent": "policy" | "execution" | "carrier" | "escalation" | null
}`;

interface TriageOutput {
  classification: string;
  response: string;
  extracted: {
    retailer: string | null;
    item: string | null;
    orderNumber: string | null;
    orderDate: string | null;
    reason: string | null;
  };
  readyToRoute: boolean;
  nextAgent: string | null;
}

export class TriageAgent extends BaseAgent {
  readonly type = AgentType.TRIAGE;
  readonly description = 'Routes user intent to specialized agents and extracts key information';

  async process(input: AgentMessage, context: AgentContext): Promise<AgentResult> {
    this.logAction('triage_start', {
      sessionId: context.sessionId,
      content: input.content.slice(0, 100),
    });

    try {
      const response = await this.callLLM(
        [{ role: 'user', content: input.content }],
        SYSTEM_PROMPT,
        { useFastModel: true, temperature: 0.1 },
      );

      let parsed: TriageOutput;
      try {
        parsed = JSON.parse(response) as TriageOutput;
      } catch {
        // If not valid JSON, use the raw response
        return {
          agentType: this.type,
          status: AgentStatus.COMPLETED,
          response,
          actions: [],
          metadata: { classification: 'general_help' },
        };
      }

      const nextAgentMap: Record<string, AgentType> = {
        policy: AgentType.POLICY,
        execution: AgentType.EXECUTION,
        carrier: AgentType.CARRIER,
        escalation: AgentType.ESCALATION,
      };

      const nextAgent = parsed.nextAgent ? nextAgentMap[parsed.nextAgent] : undefined;

      this.logAction('triage_classified', {
        classification: parsed.classification,
        readyToRoute: parsed.readyToRoute,
        nextAgent: parsed.nextAgent,
        extracted: parsed.extracted,
      });

      return {
        agentType: this.type,
        status: parsed.readyToRoute ? AgentStatus.COMPLETED : AgentStatus.AWAITING_INPUT,
        response: parsed.response,
        actions: [],
        nextAgent: parsed.readyToRoute ? nextAgent : undefined,
        metadata: {
          classification: parsed.classification,
          extracted: parsed.extracted,
          readyToRoute: parsed.readyToRoute,
        },
      };
    } catch (err) {
      this.log.error({ err, sessionId: context.sessionId }, 'Triage processing failed');
      return {
        agentType: this.type,
        status: AgentStatus.ERROR,
        response: 'I\'m having trouble understanding your request. Could you try rephrasing that?',
        actions: [],
        metadata: { error: err instanceof Error ? err.message : String(err) },
      };
    }
  }
}
