import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createChildLogger } from '@returnclaw/core';
import { z } from 'zod';

const log = createChildLogger({ component: 'webhook-routes' });

const CarrierWebhookSchema = z.object({
  carrier: z.enum(['ups', 'fedex', 'usps', 'dhl']),
  event: z.enum(['shipment_created', 'in_transit', 'delivered', 'exception', 'returned']),
  trackingNumber: z.string().min(1),
  timestamp: z.coerce.date(),
  details: z.record(z.unknown()).optional(),
});

const EmailWebhookSchema = z.object({
  provider: z.enum(['gmail', 'outlook', 'yahoo']),
  event: z.enum(['new_email', 'sync_complete', 'auth_expired']),
  userId: z.string().uuid(),
  emailId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/webhooks/carrier — Incoming carrier status updates
  app.post('/api/v1/webhooks/carrier', {
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = CarrierWebhookSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          error: 'InvalidWebhook',
          message: 'Invalid carrier webhook payload',
          issues: parsed.error.issues,
        });
      }

      const { carrier, event, trackingNumber } = parsed.data;

      log.info(
        { carrier, event, trackingNumber },
        'Carrier webhook received',
      );

      // In production, this would:
      // 1. Look up the return request by tracking number
      // 2. Update the return status
      // 3. Notify the user

      return reply.status(200).send({ received: true });
    },
  });

  // POST /api/v1/webhooks/email — Email provider notifications
  app.post('/api/v1/webhooks/email', {
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = EmailWebhookSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          error: 'InvalidWebhook',
          message: 'Invalid email webhook payload',
          issues: parsed.error.issues,
        });
      }

      const { provider, event, userId } = parsed.data;

      log.info(
        { provider, event, userId },
        'Email webhook received',
      );

      // In production, this would:
      // 1. For new_email: Queue email for order detection parsing
      // 2. For sync_complete: Update sync status
      // 3. For auth_expired: Notify user to re-authenticate

      return reply.status(200).send({ received: true });
    },
  });
}
