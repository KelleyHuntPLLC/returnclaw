import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  VoiceSessionInputSchema,
  VOICE_SESSION_TTL_SECONDS,
  createChildLogger,
  ValidationError,
} from '@returnclaw/core';
import { getUserIdFromRequest } from '../middleware/auth.js';

const log = createChildLogger({ component: 'voice-routes' });

interface VoiceSessionRecord {
  id: string;
  userId: string;
  model: string;
  voice: string;
  status: 'active' | 'ended';
  createdAt: Date;
  endedAt?: Date;
}

const voiceSessionsStore = new Map<string, VoiceSessionRecord>();

export async function registerVoiceRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/voice/session — Create voice session
  app.post('/api/v1/voice/session', {
    onRequest: [app.authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserIdFromRequest(request);
      const parsed = VoiceSessionInputSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        throw new ValidationError('Invalid voice session request', {
          issues: parsed.error.issues,
        });
      }

      const sessionId = randomUUID();
      const session: VoiceSessionRecord = {
        id: sessionId,
        userId,
        model: parsed.data.model,
        voice: parsed.data.voice,
        status: 'active',
        createdAt: new Date(),
      };

      voiceSessionsStore.set(sessionId, session);

      log.info(
        { sessionId, userId, model: parsed.data.model, voice: parsed.data.voice },
        'Voice session created',
      );

      // In production, this would:
      // 1. Create an OpenAI Realtime session
      // 2. Set up WebRTC signaling
      // 3. Return SDP offer for client connection

      return reply.status(201).send({
        sessionId,
        model: parsed.data.model,
        voice: parsed.data.voice,
        expiresIn: VOICE_SESSION_TTL_SECONDS,
        // WebRTC offer would go here in production
        wsUrl: `ws://localhost:3000/ws/voice/${sessionId}`,
      });
    },
  });

  // DELETE /api/v1/voice/session/:id — End voice session
  app.delete<{ Params: { id: string } }>('/api/v1/voice/session/:id', {
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const userId = getUserIdFromRequest(request);
      const session = voiceSessionsStore.get(request.params.id);

      if (!session || session.userId !== userId) {
        return reply.status(404).send({
          error: 'VoiceSessionNotFound',
          message: 'Voice session not found',
        });
      }

      session.status = 'ended';
      session.endedAt = new Date();

      log.info({ sessionId: session.id, userId }, 'Voice session ended');

      return reply.send({
        sessionId: session.id,
        status: 'ended',
        duration: session.endedAt.getTime() - session.createdAt.getTime(),
      });
    },
  });
}
