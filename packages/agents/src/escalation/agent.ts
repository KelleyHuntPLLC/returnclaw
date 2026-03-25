import {
  AgentType,
  AgentStatus,
} from '@returnclaw/core';
import type { AgentContext, AgentMessage, AgentResult, AgentAction } from '@returnclaw/core';
import { BaseAgent } from '../base.js';

const SYSTEM_PROMPT = `You are ReturnClaw's escalation specialist. You handle complex cases that other agents couldn't resolve. Your job is to find creative solutions and alternatives.

Common escalation scenarios:
1. PAST RETURN WINDOW — Item is past the standard return window
   Solutions: Credit card purchase protection (Visa, Mastercard, Amex typically extend 90 days), manufacturer warranty claim, goodwill return request email template, resale suggestion

2. DEFECTIVE ITEM — Item is defective but past return window
   Solutions: Manufacturer warranty claim, credit card extended warranty protection, state consumer protection laws, small claims court (extreme cases)

3. POLICY DENIAL — Retailer policy doesn't allow the return
   Solutions: Manager escalation email template, social media outreach template, BBB complaint guidance, credit card chargeback (last resort, explain risks)

4. COMPLEX MULTI-ITEM RETURN — Multiple items from same or different retailers
   Solutions: Break into individual return workflows, prioritize by deadline urgency, batch processing guidance

5. MISSING RECEIPT — No proof of purchase
   Solutions: Credit card statement as proof, retailer app order history, email receipt recovery, store lookup by payment method

For each case, provide:
- A clear explanation of why the standard process didn't work
- 2-3 actionable alternatives, ranked by likelihood of success
- Any templates (email, letter) the user can use
- Clear next steps

Be empathetic but practical. The user is frustrated — acknowledge that, then give them a path forward.

Respond with JSON:
{
  "response": "Your empathetic, solution-oriented response",
  "scenario": "past_window" | "defective" | "policy_denial" | "multi_item" | "missing_receipt" | "other",
  "alternatives": [{"name": string, "description": string, "successLikelihood": "high" | "medium" | "low"}],
  "template": string | null,
  "nextSteps": string[]
}`;

interface EscalationOutput {
  response: string;
  scenario: string;
  alternatives: Array<{ name: string; description: string; successLikelihood: string }>;
  template: string | null;
  nextSteps: string[];
}

export class EscalationAgent extends BaseAgent {
  readonly type = AgentType.ESCALATION;
  readonly description = 'Handles edge cases with creative alternatives — warranty claims, dispute templates, escalation paths';

  async process(input: AgentMessage, context: AgentContext): Promise<AgentResult> {
    this.logAction('escalation_start', {
      sessionId: context.sessionId,
    });

    try {
      const response = await this.callLLM(
        [{ role: 'user', content: input.content }],
        SYSTEM_PROMPT,
        { temperature: 0.4, maxTokens: 2000 },
      );

      let parsed: EscalationOutput;
      try {
        parsed = JSON.parse(response) as EscalationOutput;
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

      if (parsed.template) {
        actions.push({
          type: 'send_notification',
          payload: {
            type: 'escalation_template',
            template: parsed.template,
          },
          requiresConfirmation: true,
        });
      }

      this.logAction('escalation_resolved', {
        scenario: parsed.scenario,
        alternativeCount: parsed.alternatives.length,
        hasTemplate: !!parsed.template,
      });

      return {
        agentType: this.type,
        status: AgentStatus.COMPLETED,
        response: parsed.response,
        actions,
        metadata: {
          scenario: parsed.scenario,
          alternatives: parsed.alternatives,
          nextSteps: parsed.nextSteps,
        },
      };
    } catch (err) {
      this.log.error({ err, sessionId: context.sessionId }, 'Escalation processing failed');
      return {
        agentType: this.type,
        status: AgentStatus.ERROR,
        response: 'I\'m sorry, I\'m having trouble finding a solution right now. Please try again in a moment, or contact our support team for direct assistance.',
        actions: [],
        metadata: { error: err instanceof Error ? err.message : String(err) },
      };
    }
  }
}
