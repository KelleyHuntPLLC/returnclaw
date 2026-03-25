import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticationError } from '@returnclaw/core';

export interface JwtPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

export async function registerAuthPlugin(app: FastifyInstance): Promise<void> {
  await app.register(import('@fastify/jwt'), {
    secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-me',
    sign: {
      expiresIn: process.env['JWT_EXPIRES_IN'] ?? '7d',
      iss: process.env['JWT_ISSUER'] ?? 'returnclaw',
    },
    verify: {
      allowedIss: process.env['JWT_ISSUER'] ?? 'returnclaw',
    },
  });

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new AuthenticationError('Invalid or expired token');
    }
  });
}

export function getUserIdFromRequest(request: FastifyRequest): string {
  const payload = request.user as JwtPayload;
  if (!payload?.sub) {
    throw new AuthenticationError('Invalid token payload');
  }
  return payload.sub;
}
