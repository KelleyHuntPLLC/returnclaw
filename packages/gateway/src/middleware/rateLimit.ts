import type { FastifyInstance } from 'fastify';
import { RATE_LIMIT_DEFAULTS } from '@returnclaw/core';

export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(import('@fastify/rate-limit'), {
    max: Number(process.env['RATE_LIMIT_MAX']) || RATE_LIMIT_DEFAULTS.max,
    timeWindow: Number(process.env['RATE_LIMIT_WINDOW_MS']) || RATE_LIMIT_DEFAULTS.windowMs,
    keyGenerator: (request) => {
      const user = request.user as { sub?: string } | undefined;
      return user?.sub ?? request.ip;
    },
    errorResponseBuilder: (_request, context) => ({
      error: 'RateLimitError',
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Rate limit exceeded',
      statusCode: 429,
      retryAfterMs: context.ttl,
    }),
  });
}
