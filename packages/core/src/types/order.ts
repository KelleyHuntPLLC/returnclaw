export interface Order {
  id: string;
  externalId: string;
  userId: string;
  retailerId: string;
  retailerName: string;
  orderDate: Date;
  items: OrderItem[];
  totalAmount: number;
  currency: string;
  status: OrderStatus;
  source: OrderSource;
  rawEmailId?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  id: string;
  name: string;
  sku?: string;
  category?: string;
  quantity: number;
  price: number;
  returnEligible: boolean;
  returnDeadline?: Date;
  returnStatus?: ReturnStatus;
}

export enum OrderStatus {
  DETECTED = 'detected',
  CONFIRMED = 'confirmed',
  PARTIALLY_RETURNED = 'partially_returned',
  FULLY_RETURNED = 'fully_returned',
}

export enum ReturnStatus {
  ELIGIBLE = 'eligible',
  INITIATED = 'initiated',
  LABEL_GENERATED = 'label_generated',
  SHIPPED = 'shipped',
  RECEIVED = 'received',
  REFUND_ISSUED = 'refund_issued',
  EXPIRED = 'expired',
  INELIGIBLE = 'ineligible',
}

export type OrderSource = 'email_parse' | 'manual_entry' | 'api_sync';

export interface ReturnRequest {
  id: string;
  orderId: string;
  userId: string;
  items: ReturnItem[];
  reason: ReturnReason;
  status: ReturnStatus;
  retailerId: string;
  deepLink?: string;
  labelUrl?: string;
  trackingNumber?: string;
  carrierId?: string;
  pickupScheduled?: Date;
  refundAmount?: number;
  refundMethod?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReturnItem {
  orderItemId: string;
  quantity: number;
  reason: ReturnReason;
  condition: string;
}

export enum ReturnReason {
  WRONG_ITEM = 'wrong_item',
  DEFECTIVE = 'defective',
  NOT_AS_DESCRIBED = 'not_as_described',
  CHANGED_MIND = 'changed_mind',
  ARRIVED_LATE = 'arrived_late',
  BETTER_PRICE = 'better_price',
  NO_LONGER_NEEDED = 'no_longer_needed',
  OTHER = 'other',
}
