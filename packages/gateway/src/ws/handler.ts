import type { FastifyInstance } from 'fastify';
import { createChildLogger, AgentType } from '@returnclaw/core';
import type { AgentMessage } from '@returnclaw/core';
import type { SessionManager } from '../session/manager.js';
import type { Gateway } from '../gateway.js';

const log = createChildLogger({ component: 'ws-handler' });

interface WsMessage {
  type: 'message' | 'ping' | 'end_session';
  sessionId?: string;
  content?: string;
}

interface WsResponse {
  type: 'response' | 'error' | 'pong' | 'session_ended' | 'agent_update';
  sessionId?: string;
  content?: string;
  agentType?: string;
  error?: string;
}

export async function registerWebSocketHandler(
  app: FastifyInstance,
  sessionManager: SessionManager,
  gateway: Gateway,
): Promise<void> {
  await app.register(import('@fastify/websocket'));

  app.get('/ws', { websocket: true }, (socket, request) => {
    const userId = (request.user as { sub?: string })?.sub;
    if (!userId) {
      socket.send(JSON.stringify({ type: 'error', error: 'Authentication required' } satisfies WsResponse));
      socket.close(1008, 'Authentication required');
      return;
    }

    log.info({ userId }, 'WebSocket connection established');

    socket.on('message', async (rawData) => {
      try {
        const data = JSON.parse(rawData.toString()) as WsMessage;

        switch (data.type) {
          case 'ping': {
            socket.send(JSON.stringify({ type: 'pong' } satisfies WsResponse));
            break;
          }

          case 'message': {
            if (!data.sessionId || !data.content) {
              socket.send(
                JSON.stringify({
                  type: 'error',
                  error: 'sessionId and content are required',
                } satisfies WsResponse),
              );
              return;
            }

            const message: AgentMessage = {
              role: 'user',
              content: data.content,
              timestamp: new Date(),
            };

            await sessionManager.addMessage(data.sessionId, message);

            const result = await gateway.processMessage(data.sessionId, message);

            socket.send(
              JSON.stringify({
                type: 'response',
                sessionId: data.sessionId,
                content: result.finalResult.response,
                agentType: result.finalResult.agentType,
              } satisfies WsResponse),
            );
            break;
          }

          case 'end_session': {
            if (data.sessionId) {
              await sessionManager.destroySession(data.sessionId);
              socket.send(
                JSON.stringify({
                  type: 'session_ended',
                  sessionId: data.sessionId,
                } satisfies WsResponse),
              );
            }
            break;
          }

          default: {
            socket.send(
              JSON.stringify({
                type: 'error',
                error: `Unknown message type`,
              } satisfies WsResponse),
            );
          }
        }
      } catch (err) {
        log.error({ err, userId }, 'WebSocket message handling error');
        socket.send(
          JSON.stringify({
            type: 'error',
            error: err instanceof Error ? err.message : 'Internal error',
          } satisfies WsResponse),
        );
      }
    });

    socket.on('close', () => {
      log.info({ userId }, 'WebSocket connection closed');
    });
  });
}
