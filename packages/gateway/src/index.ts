/**
 * ReturnClaw — Voice-first AI agent for consumer returns
 * Copyright (c) 2026 Kelley Hunt, PLLC. All rights reserved.
 * Source-available license. See LICENSE.md for terms.
 * https://kelleyhunt.law
 */
import { logger } from '@returnclaw/core';
import { createServer } from './server.js';

const port = Number(process.env['PORT']) || 3000;
const host = process.env['HOST'] ?? '0.0.0.0';
const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

async function main() {
  const { app } = await createServer({
    port,
    host,
    gateway: { redisUrl },
  });

  try {
    await app.listen({ port, host });
    logger.info({ port, host }, 'ReturnClaw Gateway is running');
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

main().catch((err) => {
  logger.fatal({ err }, 'Unhandled startup error');
  process.exit(1);
});
