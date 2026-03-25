import { z } from 'zod';

export const UuidSchema = z.string().uuid();

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const AddressSchema = z.object({
  street1: z.string().min(1).max(200),
  street2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(2).max(50),
  zip: z.string().min(5).max(10),
  country: z.string().length(2).default('US'),
});

export const ReturnRequestInputSchema = z.object({
  orderId: z.string().uuid(),
  items: z
    .array(
      z.object({
        orderItemId: z.string().uuid(),
        quantity: z.number().int().min(1),
        reason: z.enum([
          'wrong_item',
          'defective',
          'not_as_described',
          'changed_mind',
          'arrived_late',
          'better_price',
          'no_longer_needed',
          'other',
        ]),
        condition: z.string().min(1).max(500),
      }),
    )
    .min(1),
});

export const OrderManualInputSchema = z.object({
  externalId: z.string().min(1).max(100),
  retailerName: z.string().min(1).max(200),
  orderDate: z.coerce.date(),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(500),
        sku: z.string().max(100).optional(),
        category: z.string().max(100).optional(),
        quantity: z.number().int().min(1),
        price: z.number().min(0),
      }),
    )
    .min(1),
  totalAmount: z.number().min(0),
  currency: z.string().length(3).default('USD'),
});

export const VoiceSessionInputSchema = z.object({
  model: z.string().default('gpt-4o-realtime-preview'),
  voice: z.enum(['alloy', 'echo', 'shimmer', 'ash', 'ballad', 'coral', 'sage', 'verse']).default('coral'),
  instructions: z.string().max(5000).optional(),
});

export const LabelRequestSchema = z.object({
  carrierId: z.enum(['ups', 'fedex', 'usps', 'dhl', 'amazon_logistics']),
  serviceCode: z.string().min(1).optional(),
  address: AddressSchema,
});

export const PickupRequestSchema = z.object({
  carrierId: z.enum(['ups', 'fedex', 'usps', 'dhl', 'amazon_logistics']),
  scheduledDate: z.coerce.date(),
  timeWindow: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  address: AddressSchema,
});

export const ReturnStatusUpdateSchema = z.object({
  status: z.enum([
    'eligible',
    'initiated',
    'label_generated',
    'shipped',
    'received',
    'refund_issued',
    'expired',
    'ineligible',
  ]),
  trackingNumber: z.string().optional(),
  refundAmount: z.number().min(0).optional(),
  refundMethod: z.string().optional(),
});

export type PaginationInput = z.infer<typeof PaginationSchema>;
export type ReturnRequestInput = z.infer<typeof ReturnRequestInputSchema>;
export type OrderManualInput = z.infer<typeof OrderManualInputSchema>;
export type VoiceSessionInput = z.infer<typeof VoiceSessionInputSchema>;
export type LabelRequestInput = z.infer<typeof LabelRequestSchema>;
export type PickupRequestInput = z.infer<typeof PickupRequestSchema>;
export type ReturnStatusUpdateInput = z.infer<typeof ReturnStatusUpdateSchema>;
