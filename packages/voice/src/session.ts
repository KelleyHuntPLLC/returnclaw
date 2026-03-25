import { v4 as uuid } from 'uuid';
import pino from 'pino';
import type { ToolCall } from '@returnclaw/core';
import type { RealtimeClient, RealtimeTool, RealtimeResponseDone } from './realtime.js';

const logger = pino({ name: 'returnclaw-voice-session' });

export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
}

export interface VoiceSessionSummary {
  sessionId: string;
  userId: string;
  duration: number;
  turnCount: number;
  estimatedTokens: number;
  transcript: TranscriptEntry[];
}

export interface TranscriptEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

type AudioOutputHandler = (audio: Buffer) => void;
type TextOutputHandler = (text: string) => void;
type ToolCallHandler = (name: string, args: Record<string, unknown>, callId: string) => void;

export class VoiceSession {
  readonly sessionId: string;
  readonly userId: string;
  private readonly client: RealtimeClient;
  private conversationHistory: ConversationTurn[] = [];
  private transcript: TranscriptEntry[] = [];
  private audioOutputHandlers: AudioOutputHandler[] = [];
  private textOutputHandlers: TextOutputHandler[] = [];
  private toolCallHandlers: ToolCallHandler[] = [];
  private turnCount = 0;
  private estimatedTokens = 0;
  private startTime: Date | null = null;
  private endTime: Date | null = null;
  private isAssistantSpeaking = false;
  private currentAssistantText = '';
  private active = false;

  constructor(sessionId: string, userId: string, client: RealtimeClient) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.client = client;
  }

  async start(instructions: string, _tools: RealtimeTool[]): Promise<void> {
    logger.info({ sessionId: this.sessionId, userId: this.userId }, 'Starting voice session');

    this.startTime = new Date();
    this.active = true;
    this.setupClientListeners();

    if (!this.client.connected) {
      throw new Error('RealtimeClient must be connected before starting a VoiceSession');
    }

    this.addTurn('system', `Session started with instructions provided.`);

    logger.info({ sessionId: this.sessionId }, 'Voice session started');
  }

  async end(): Promise<VoiceSessionSummary> {
    logger.info({ sessionId: this.sessionId }, 'Ending voice session');

    this.endTime = new Date();
    this.active = false;

    // Flush any remaining assistant text as a turn
    this.flushAssistantText();

    this.client.disconnect();
    this.removeClientListeners();

    const duration = this.endTime.getTime() - (this.startTime?.getTime() ?? this.endTime.getTime());

    const summary: VoiceSessionSummary = {
      sessionId: this.sessionId,
      userId: this.userId,
      duration,
      turnCount: this.turnCount,
      estimatedTokens: this.estimatedTokens,
      transcript: [...this.transcript],
    };

    logger.info(
      {
        sessionId: this.sessionId,
        duration,
        turnCount: this.turnCount,
        estimatedTokens: this.estimatedTokens,
      },
      'Voice session ended',
    );

    return summary;
  }

  handleAudioInput(audioChunk: Buffer): void {
    if (!this.active) {
      logger.warn({ sessionId: this.sessionId }, 'Ignoring audio input: session not active');
      return;
    }
    this.client.sendAudio(audioChunk);
  }

  handleTextInput(text: string): void {
    if (!this.active) {
      logger.warn({ sessionId: this.sessionId }, 'Ignoring text input: session not active');
      return;
    }

    this.addTurn('user', text);
    this.addTranscriptEntry('user', text);
    this.turnCount++;
    this.estimatedTokens += this.estimateTokenCount(text);

    this.client.sendText(text);
    logger.debug({ sessionId: this.sessionId, text }, 'Sent text input');
  }

  handleToolResult(callId: string, result: unknown): void {
    if (!this.active) {
      logger.warn({ sessionId: this.sessionId }, 'Ignoring tool result: session not active');
      return;
    }

    const serialized = typeof result === 'string' ? result : JSON.stringify(result);
    this.client.respondToToolCall(callId, serialized);
    logger.debug({ sessionId: this.sessionId, callId }, 'Sent tool result');
  }

  onAudioOutput(callback: AudioOutputHandler): void {
    this.audioOutputHandlers.push(callback);
  }

  onTextOutput(callback: TextOutputHandler): void {
    this.textOutputHandlers.push(callback);
  }

  onToolCall(callback: ToolCallHandler): void {
    this.toolCallHandlers.push(callback);
  }

  private setupClientListeners(): void {
    this.client.on('audio:delta', this.onAudioDelta);
    this.client.on('audio:done', this.onAudioDone);
    this.client.on('text:delta', this.onTextDelta);
    this.client.on('text:done', this.onTextDone);
    this.client.on('tool:call', this.onToolCallEvent);
    this.client.on('response:done', this.onResponseDone);
    this.client.on('speech:started', this.onSpeechStarted);
    this.client.on('speech:stopped', this.onSpeechStopped);
    this.client.on('error', this.onErrorEvent);
  }

  private removeClientListeners(): void {
    this.client.off('audio:delta', this.onAudioDelta);
    this.client.off('audio:done', this.onAudioDone);
    this.client.off('text:delta', this.onTextDelta);
    this.client.off('text:done', this.onTextDone);
    this.client.off('tool:call', this.onToolCallEvent);
    this.client.off('response:done', this.onResponseDone);
    this.client.off('speech:started', this.onSpeechStarted);
    this.client.off('speech:stopped', this.onSpeechStopped);
    this.client.off('error', this.onErrorEvent);
  }

  private readonly onAudioDelta = (base64Audio: string): void => {
    this.isAssistantSpeaking = true;
    const audioBuffer = Buffer.from(base64Audio, 'base64');
    for (const handler of this.audioOutputHandlers) {
      try {
        handler(audioBuffer);
      } catch (err) {
        logger.error({ err, sessionId: this.sessionId }, 'Audio output handler error');
      }
    }
  };

  private readonly onAudioDone = (): void => {
    this.isAssistantSpeaking = false;
    logger.debug({ sessionId: this.sessionId }, 'Audio output complete');
  };

  private readonly onTextDelta = (text: string): void => {
    this.currentAssistantText += text;
    for (const handler of this.textOutputHandlers) {
      try {
        handler(text);
      } catch (err) {
        logger.error({ err, sessionId: this.sessionId }, 'Text output handler error');
      }
    }
  };

  private readonly onTextDone = (fullText: string): void => {
    this.currentAssistantText = fullText;
    this.flushAssistantText();
    logger.debug({ sessionId: this.sessionId }, 'Text output complete');
  };

  private readonly onToolCallEvent = (
    name: string,
    args: Record<string, unknown>,
    callId: string,
  ): void => {
    logger.info({ sessionId: this.sessionId, name, callId }, 'Tool call received in session');

    const toolCall: ToolCall = {
      id: callId,
      name,
      arguments: args,
    };

    const lastTurn = this.conversationHistory[this.conversationHistory.length - 1];
    if (lastTurn != null && lastTurn.role === 'assistant') {
      if (lastTurn.toolCalls == null) {
        lastTurn.toolCalls = [];
      }
      lastTurn.toolCalls.push(toolCall);
    } else {
      this.addTurn('assistant', `[Tool call: ${name}]`, [toolCall]);
    }

    for (const handler of this.toolCallHandlers) {
      try {
        handler(name, args, callId);
      } catch (err) {
        logger.error({ err, sessionId: this.sessionId, name, callId }, 'Tool call handler error');
      }
    }
  };

  private readonly onResponseDone = (response: RealtimeResponseDone): void => {
    if (response.usage != null) {
      this.estimatedTokens += response.usage.total_tokens ?? 0;
    }
    logger.debug(
      { sessionId: this.sessionId, responseId: response.id, status: response.status },
      'Response complete',
    );
  };

  private readonly onSpeechStarted = (): void => {
    logger.debug({ sessionId: this.sessionId }, 'User speech started');

    // If assistant is currently speaking, interrupt it
    if (this.isAssistantSpeaking) {
      logger.info({ sessionId: this.sessionId }, 'Interrupting assistant due to user speech');
      this.client.interrupt();
      this.isAssistantSpeaking = false;
      this.flushAssistantText();
    }
  };

  private readonly onSpeechStopped = (): void => {
    logger.debug({ sessionId: this.sessionId }, 'User speech stopped');
    this.turnCount++;
  };

  private readonly onErrorEvent = (error: { type: string; message: string }): void => {
    logger.error({ sessionId: this.sessionId, error }, 'Realtime error in session');
  };

  private flushAssistantText(): void {
    if (this.currentAssistantText.length > 0) {
      const text = this.currentAssistantText;
      this.addTurn('assistant', text);
      this.addTranscriptEntry('assistant', text);
      this.estimatedTokens += this.estimateTokenCount(text);
      this.currentAssistantText = '';
    }
  }

  private addTurn(role: 'user' | 'assistant' | 'system', content: string, toolCalls?: ToolCall[]): void {
    const turn: ConversationTurn = {
      id: uuid(),
      role,
      content,
      timestamp: new Date(),
      toolCalls,
    };
    this.conversationHistory.push(turn);
  }

  private addTranscriptEntry(role: 'user' | 'assistant', content: string): void {
    this.transcript.push({
      role,
      content,
      timestamp: new Date(),
    });
  }

  /**
   * Rough token count estimate: ~4 characters per token for English text.
   */
  private estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
