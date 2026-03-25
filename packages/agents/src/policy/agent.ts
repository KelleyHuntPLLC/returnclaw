import {
  AgentType,
  AgentStatus,
  SUPPORTED_RETAILERS,
} from '@returnclaw/core';
import type {
  AgentContext,
  AgentMessage,
  AgentResult,
  PolicyEligibilityResult,
} from '@returnclaw/core';
import { BaseAgent } from '../base.js';

const SYSTEM_PROMPT = `You are ReturnClaw's policy specialist. You have deep knowledge of return policies for major US retailers.

When asked about a return, you MUST:
1. Identify the retailer
2. Check the return window (days since purchase vs allowed window)
3. Check any category-specific exceptions
4. Check condition requirements
5. Determine if the item is eligible for return

You know these retailer policies:
- Amazon: 30-day window, free returns on most items. Electronics 30 days. Some categories non-returnable (gift cards, digital content, hazardous materials). Items sold by third-party sellers may differ.
- Walmart: 90-day window for most items. Electronics 30 days. Wireless phones 14 days. Some categories have shorter windows. Free returns via mail or in-store.
- Target: 90-day window (120 days with REDcard). Electronics 30 days. Apple products 15 days. Open music/movies/games can only be exchanged.
- Best Buy: 15-day standard window. 60 days for TotalTech members. Activatable devices 14 days. Must have receipt.
- Costco: 90 days for electronics. Most other items have unlimited return window. Exceptions: diamonds over 1ct (48 hours), cigarettes/alcohol (non-returnable).
- Apple: 14-day return window from delivery/purchase. Must be undamaged, in original packaging. Free return shipping.
- Nike: 30-day return window. Items must be unworn and unwashed with tags. Nike Members can return worn shoes within 30 days.
- Home Depot: 90-day window for most items. 30 days for furniture/area rugs/generators. Custom products non-returnable.
- Nordstrom: Flexible case-by-case policy, no fixed window. Evaluates each return on its merits. Generally very generous.
- Macy's: 30-day return window for most items. Last Act clearance items are final sale. Furniture has different rules.

Respond with JSON:
{
  "eligible": boolean,
  "retailerName": string,
  "returnWindow": number,
  "daysRemaining": number,
  "conditions": [{"type": string, "required": boolean, "description": string}],
  "restockingFee": {"percentage": number, "applicableCategories": string[]} | null,
  "refundMethods": string[],
  "freeShipping": boolean,
  "response": "Your conversational explanation to the user",
  "reason": string | null,
  "alternatives": string[] | null,
  "nextAgent": "execution" | "escalation" | null
}`;

interface PolicyOutput {
  eligible: boolean;
  retailerName: string;
  returnWindow: number;
  daysRemaining: number;
  conditions: Array<{ type: string; required: boolean; description: string }>;
  restockingFee: { percentage: number; applicableCategories: string[] } | null;
  refundMethods: string[];
  freeShipping: boolean;
  response: string;
  reason: string | null;
  alternatives: string[] | null;
  nextAgent: string | null;
}

export class PolicyAgent extends BaseAgent {
  readonly type = AgentType.POLICY;
  readonly description = 'Checks return eligibility against retailer policy graph';

  async process(input: AgentMessage, context: AgentContext): Promise<AgentResult> {
    this.logAction('policy_check_start', {
      sessionId: context.sessionId,
      entities: context.metadata['entities'],
    });

    try {
      // Build context from triage metadata
      const entities = (context.metadata['entities'] as Record<string, string>) ?? {};
      const retailer = entities['retailer'] ?? '';

      const contextMessage = retailer
        ? `User wants to return an item from ${retailer}. Previous context: ${input.content}`
        : input.content;

      const response = await this.callLLM(
        [{ role: 'user', content: contextMessage }],
        SYSTEM_PROMPT,
        { temperature: 0.1, maxTokens: 1500 },
      );

      let parsed: PolicyOutput;
      try {
        parsed = JSON.parse(response) as PolicyOutput;
      } catch {
        return {
          agentType: this.type,
          status: AgentStatus.COMPLETED,
          response,
          actions: [],
          metadata: {},
        };
      }

      const nextAgent = parsed.eligible
        ? AgentType.EXECUTION
        : parsed.nextAgent === 'escalation'
          ? AgentType.ESCALATION
          : undefined;

      this.logAction('policy_check_result', {
        retailer: parsed.retailerName,
        eligible: parsed.eligible,
        daysRemaining: parsed.daysRemaining,
        nextAgent,
      });

      return {
        agentType: this.type,
        status: AgentStatus.COMPLETED,
        response: parsed.response,
        actions: [],
        nextAgent,
        metadata: {
          eligible: parsed.eligible,
          retailerName: parsed.retailerName,
          returnWindow: parsed.returnWindow,
          daysRemaining: parsed.daysRemaining,
          freeShipping: parsed.freeShipping,
          refundMethods: parsed.refundMethods,
          alternatives: parsed.alternatives,
        },
      };
    } catch (err) {
      this.log.error({ err, sessionId: context.sessionId }, 'Policy check failed');
      return {
        agentType: this.type,
        status: AgentStatus.ERROR,
        response: 'I had trouble looking up the return policy. Let me try another approach.',
        actions: [],
        nextAgent: AgentType.ESCALATION,
        metadata: { error: err instanceof Error ? err.message : String(err) },
      };
    }
  }
}
