import pino from 'pino';
import type { RealtimeTool, RealtimeVoice, TurnDetectionConfig } from '../realtime.js';
import { initiateReturnSchema, execute as executeInitiateReturn } from '../tools/initiateReturn.js';
import { checkPolicySchema, execute as executeCheckPolicy } from '../tools/checkPolicy.js';
import { schedulePickupSchema, execute as executeSchedulePickup } from '../tools/schedulePickup.js';
import { findDropoffSchema, execute as executeFindDropoff } from '../tools/findDropoff.js';

const logger = pino({ name: 'returnclaw-voice-returns-agent' });

export interface ReturnsVoiceAgentConfig {
  name: string;
  instructions: string;
  tools: RealtimeTool[];
  voice: RealtimeVoice;
  turnDetection: TurnDetectionConfig;
  temperature: number;
}

const SYSTEM_INSTRUCTIONS = `You are ReturnClaw, a voice-first returns assistant. You help people return items they've purchased online quickly, easily, and with zero friction.

## Personality
- Warm and empathetic: You understand returning something can be frustrating. Acknowledge the user's situation.
- Efficient and confident: You know the return process inside and out. Guide users decisively without unnecessary back-and-forth.
- Conversational and natural: You're speaking out loud, not writing. Use contractions, keep sentences short, and sound like a helpful friend.
- Proactive: Anticipate what the user needs next. If they mention a retailer, check the policy before being asked. If they want to return, offer to find drop-off locations.

## Core Workflow
1. GREET warmly and ask what they'd like to return.
2. IDENTIFY the retailer and item from the conversation. Ask clarifying questions if needed, but keep them minimal.
3. CHECK THE POLICY using the checkPolicy tool as soon as you know the retailer (and category if mentioned).
4. CONFIRM ELIGIBILITY with the user. If eligible, explain the key details (window, conditions, free shipping). If not, explain why and suggest alternatives.
5. INITIATE THE RETURN using the initiateReturn tool once the user confirms they want to proceed. Share the deep link and walk them through next steps.
6. OFFER LOGISTICS: Ask if they'd like to schedule a pickup or find a nearby drop-off location.
7. WRAP UP: Confirm everything is set, wish them well, and let them know they can come back anytime.

## Guidelines
- Always confirm before taking action ("Would you like me to go ahead and start the return?")
- Never access retailer accounts directly. Use deep links to guide users to the retailer's return portal.
- Be concise. Keep responses to 1-3 sentences when possible. This is a voice conversation, not a blog post.
- Handle one return at a time unless the user explicitly asks for batch processing.
- If an item is ineligible, be honest but helpful: explain why and suggest alternatives (credit card protection, manufacturer warranty, reselling).
- When giving addresses or confirmation numbers, speak slowly and clearly, and offer to repeat.
- If the user interrupts, stop immediately and listen. They may have important context to share.
- Use natural filler phrases sparingly ("Let me check that for you", "One moment") when making tool calls to maintain conversational flow.

## Example Conversation
User: "Hey, I need to return some headphones I got from Amazon"
You: "Sure thing! Let me check Amazon's return policy for electronics real quick."
[uses checkPolicy tool]
You: "Great news - Amazon has a 30-day return window for electronics, and you've still got time. They offer free return shipping too. Would you like me to generate the return link for you?"
User: "Yeah, go ahead"
[uses initiateReturn tool]
You: "Done! I'm sending you the return link now. Once you open it, select your headphones and choose your return reason. Amazon will email you a shipping label. Would you like me to find a drop-off spot near you, or schedule a pickup?"

## Important Notes
- You are speaking out loud. Never use markdown, bullet points, or formatting that doesn't work in speech.
- Spell out abbreviations when speaking (say "U-P-S" not "UPS").
- When sharing links, say "I'll send you the link" rather than reading out a URL.
- If you encounter an error with a tool, apologize briefly and try an alternative approach.
- Respect the user's time. If they seem rushed, skip pleasantries and get to the point.`;

/**
 * Creates the full voice agent configuration for the ReturnClaw returns assistant.
 * This returns the config needed to initialize a RealtimeClient session.
 */
export function createReturnsVoiceAgent(): ReturnsVoiceAgentConfig {
  return {
    name: 'ReturnClaw Voice Agent',
    instructions: SYSTEM_INSTRUCTIONS,
    tools: [
      initiateReturnSchema,
      checkPolicySchema,
      schedulePickupSchema,
      findDropoffSchema,
    ],
    voice: 'coral',
    turnDetection: {
      type: 'server_vad',
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 500,
    },
    temperature: 0.7,
  };
}

/**
 * Routes a tool call to the appropriate tool handler and returns the serialized result.
 * This function is designed to be used as the tool call handler in a VoiceSession.
 *
 * @param toolName - The name of the tool to execute
 * @param args - The arguments passed to the tool by the Realtime API
 * @returns Serialized JSON string result suitable for returning to the Realtime API
 */
export async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  logger.info({ toolName, args }, 'Handling voice tool call');

  try {
    switch (toolName) {
      case 'initiateReturn': {
        const result = await executeInitiateReturn({
          orderId: String(args['orderId'] ?? ''),
          items: Array.isArray(args['items'])
            ? (args['items'] as unknown[]).map(String)
            : [String(args['items'] ?? 'item')],
          reason: String(args['reason'] ?? 'other'),
        });
        logger.info({ toolName, returnId: result.returnId }, 'initiateReturn completed');
        return JSON.stringify(result);
      }

      case 'checkPolicy': {
        const result = await executeCheckPolicy({
          retailer: String(args['retailer'] ?? ''),
          category: args['category'] != null ? String(args['category']) : undefined,
          purchaseDate: args['purchaseDate'] != null ? String(args['purchaseDate']) : undefined,
        });
        logger.info(
          { toolName, retailer: result.retailerName, eligible: result.eligible },
          'checkPolicy completed',
        );
        return JSON.stringify(result);
      }

      case 'schedulePickup': {
        const result = await executeSchedulePickup({
          carrierId: String(args['carrierId'] ?? 'ups'),
          address: (args['address'] ?? {}) as object,
          date: String(args['date'] ?? ''),
          timeWindow: String(args['timeWindow'] ?? 'afternoon'),
        });
        logger.info(
          { toolName, success: result.success, confirmation: result.confirmationNumber },
          'schedulePickup completed',
        );
        return JSON.stringify(result);
      }

      case 'findDropoff': {
        const result = await executeFindDropoff({
          zipCode: String(args['zipCode'] ?? ''),
          carrier: args['carrier'] != null ? String(args['carrier']) : undefined,
          radius: args['radius'] != null ? Number(args['radius']) : undefined,
        });
        logger.info(
          { toolName, success: result.success, count: result.locations.length },
          'findDropoff completed',
        );
        return JSON.stringify(result);
      }

      default: {
        logger.warn({ toolName }, 'Unknown tool called');
        return JSON.stringify({
          error: true,
          message: `Unknown tool: ${toolName}. Available tools are: initiateReturn, checkPolicy, schedulePickup, findDropoff.`,
        });
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
    logger.error({ err, toolName }, 'Tool execution failed');
    return JSON.stringify({
      error: true,
      message: `Tool execution failed: ${errorMessage}. Please try again or ask the user for more information.`,
    });
  }
}
