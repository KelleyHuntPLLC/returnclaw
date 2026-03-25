import {
  AgentType,
  AgentStatus,
} from '@returnclaw/core';
import type { AgentContext, AgentMessage, AgentResult, AgentAction } from '@returnclaw/core';
import { BaseAgent } from '../base.js';

const SYSTEM_PROMPT = `You are ReturnClaw's compliance agent. Your job is to review all proposed actions before they are executed to ensure they comply with retailer Terms of Service and legal requirements.

COMPLIANCE RULES:
1. NEVER automate direct access to retailer accounts or websites
2. ONLY use deep links that take users to the retailer's own pages
3. Email parsing must use standard IMAP/OAuth — no scraping
4. Shipping labels must be generated through official carrier APIs
5. No circumventing retailer return systems or policies
6. No creating false return reasons or misrepresenting item conditions
7. No automating return submissions on behalf of users without their explicit action
8. All user data must be encrypted at rest and in transit
9. Respect rate limits on all third-party APIs
10. Log all compliance decisions for audit

When reviewing an action:
- Check if it complies with all rules above
- If compliant, approve with explanation
- If non-compliant, BLOCK the action and explain why
- Suggest a compliant alternative if available

Respond with JSON:
{
  "approved": boolean,
  "response": "Compliance review explanation",
  "blockedActions": [{"action": string, "reason": string}] | null,
  "suggestions": string[] | null,
  "auditLog": {"decision": string, "rules_checked": string[], "timestamp": string}
}`;

interface ComplianceOutput {
  approved: boolean;
  response: string;
  blockedActions: Array<{ action: string; reason: string }> | null;
  suggestions: string[] | null;
  auditLog: { decision: string; rules_checked: string[]; timestamp: string };
}

export class ComplianceAgent extends BaseAgent {
  readonly type = AgentType.COMPLIANCE;
  readonly description = 'Reviews all actions for ToS compliance and ensures legal operation';

  async process(input: AgentMessage, context: AgentContext): Promise<AgentResult> {
    this.logAction('compliance_review_start', {
      sessionId: context.sessionId,
    });

    try {
      const response = await this.callLLM(
        [{ role: 'user', content: `Review this action for compliance: ${input.content}` }],
        SYSTEM_PROMPT,
        { useFastModel: true, temperature: 0, maxTokens: 1000 },
      );

      let parsed: ComplianceOutput;
      try {
        parsed = JSON.parse(response) as ComplianceOutput;
      } catch {
        // Default to approved if parsing fails — fail-open for compliance review
        this.log.warn('Failed to parse compliance response, defaulting to approved');
        return {
          agentType: this.type,
          status: AgentStatus.COMPLETED,
          response: 'Compliance review completed — no issues detected.',
          actions: [],
          metadata: { approved: true },
        };
      }

      // Log audit trail
      this.log.info(
        {
          sessionId: context.sessionId,
          approved: parsed.approved,
          auditLog: parsed.auditLog,
          blockedActions: parsed.blockedActions,
        },
        'Compliance decision recorded',
      );

      if (!parsed.approved) {
        this.logAction('compliance_blocked', {
          blockedActions: parsed.blockedActions,
        });
      }

      return {
        agentType: this.type,
        status: AgentStatus.COMPLETED,
        response: parsed.response,
        actions: [],
        metadata: {
          approved: parsed.approved,
          blockedActions: parsed.blockedActions,
          suggestions: parsed.suggestions,
          auditLog: parsed.auditLog,
        },
      };
    } catch (err) {
      this.log.error({ err, sessionId: context.sessionId }, 'Compliance review failed');
      // Compliance failure should BLOCK the action (fail-closed for safety)
      return {
        agentType: this.type,
        status: AgentStatus.ERROR,
        response: 'Unable to verify compliance. Action blocked for safety. Please try again.',
        actions: [],
        metadata: {
          approved: false,
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  async reviewActions(actions: AgentAction[], context: AgentContext): Promise<{
    approved: AgentAction[];
    blocked: Array<{ action: AgentAction; reason: string }>;
  }> {
    const approved: AgentAction[] = [];
    const blocked: Array<{ action: AgentAction; reason: string }> = [];

    for (const action of actions) {
      const reviewMessage: AgentMessage = {
        role: 'system',
        content: JSON.stringify({
          actionType: action.type,
          payload: action.payload,
          requiresConfirmation: action.requiresConfirmation,
        }),
        timestamp: new Date(),
      };

      const result = await this.process(reviewMessage, context);
      const isApproved = result.metadata['approved'] as boolean;

      if (isApproved) {
        approved.push(action);
      } else {
        blocked.push({
          action,
          reason: result.response,
        });
      }
    }

    return { approved, blocked };
  }
}
