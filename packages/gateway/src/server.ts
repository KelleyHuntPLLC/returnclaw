import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { logger, ReturnClawError } from '@returnclaw/core';
import { registerCors } from './middleware/cors.js';
import { registerAuthPlugin } from './middleware/auth.js';
import { registerRateLimit } from './middleware/rateLimit.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerReturnsRoutes } from './routes/returns.js';
import { registerOrdersRoutes } from './routes/orders.js';
import { registerVoiceRoutes } from './routes/voice.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { registerWebSocketHandler } from './ws/handler.js';
import { Gateway, type GatewayConfig } from './gateway.js';

export interface ServerConfig {
  port: number;
  host: string;
  gateway: GatewayConfig;
}

export async function createServer(config: ServerConfig) {
  const app = Fastify({
    logger: false, // We use our own pino instance
    genReqId: () => randomUUID(),
    requestTimeout: 30_000,
    bodyLimit: 1_048_576, // 1MB
  });

  // Request logging
  app.addHook('onRequest', async (request) => {
    request.log = logger.child({
      requestId: request.id,
      method: request.method,
      url: request.url,
    }) as typeof request.log;
  });

  app.addHook('onResponse', async (request, reply) => {
    logger.info(
      {
        requestId: request.id,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
      },
      'Request completed',
    );
  });

  // Register middleware
  await registerCors(app);
  await registerAuthPlugin(app);
  await registerRateLimit(app);

  // Initialize gateway
  const gateway = Gateway.create(config.gateway);

  // Register routes
  await registerHealthRoutes(app, gateway.sessionManager);
  await registerReturnsRoutes(app);
  await registerOrdersRoutes(app);
  await registerVoiceRoutes(app);
  await registerWebhookRoutes(app);

  // Register WebSocket handler
  await registerWebSocketHandler(app, gateway.sessionManager, gateway);

  // Global error handler
  app.setErrorHandler(async (error: any, request: any, reply: any) => {
    if (error instanceof ReturnClawError) {
      logger.warn(
        {
          requestId: request.id,
          errorCode: error.code,
          statusCode: error.statusCode,
        },
        error.message,
      );
      return reply.status(error.statusCode).send(error.toJSON());
    }

    // Fastify validation errors
    if (error.validation) {
      return reply.status(400).send({
        error: 'ValidationError',
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        statusCode: 400,
        details: { issues: error.validation },
      });
    }

    logger.error(
      { requestId: request.id, err: error },
      'Unhandled error',
    );

    return reply.status(500).send({
      error: 'InternalServerError',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      statusCode: 500,
    });
  });

  // 404 handler
  app.setNotFoundHandler(async (_request, reply) => {
    return reply.status(404).send({
      error: 'NotFound',
      code: 'NOT_FOUND',
      message: 'The requested resource was not found',
      statusCode: 404,
    });
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');

    try {
      await app.close();
      await gateway.shutdown();
      logger.info('Server shut down gracefully');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  return { app, gateway };
}
