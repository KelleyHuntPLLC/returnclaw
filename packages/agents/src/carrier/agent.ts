import {
  AgentType,
  AgentStatus,
  CarrierCode,
  CARRIER_TRACKING_URLS,
} from '@returnclaw/core';
import type { AgentContext, AgentMessage, AgentResult, AgentAction } from '@returnclaw/core';
import { BaseAgent } from '../base.js';

const SYSTEM_PROMPT = `You are ReturnClaw's carrier specialist. You help users with shipping labels, pickups, drop-off locations, and package tracking for their returns.

You have access to these carriers:
- UPS: Labels, pickups, UPS Store drop-off
- FedEx: Labels, pickups, FedEx Office drop-off
- USPS: Labels, USPS office drop-off (no home pickup for standard returns)
- DHL: International returns only

When helping a user:
1. Recommend the best carrier based on their needs (cost, speed, convenience)
2. Generate a shipping label if requested
3. Schedule a pickup if available
4. Find nearby drop-off locations
5. Provide tracking information

For drop-off locations, consider common partner locations:
- UPS packages: UPS Store, Michaels, CVS
- FedEx packages: FedEx Office, Walgreens, Dollar General
- USPS packages: USPS Post Office, some grocery stores
- Amazon returns: Whole Foods, Kohl's, Amazon Locker, UPS Store

Respond with JSON:
{
  "response": "Your carrier recommendation and next steps",
  "recommendedCarrier": "ups" | "fedex" | "usps" | "dhl",
  "labelGenerated": boolean,
  "trackingNumber": string | null,
  "trackingUrl": string | null,
  "nearbyDropoffs": [{"name": string, "type": string, "address": string}] | null,
  "pickupAvailable": boolean,
  "estimatedCost": number | null,
  "estimatedDays": number | null
}`;

interface CarrierOutput {
  response: string;
  recommendedCarrier: string;
  labelGenerated: boolean;
  trackingNumber: string | null;
  trackingUrl: string | null;
  nearbyDropoffs: Array<{ name: string; type: string; address: string }> | null;
  pickupAvailable: boolean;
  estimatedCost: number | null;
  estimatedDays: number | null;
}

export class CarrierAgent extends BaseAgent {
  readonly type = AgentType.CARRIER;
  readonly description = 'Interfaces with shipping carriers for labels, pickups, tracking, and drop-off locations';

  async process(input: AgentMessage, context: AgentContext): Promise<AgentResult> {
    this.logAction('carrier_start', {
      sessionId: context.sessionId,
    });

    try {
      const response = await this.callLLM(
        [{ role: 'user', content: input.content }],
        SYSTEM_PROMPT,
        { temperature: 0.2, maxTokens: 1500 },
      );

      let parsed: CarrierOutput;
      try {
        parsed = JSON.parse(response) as CarrierOutput;
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

      if (parsed.labelGenerated && parsed.trackingNumber) {
        actions.push({
          type: 'generate_label',
          payload: {
            carrier: parsed.recommendedCarrier,
            trackingNumber: parsed.trackingNumber,
            trackingUrl: parsed.trackingUrl,
          },
          requiresConfirmation: false,
        });
      }

      if (parsed.pickupAvailable) {
        actions.push({
          type: 'schedule_pickup',
          payload: {
            carrier: parsed.recommendedCarrier,
          },
          requiresConfirmation: true,
        });
      }

      this.logAction('carrier_recommendation', {
        carrier: parsed.recommendedCarrier,
        labelGenerated: parsed.labelGenerated,
        pickupAvailable: parsed.pickupAvailable,
        dropoffCount: parsed.nearbyDropoffs?.length ?? 0,
      });

      return {
        agentType: this.type,
        status: AgentStatus.COMPLETED,
        response: parsed.response,
        actions,
        metadata: {
          carrier: parsed.recommendedCarrier,
          trackingNumber: parsed.trackingNumber,
          trackingUrl: parsed.trackingUrl,
          nearbyDropoffs: parsed.nearbyDropoffs,
          estimatedCost: parsed.estimatedCost,
          estimatedDays: parsed.estimatedDays,
        },
      };
    } catch (err) {
      this.log.error({ err, sessionId: context.sessionId }, 'Carrier processing failed');
      return {
        agentType: this.type,
        status: AgentStatus.ERROR,
        response: 'I had trouble with the carrier service. Let me get you some help.',
        actions: [],
        nextAgent: AgentType.ESCALATION,
        metadata: { error: err instanceof Error ? err.message : String(err) },
      };
    }
  }
}
