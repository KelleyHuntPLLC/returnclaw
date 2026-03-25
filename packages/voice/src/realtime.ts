import WebSocket from 'ws';
import pino from 'pino';
import { EventEmitter } from 'events';

const logger = pino({ name: 'returnclaw-voice-realtime' });

const DEFAULT_MODEL = 'gpt-4o-realtime-preview-2024-12-17';
const REALTIME_API_BASE = 'wss://api.openai.com/v1/realtime';
const HEARTBEAT_INTERVAL_MS = 30_000;
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;
const RECONNECT_MAX_ATTEMPTS = 5;

export type RealtimeVoice = 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'sage' | 'shimmer' | 'verse';

export interface RealtimeConfig {
  apiKey: string;
  model?: string;
  voice?: RealtimeVoice;
  instructions?: string;
  tools?: RealtimeTool[];
  turnDetection?: TurnDetectionConfig;
  inputAudioFormat?: AudioFormat;
  outputAudioFormat?: AudioFormat;
  temperature?: number;
}

export type AudioFormat = 'pcm16' | 'g711_ulaw' | 'g711_alaw';

export interface TurnDetectionConfig {
  type: 'server_vad';
  threshold?: number;
  prefix_padding_ms?: number;
  silence_duration_ms?: number;
}

export interface RealtimeTool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface RealtimeEvents {
  'session:ready': () => void;
  'audio:delta': (base64Audio: string) => void;
  'audio:done': () => void;
  'text:delta': (text: string) => void;
  'text:done': (fullText: string) => void;
  'tool:call': (name: string, args: Record<string, unknown>, callId: string) => void;
  'response:done': (response: RealtimeResponseDone) => void;
  'speech:started': () => void;
  'speech:stopped': () => void;
  'error': (error: RealtimeError) => void;
  'disconnected': () => void;
  'reconnecting': (attempt: number) => void;
}

export interface RealtimeResponseDone {
  id: string;
  status: string;
  usage?: {
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
}

export interface RealtimeError {
  type: string;
  code?: string;
  message: string;
  param?: string;
}

interface ServerEvent {
  type: string;
  [key: string]: unknown;
}

export class RealtimeClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: RealtimeConfig;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalDisconnect = false;
  private _connected = false;

  constructor(config: RealtimeConfig) {
    super();
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    this.intentionalDisconnect = false;
    this.reconnectAttempt = 0;

    return new Promise<void>((resolve, reject) => {
      const model = this.config.model ?? DEFAULT_MODEL;
      const url = `${REALTIME_API_BASE}?model=${encodeURIComponent(model)}`;

      logger.info({ model }, 'Connecting to OpenAI Realtime API');

      this.ws = new WebSocket(url, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      const onOpenError = (err: Error): void => {
        logger.error({ err }, 'Failed to connect to Realtime API');
        reject(err);
      };

      this.ws.once('error', onOpenError);

      this.ws.once('open', () => {
        this.ws?.removeListener('error', onOpenError);
        logger.info('WebSocket connection established');
        this._connected = true;
        this.setupEventHandlers();
        this.startHeartbeat();
        this.sendSessionUpdate();
      });

      // Resolve once we get session.created or session.updated
      const sessionReadyHandler = (): void => {
        this.removeListener('session:ready', sessionReadyHandler);
        resolve();
      };
      this.once('session:ready', sessionReadyHandler);

      // Timeout for initial connection
      const timeout = setTimeout(() => {
        this.removeListener('session:ready', sessionReadyHandler);
        if (!this._connected) {
          this.ws?.close();
          reject(new Error('Connection timeout: session.created not received within 15s'));
        }
      }, 15_000);

      this.once('session:ready', () => {
        clearTimeout(timeout);
      });
    });
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    this.cleanup();
    logger.info('Disconnected from Realtime API');
  }

  sendAudio(audioData: Buffer): void {
    this.assertConnected();
    const base64Audio = audioData.toString('base64');
    this.sendEvent({
      type: 'input_audio_buffer.append',
      audio: base64Audio,
    });
  }

  commitAudio(): void {
    this.assertConnected();
    this.sendEvent({
      type: 'input_audio_buffer.commit',
    });
  }

  sendText(text: string): void {
    this.assertConnected();
    this.sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text,
          },
        ],
      },
    });
    this.sendEvent({
      type: 'response.create',
    });
  }

  respondToToolCall(callId: string, result: string): void {
    this.assertConnected();
    this.sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: result,
      },
    });
    this.sendEvent({
      type: 'response.create',
    });
  }

  interrupt(): void {
    this.assertConnected();
    this.sendEvent({
      type: 'response.cancel',
    });
    logger.debug('Sent response.cancel to interrupt assistant');
  }

  private sendSessionUpdate(): void {
    const sessionConfig: Record<string, unknown> = {
      modalities: ['text', 'audio'],
      voice: this.config.voice ?? 'coral',
      input_audio_format: this.config.inputAudioFormat ?? 'pcm16',
      output_audio_format: this.config.outputAudioFormat ?? 'pcm16',
    };

    if (this.config.instructions != null) {
      sessionConfig['instructions'] = this.config.instructions;
    }

    if (this.config.tools != null && this.config.tools.length > 0) {
      sessionConfig['tools'] = this.config.tools;
      sessionConfig['tool_choice'] = 'auto';
    }

    if (this.config.turnDetection != null) {
      sessionConfig['turn_detection'] = this.config.turnDetection;
    }

    if (this.config.temperature != null) {
      sessionConfig['temperature'] = this.config.temperature;
    }

    this.sendEvent({
      type: 'session.update',
      session: sessionConfig,
    });

    logger.debug({ sessionConfig }, 'Sent session.update');
  }

  private setupEventHandlers(): void {
    if (this.ws == null) return;

    this.ws.on('message', (data: WebSocket.Data) => {
      this.handleMessage(data);
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      const reasonStr = reason.toString();
      logger.info({ code, reason: reasonStr }, 'WebSocket closed');
      this._connected = false;
      this.stopHeartbeat();
      this.emit('disconnected');

      if (!this.intentionalDisconnect) {
        this.attemptReconnect();
      }
    });

    this.ws.on('error', (err: Error) => {
      logger.error({ err }, 'WebSocket error');
      this.emit('error', {
        type: 'websocket_error',
        message: err.message,
      } satisfies RealtimeError);
    });

    this.ws.on('pong', () => {
      logger.trace('Received pong from server');
    });
  }

  private handleMessage(data: WebSocket.Data): void {
    let event: ServerEvent;

    try {
      const raw = typeof data === 'string' ? data : data.toString();
      event = JSON.parse(raw) as ServerEvent;
    } catch (err) {
      logger.error({ err, data: String(data).slice(0, 200) }, 'Failed to parse incoming message');
      return;
    }

    logger.trace({ type: event.type }, 'Received server event');

    switch (event.type) {
      case 'session.created':
      case 'session.updated':
        logger.info({ type: event.type }, 'Session ready');
        this.emit('session:ready');
        break;

      case 'response.audio.delta': {
        const audioDelta = event as ServerEvent & { delta: string };
        this.emit('audio:delta', audioDelta.delta);
        break;
      }

      case 'response.audio.done':
        this.emit('audio:done');
        break;

      case 'response.text.delta': {
        const textDelta = event as ServerEvent & { delta: string };
        this.emit('text:delta', textDelta.delta);
        break;
      }

      case 'response.text.done': {
        const textDone = event as ServerEvent & { text: string };
        this.emit('text:done', textDone.text);
        break;
      }

      case 'response.function_call_arguments.done': {
        const fnCall = event as ServerEvent & {
          call_id: string;
          name: string;
          arguments: string;
        };
        let parsedArgs: Record<string, unknown>;
        try {
          parsedArgs = JSON.parse(fnCall.arguments) as Record<string, unknown>;
        } catch {
          logger.error(
            { callId: fnCall.call_id, rawArgs: fnCall.arguments },
            'Failed to parse function call arguments',
          );
          parsedArgs = {};
        }
        logger.info({ name: fnCall.name, callId: fnCall.call_id }, 'Tool call received');
        this.emit('tool:call', fnCall.name, parsedArgs, fnCall.call_id);
        break;
      }

      case 'response.done': {
        const responseDone = event as ServerEvent & {
          response: {
            id: string;
            status: string;
            usage?: {
              total_tokens?: number;
              input_tokens?: number;
              output_tokens?: number;
            };
          };
        };
        const response = responseDone.response;
        this.emit('response:done', {
          id: response.id,
          status: response.status,
          usage: response.usage,
        } satisfies RealtimeResponseDone);
        break;
      }

      case 'input_audio_buffer.speech_started':
        logger.debug('User speech started');
        this.emit('speech:started');
        break;

      case 'input_audio_buffer.speech_stopped':
        logger.debug('User speech stopped');
        this.emit('speech:stopped');
        break;

      case 'error': {
        const errorEvent = event as ServerEvent & {
          error: {
            type: string;
            code?: string;
            message: string;
            param?: string;
          };
        };
        const realtimeError: RealtimeError = {
          type: errorEvent.error.type,
          code: errorEvent.error.code,
          message: errorEvent.error.message,
          param: errorEvent.error.param,
        };
        logger.error({ error: realtimeError }, 'Realtime API error');
        this.emit('error', realtimeError);
        break;
      }

      case 'response.audio_transcript.delta':
      case 'response.audio_transcript.done':
      case 'conversation.item.created':
      case 'response.created':
      case 'response.output_item.added':
      case 'response.output_item.done':
      case 'response.content_part.added':
      case 'response.content_part.done':
      case 'input_audio_buffer.committed':
      case 'conversation.item.input_audio_transcription.completed':
      case 'rate_limits.updated':
        // Known event types that we do not need to handle directly
        logger.trace({ type: event.type }, 'Unhandled known event');
        break;

      default:
        logger.warn({ type: event.type }, 'Received unknown event type');
        break;
    }
  }

  private sendEvent(event: Record<string, unknown>): void {
    if (this.ws == null || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn({ type: event['type'] }, 'Cannot send event: WebSocket not open');
      return;
    }
    const payload = JSON.stringify(event);
    this.ws.send(payload);
    logger.trace({ type: event['type'] }, 'Sent event');
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws != null && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
        logger.trace('Sent ping');
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer != null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempt >= RECONNECT_MAX_ATTEMPTS) {
      logger.error(
        { attempts: this.reconnectAttempt },
        'Max reconnection attempts reached, giving up',
      );
      this.emit('error', {
        type: 'reconnect_failed',
        message: `Failed to reconnect after ${RECONNECT_MAX_ATTEMPTS} attempts`,
      } satisfies RealtimeError);
      return;
    }

    this.reconnectAttempt++;
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempt - 1),
      RECONNECT_MAX_DELAY_MS,
    );

    logger.info(
      { attempt: this.reconnectAttempt, delay },
      'Scheduling reconnection attempt',
    );
    this.emit('reconnecting', this.reconnectAttempt);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((err: unknown) => {
        logger.error({ err }, 'Reconnection attempt failed');
        this.attemptReconnect();
      });
    }, delay);
  }

  private cleanup(): void {
    this.stopHeartbeat();

    if (this.reconnectTimer != null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws != null) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, 'Client disconnect');
      }
      this.ws = null;
    }

    this._connected = false;
  }

  private assertConnected(): void {
    if (this.ws == null || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('RealtimeClient is not connected. Call connect() first.');
    }
  }
}
