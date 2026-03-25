import { z } from 'zod';

export const ReturnConditionSchema = z.object({
  type: z.enum(['unopened', 'original_packaging', 'tags_attached', 'unused', 'defective', 'any']),
  required: z.boolean(),
  description: z.string(),
});

export const PolicyExceptionSchema = z.object({
  category: z.string(),
  rule: z.string(),
  returnWindow: z.number().optional(),
  nonReturnable: z.boolean().optional(),
});

export const RestockingFeeSchema = z.object({
  percentage: z.number().min(0).max(100),
  applicableCategories: z.array(z.string()),
  waived: z.boolean(),
  waiverCondition: z.string().optional(),
});

export const ExchangePolicySchema = z.object({
  allowed: z.boolean(),
  sameItemOnly: z.boolean(),
  priceDifferenceHandling: z.enum(['refund', 'charge', 'store_credit']),
});

export const CategoryPolicySchema = z.object({
  category: z.string(),
  returnWindow: z.number(),
  conditions: z.array(ReturnConditionSchema),
  nonReturnable: z.boolean(),
  notes: z.string(),
});

export const RetailerPolicySchema = z.object({
  retailerId: z.string(),
  retailerName: z.string(),
  returnWindow: z.number(),
  conditions: z.array(ReturnConditionSchema),
  exceptions: z.array(PolicyExceptionSchema),
  restockingFee: RestockingFeeSchema.nullable(),
  exchangePolicy: ExchangePolicySchema,
  refundMethod: z.array(z.enum(['original_payment', 'store_credit', 'gift_card', 'exchange'])),
  requiresReceipt: z.boolean(),
  freeReturnShipping: z.boolean(),
  dropOffLocations: z.array(z.string()),
  specialCategories: z.array(CategoryPolicySchema),
  lastVerified: z.coerce.date(),
  sourceUrl: z.string().url(),
});

export const EligibilityCheckSchema = z.object({
  retailerId: z.string(),
  orderDate: z.coerce.date(),
  itemCategory: z.string().optional(),
  itemCondition: z.enum(['unopened', 'original_packaging', 'tags_attached', 'unused', 'defective', 'any']).optional(),
});

export type RetailerPolicyInput = z.infer<typeof RetailerPolicySchema>;
export type EligibilityCheckInput = z.infer<typeof EligibilityCheckSchema>;
