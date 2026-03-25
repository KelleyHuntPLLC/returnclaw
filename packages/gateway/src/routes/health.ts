import type { FastifyInstance } from 'fastify';
import type { SessionManager } from '../session/manager.js';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
}

interface ReadinessResponse extends HealthResponse {
  checks: {
    redis: boolean;
    database: boolean;
  };
}

export async function registerHealthRoutes(
  app: FastifyInstance,
  sessionManager: SessionManager,
): Promise<void> {
  app.get('/health', async (_request, reply) => {
    const response: HealthResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env['npm_package_version'] ?? '0.1.0',
      uptime: process.uptime(),
    };
    return reply.send(response);
  });

  app.get('/health/ready', async (_request, reply) => {
    const redisOk = await sessionManager.isHealthy();

    // Database health would be checked here once connected
    const dbOk = true;

    const allOk = redisOk && dbOk;

    const response: ReadinessResponse = {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env['npm_package_version'] ?? '0.1.0',
      uptime: process.uptime(),
      checks: {
        redis: redisOk,
        database: dbOk,
      },
    };

    return reply.status(allOk ? 200 : 503).send(response);
  });
}
