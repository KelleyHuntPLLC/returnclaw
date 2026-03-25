import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import {
  OrderManualInputSchema,
  PaginationSchema,
  OrderStatus,
  createChildLogger,
  ValidationError,
} from '@returnclaw/core';
import type { Order } from '@returnclaw/core';
import { getUserIdFromRequest } from '../middleware/auth.js';

const log = createChildLogger({ component: 'orders-routes' });

// In-memory store for development
const ordersStore = new Map<string, Order>();

export async function registerOrdersRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/v1/orders — List detected orders
  app.get('/api/v1/orders', {
    onRequest: [app.authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserIdFromRequest(request);
      const pagination = PaginationSchema.safeParse(request.query);
      const { page, limit } = pagination.success
        ? pagination.data
        : { page: 1, limit: 20 };

      const userOrders = Array.from(ordersStore.values())
        .filter((o) => o.userId === userId)
        .sort((a, b) => b.orderDate.getTime() - a.orderDate.getTime());

      const start = (page - 1) * limit;
      const paginatedOrders = userOrders.slice(start, start + limit);

      return reply.send({
        data: paginatedOrders,
        total: userOrders.length,
        page,
        limit,
        totalPages: Math.ceil(userOrders.length / limit),
      });
    },
  });

  // GET /api/v1/orders/:id — Get order details
  app.get<{ Params: { id: string } }>('/api/v1/orders/:id', {
    onRequest: [app.authenticate],
    handler: async (request, reply) => {
      const userId = getUserIdFromRequest(request);
      const order = ordersStore.get(request.params.id);

      if (!order || order.userId !== userId) {
        return reply.status(404).send({
          error: 'OrderNotFound',
          message: 'Order not found',
        });
      }

      return reply.send(order);
    },
  });

  // POST /api/v1/orders/sync — Trigger email sync for order detection
  app.post('/api/v1/orders/sync', {
    onRequest: [app.authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserIdFromRequest(request);

      log.info({ userId }, 'Order email sync triggered');

      // In production, this would queue a background job to:
      // 1. Fetch new emails from connected accounts
      // 2. Parse order confirmation emails
      // 3. Extract order details
      // 4. Store detected orders

      return reply.status(202).send({
        message: 'Email sync initiated',
        jobId: randomUUID(),
        status: 'processing',
      });
    },
  });

  // POST /api/v1/orders/manual — Manually add an order
  app.post('/api/v1/orders/manual', {
    onRequest: [app.authenticate],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = getUserIdFromRequest(request);
      const parsed = OrderManualInputSchema.safeParse(request.body);

      if (!parsed.success) {
        throw new ValidationError('Invalid order data', {
          issues: parsed.error.issues,
        });
      }

      const now = new Date();
      const order: Order = {
        id: randomUUID(),
        externalId: parsed.data.externalId,
        userId,
        retailerId: '', // Would be matched/created based on retailerName
        retailerName: parsed.data.retailerName,
        orderDate: new Date(parsed.data.orderDate),
        items: parsed.data.items.map((item) => ({
          id: randomUUID(),
          name: item.name,
          sku: item.sku,
          category: item.category,
          quantity: item.quantity,
          price: item.price,
          returnEligible: true,
        })),
        totalAmount: parsed.data.totalAmount,
        currency: parsed.data.currency,
        status: OrderStatus.CONFIRMED,
        source: 'manual_entry',
        metadata: {},
        createdAt: now,
        updatedAt: now,
      };

      ordersStore.set(order.id, order);
      log.info({ orderId: order.id, userId, retailer: order.retailerName }, 'Manual order added');

      return reply.status(201).send(order);
    },
  });
}
