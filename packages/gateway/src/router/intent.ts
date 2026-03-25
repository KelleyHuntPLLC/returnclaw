import OpenAI from 'openai';
import { AgentType, createChildLogger } from '@returnclaw/core';

const log = createChildLogger({ component: 'intent-router' });

export type Intent =
  | 'return_request'
  | 'order_inquiry'
  | 'policy_question'
  | 'carrier_status'
  | 'general_help'
  | 'unclear';

export interface IntentClassification {
  intent: Intent;
  confidence: number;
  extractedEntities: {
    retailer?: string;
    orderNumber?: string;
    itemDescription?: string;
    reason?: string;
  };
  suggestedAgent: AgentType;
  clarificationNeeded: boolean;
  clarificationQuestion?: string;
}

const INTENT_SYSTEM_PROMPT = `You are ReturnClaw's intent classification engine. Given a user message, classify the intent and extract relevant entities.

Respond ONLY with a JSON object matching this schema:
{
  "intent": "return_request" | "order_inquiry" | "policy_question" | "carrier_status" | "general_help" | "unclear",
  "confidence": 0.0-1.0,
  "extractedEntities": {
    "retailer": string | null,
    "orderNumber": string | null,
    "itemDescription": string | null,
    "reason": string | null
  },
  "clarificationNeeded": boolean,
  "clarificationQuestion": string | null
}

Intent mapping:
- return_request: User wants to return a product (e.g., "I want to return my headphones from Amazon")
- order_inquiry: User asking about an order status (e.g., "Where's my order?")
- policy_question: User asking about a retailer's return policy (e.g., "How long do I have to return to Target?")
- carrier_status: User asking about shipping/tracking (e.g., "Where's my return package?")
- general_help: General assistance (e.g., "How does ReturnClaw work?")
- unclear: Cannot determine intent, need clarification`;

const INTENT_TO_AGENT: Record<Intent, AgentType> = {
  return_request: AgentType.TRIAGE,
  order_inquiry: AgentType.TRIAGE,
  policy_question: AgentType.POLICY,
  carrier_status: AgentType.CARRIER,
  general_help: AgentType.TRIAGE,
  unclear: AgentType.TRIAGE,
};

export class IntentRouter {
  private openai: OpenAI;
  private model: string;

  constructor() {
    this.openai = new OpenAI();
    this.model = process.env['OPENAI_MODEL_FAST'] ?? 'gpt-4o-mini';
  }

  async classify(userMessage: string): Promise<IntentClassification> {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: INTENT_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from intent classifier');
      }

      const parsed = JSON.parse(content) as {
        intent: Intent;
        confidence: number;
        extractedEntities: IntentClassification['extractedEntities'];
        clarificationNeeded: boolean;
        clarificationQuestion?: string;
      };

      const classification: IntentClassification = {
        intent: parsed.intent,
        confidence: parsed.confidence,
        extractedEntities: parsed.extractedEntities,
        suggestedAgent: INTENT_TO_AGENT[parsed.intent] ?? AgentType.TRIAGE,
        clarificationNeeded: parsed.clarificationNeeded,
        clarificationQuestion: parsed.clarificationQuestion ?? undefined,
      };

      log.info(
        { intent: classification.intent, confidence: classification.confidence },
        'Intent classified',
      );

      return classification;
    } catch (err) {
      log.error({ err }, 'Intent classification failed, defaulting to triage');
      return {
        intent: 'unclear',
        confidence: 0,
        extractedEntities: {},
        suggestedAgent: AgentType.TRIAGE,
        clarificationNeeded: true,
        clarificationQuestion: 'I didn\'t quite catch that. Could you tell me what you\'d like help with? For example, "I want to return my headphones from Amazon."',
      };
    }
  }
}
