export interface RetailerPolicy {
  retailerId: string;
  retailerName: string;
  returnWindow: number;
  conditions: ReturnCondition[];
  exceptions: PolicyException[];
  restockingFee: RestockingFee | null;
  exchangePolicy: ExchangePolicy;
  refundMethod: RefundMethod[];
  requiresReceipt: boolean;
  freeReturnShipping: boolean;
  dropOffLocations: string[];
  specialCategories: CategoryPolicy[];
  lastVerified: Date;
  sourceUrl: string;
}

export interface ReturnCondition {
  type: 'unopened' | 'original_packaging' | 'tags_attached' | 'unused' | 'defective' | 'any';
  required: boolean;
  description: string;
}

export interface PolicyException {
  category: string;
  rule: string;
  returnWindow?: number;
  nonReturnable?: boolean;
}

export interface RestockingFee {
  percentage: number;
  applicableCategories: string[];
  waived: boolean;
  waiverCondition?: string;
}

export interface ExchangePolicy {
  allowed: boolean;
  sameItemOnly: boolean;
  priceDifferenceHandling: 'refund' | 'charge' | 'store_credit';
}

export type RefundMethod = 'original_payment' | 'store_credit' | 'gift_card' | 'exchange';

export interface CategoryPolicy {
  category: string;
  returnWindow: number;
  conditions: ReturnCondition[];
  nonReturnable: boolean;
  notes: string;
}

export interface PolicyEligibilityResult {
  eligible: boolean;
  retailerName: string;
  returnWindow: number;
  daysRemaining: number;
  conditions: ReturnCondition[];
  restockingFee: RestockingFee | null;
  refundMethods: RefundMethod[];
  freeShipping: boolean;
  reason?: string;
  alternatives?: string[];
}
