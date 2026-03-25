import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  ReturnRequestInputSchema,
  LabelRequestSchema,
  PickupRequestSchema,
  ReturnStatusUpdateSchema,
  ReturnStatus,
  createChildLogger,
  ValidationError,
} from '@returnclaw/core';
import type { ReturnRequest } from '@returnclaw/core';
import { getUserIdFromRequest } from '../middleware/auth.js';

const log = createChildLogger({ component: 'returns-routes' });

// In-memory store for development — replaced by DB in production
const returnsStore = new Map<string, ReturnRequest>();

export async function registerReturnsRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/returns — Initiate a return
  app.post('/api/v1/returns', {
    onRequest: [app.authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserIdFromRequest(request);
      const parsed = ReturnRequestInputSchema.safeParse(request.body);

      if (!parsed.success) {
        throw new ValidationError('Invalid return request', {
          issues: parsed.error.issues,
        });
      }

      const { orderId, items } = parsed.data;
      const now = new Date();

      const returnRequest: ReturnRequest = {
        id: randomUUID(),
        orderId,
        userId,
        items: items.map((item) => ({
          orderItemId: item.orderItemId,
          quantity: item.quantity,
          reason: item.reason as any,
          condition: item.condition,
        })),
        reason: items[0]!.reason as any,
        status: ReturnStatus.INITIATED,
        retailerId: '', // Would be looked up from order
        createdAt: now,
        updatedAt: now,
      };

      returnsStore.set(returnRequest.id, returnRequest);
      log.info({ returnId: returnRequest.id, userId, orderId }, 'Return initiated');

      return reply.status(201).send(returnRequest);
    },
  });

  // GET /api/v1/returns — List user's returns
  app.get('/api/v1/returns', {
    onRequest: [app.authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserIdFromRequest(request);

      const userReturns = Array.from(returnsStore.values()).filter(
        (r) => r.userId === userId,
      );

      return reply.send({
        data: userReturns,
        total: userReturns.length,
      });
    },
  });

  // GET /api/v1/returns/:id — Get return details
  app.get<{ Params: { id: string } }>('/api/v1/returns/:id', {
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const userId = getUserIdFromRequest(request);
      const returnReq = returnsStore.get(request.params.id);

      if (!returnReq || returnReq.userId !== userId) {
        return reply.status(404).send({
          error: 'ReturnNotFound',
          message: 'Return request not found',
        });
      }

      return reply.send(returnReq);
    },
  });

  // POST /api/v1/returns/:id/label — Generate return label
  app.post<{ Params: { id: string } }>('/api/v1/returns/:id/label', {
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const userId = getUserIdFromRequest(request);
      const parsed = LabelRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        throw new ValidationError('Invalid label request', {
          issues: parsed.error.issues,
        });
      }

      const returnReq = returnsStore.get(request.params.id);
      if (!returnReq || returnReq.userId !== userId) {
        return reply.status(404).send({
          error: 'ReturnNotFound',
          message: 'Return request not found',
        });
      }

      // Generate label (carrier integration would go here)
      const label = {
        id: randomUUID(),
        returnRequestId: returnReq.id,
        carrierId: parsed.data.carrierId,
        trackingNumber: `RC${Date.now()}`,
        labelUrl: `https://labels.returnclaw.com/${randomUUID()}.pdf`,
        labelFormat: 'pdf' as const,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      };

      returnReq.labelUrl = label.labelUrl;
      returnReq.trackingNumber = label.trackingNumber;
      returnReq.carrierId = parsed.data.carrierId;
      returnReq.status = ReturnStatus.LABEL_GENERATED;
      returnReq.updatedAt = new Date();

      log.info(
        { returnId: returnReq.id, carrierId: parsed.data.carrierId },
        'Return label generated',
      );

      return reply.status(201).send(label);
    },
  });

  // POST /api/v1/returns/:id/pickup — Schedule pickup
  app.post<{ Params: { id: string } }>('/api/v1/returns/:id/pickup', {
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const userId = getUserIdFromRequest(request);
      const parsed = PickupRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        throw new ValidationError('Invalid pickup request', {
          issues: parsed.error.issues,
        });
      }

      const returnReq = returnsStore.get(request.params.id);
      if (!returnReq || returnReq.userId !== userId) {
        return reply.status(404).send({
          error: 'ReturnNotFound',
          message: 'Return request not found',
        });
      }

      const pickup = {
        id: randomUUID(),
        returnRequestId: returnReq.id,
        carrierId: parsed.data.carrierId,
        scheduledDate: parsed.data.scheduledDate,
        timeWindow: parsed.data.timeWindow,
        address: parsed.data.address,
        status: 'scheduled' as const,
        confirmationNumber: `PU${Date.now()}`,
      };

      returnReq.pickupScheduled = new Date(parsed.data.scheduledDate);
      returnReq.updatedAt = new Date();

      log.info(
        { returnId: returnReq.id, pickupDate: parsed.data.scheduledDate },
        'Pickup scheduled',
      );

      return reply.status(201).send(pickup);
    },
  });

  // PATCH /api/v1/returns/:id — Update return status
  app.patch<{ Params: { id: string } }>('/api/v1/returns/:id', {
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const userId = getUserIdFromRequest(request);
      const parsed = ReturnStatusUpdateSchema.safeParse(request.body);

      if (!parsed.success) {
        throw new ValidationError('Invalid status update', {
          issues: parsed.error.issues,
        });
      }

      const returnReq = returnsStore.get(request.params.id);
      if (!returnReq || returnReq.userId !== userId) {
        return reply.status(404).send({
          error: 'ReturnNotFound',
          message: 'Return request not found',
        });
      }

      returnReq.status = parsed.data.status as ReturnStatus;
      if (parsed.data.trackingNumber) returnReq.trackingNumber = parsed.data.trackingNumber;
      if (parsed.data.refundAmount !== undefined) returnReq.refundAmount = parsed.data.refundAmount;
      if (parsed.data.refundMethod) returnReq.refundMethod = parsed.data.refundMethod;
      returnReq.updatedAt = new Date();

      log.info(
        { returnId: returnReq.id, newStatus: parsed.data.status },
        'Return status updated',
      );

      return reply.send(returnReq);
    },
  });
}
