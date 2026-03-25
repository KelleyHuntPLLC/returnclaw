/**
 * ReturnClaw — Voice-first AI agent for consumer returns
 * Copyright (c) 2026 Kelley Hunt, PLLC. All rights reserved.
 * Source-available license. See LICENSE.md for terms.
 * https://kelleyhunt.law
 */
// Realtime API client
export { RealtimeClient } from './realtime.js';
export type {
  RealtimeConfig,
  RealtimeTool,
  RealtimeVoice,
  RealtimeEvents,
  RealtimeResponseDone,
  RealtimeError,
  AudioFormat,
  TurnDetectionConfig,
} from './realtime.js';

// Voice session management
export { VoiceSession } from './session.js';
export type {
  ConversationTurn,
  VoiceSessionSummary,
  TranscriptEntry,
} from './session.js';

// Returns voice agent
export { createReturnsVoiceAgent, handleToolCall } from './agents/returns.js';
export type { ReturnsVoiceAgentConfig } from './agents/returns.js';

// Tool schemas and executors
export {
  initiateReturnSchema,
  execute as executeInitiateReturn,
} from './tools/initiateReturn.js';

export {
  checkPolicySchema,
  execute as executeCheckPolicy,
} from './tools/checkPolicy.js';

export {
  schedulePickupSchema,
  execute as executeSchedulePickup,
} from './tools/schedulePickup.js';

export {
  findDropoffSchema,
  execute as executeFindDropoff,
} from './tools/findDropoff.js';
