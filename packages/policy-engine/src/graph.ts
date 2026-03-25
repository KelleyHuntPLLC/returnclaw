import {
  createChildLogger,
  PolicyNotFoundError,
} from '@returnclaw/core';
import type {
  RetailerPolicy,
  PolicyEligibilityResult,
  ReturnCondition,
  RefundMethod,
} from '@returnclaw/core';
import { DEEP_LINK_TEMPLATES, type SupportedRetailer } from '@returnclaw/core';
import { PolicyStore } from './store.js';

const log = createChildLogger({ component: 'policy-graph' });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export interface EligibilityResult {
  eligible: boolean;
  reason: string;
  returnWindow: number;
  daysRemaining: number;
  restockingFee?: number;
  refundMethods: string[];
  specialInstructions?: string;
}

export interface ReturnInstructions {
  retailerName: string;
  returnUrl: string;
  deepLink: string | null;
  steps: string[];
  requiredConditions: ReturnCondition[];
  dropOffOptions: string[];
  freeShipping: boolean;
  requiresReceipt: boolean;
  estimatedRefundDays: string;
}

// ---------------------------------------------------------------------------
// PolicyGraph — the main query engine for return policies
// ---------------------------------------------------------------------------

export class PolicyGraph {
  private store: PolicyStore;
  private cache: Map<string, CacheEntry<RetailerPolicy>>;
  private cacheTtlMs: number;

  constructor(store: PolicyStore, cacheTtlMs: number = 3_600_000) {
    this.store = store;
    this.cache = new Map();
    this.cacheTtlMs = cacheTtlMs;
  }

  // -----------------------------------------------------------------------
  // getPolicy — cached policy fetch
  // -----------------------------------------------------------------------

  async getPolicy(retailerId: string): Promise<RetailerPolicy | null> {
    const cacheKey = `retailer:${retailerId}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      log.debug({ retailerId }, 'Cache hit for policy');
      return cached.data;
    }

    // Evict expired entry if present
    if (cached) {
      this.cache.delete(cacheKey);
    }

    const policy = await this.store.getPolicy(retailerId);
    if (!policy) {
      log.warn({ retailerId }, 'Policy not found');
      return null;
    }

    this.cache.set(cacheKey, {
      data: policy,
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    log.debug({ retailerId }, 'Policy fetched and cached');
    return policy;
  }

  // -----------------------------------------------------------------------
  // getPolicyByName — convenience wrapper
  // -----------------------------------------------------------------------

  async getPolicyByName(retailerName: string): Promise<RetailerPolicy | null> {
    const cacheKey = `name:${retailerName.toLowerCase()}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    if (cached) {
      this.cache.delete(cacheKey);
    }

    const policy = await this.store.getPolicyByName(retailerName);
    if (!policy) return null;

    this.cache.set(cacheKey, {
      data: policy,
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    return policy;
  }

  // -----------------------------------------------------------------------
  // checkEligibility — full eligibility evaluation
  // -----------------------------------------------------------------------

  async checkEligibility(
    retailerId: string,
    orderDate: Date,
    category?: string,
    condition?: string,
  ): Promise<EligibilityResult> {
    const policy = await this.getPolicy(retailerId);
    if (!policy) {
      return {
        eligible: false,
        reason: 'No return policy found for this retailer.',
        returnWindow: 0,
        daysRemaining: 0,
        refundMethods: [],
      };
    }

    const daysSincePurchase = Math.floor(
      (Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Determine effective window and conditions for the category
    let effectiveWindow = policy.returnWindow;
    let effectiveConditions = policy.conditions;
    let nonReturnable = false;
    let specialInstructions: string | undefined;

    if (category) {
      // Check special categories first
      const categoryPolicy = policy.specialCategories.find(
        (cp) => cp.category.toLowerCase() === category.toLowerCase(),
      );
      if (categoryPolicy) {
        if (categoryPolicy.nonReturnable) {
          nonReturnable = true;
        }
        effectiveWindow = categoryPolicy.returnWindow;
        effectiveConditions = categoryPolicy.conditions;
        if (categoryPolicy.notes) {
          specialInstructions = categoryPolicy.notes;
        }
      }

      // Check exceptions (override category policy if more specific)
      const exception = policy.exceptions.find(
        (ex) => ex.category.toLowerCase() === category.toLowerCase(),
      );
      if (exception) {
        if (exception.nonReturnable) {
          nonReturnable = true;
        }
        if (exception.returnWindow !== undefined) {
          effectiveWindow = exception.returnWindow;
        }
        if (exception.rule) {
          specialInstructions = exception.rule;
        }
      }
    }

    const daysRemaining = effectiveWindow - daysSincePurchase;
    const withinWindow = daysRemaining > 0;

    // Check item condition against required conditions
    let conditionMet = true;
    if (condition) {
      const requiredConditions = effectiveConditions.filter((c) => c.required);
      if (requiredConditions.length > 0) {
        conditionMet = requiredConditions.some(
          (c) => c.type === condition || c.type === 'any',
        );
      }
    }

    const eligible = !nonReturnable && withinWindow && conditionMet;

    // Build human-readable reason
    const reasons: string[] = [];
    if (nonReturnable) {
      reasons.push('This item category is non-returnable.');
    }
    if (!withinWindow) {
      reasons.push(
        `The ${effectiveWindow}-day return window expired ${Math.abs(daysRemaining)} day(s) ago.`,
      );
    }
    if (!conditionMet) {
      reasons.push('The item condition does not meet the return requirements.');
    }
    if (eligible) {
      reasons.push(
        `Eligible for return. ${Math.max(0, daysRemaining)} day(s) remaining in the ${effectiveWindow}-day window.`,
      );
    }

    const restockingFeeValue =
      policy.restockingFee && !policy.restockingFee.waived
        ? policy.restockingFee.percentage
        : undefined;

    // If restocking fee applies only to certain categories, filter
    if (
      restockingFeeValue !== undefined &&
      category &&
      policy.restockingFee &&
      policy.restockingFee.applicableCategories.length > 0
    ) {
      const applies = policy.restockingFee.applicableCategories.some(
        (ac) => ac.toLowerCase() === category.toLowerCase(),
      );
      if (!applies) {
        // restocking fee does not apply to this category
      }
    }

    const result: EligibilityResult = {
      eligible,
      reason: reasons.join(' '),
      returnWindow: effectiveWindow,
      daysRemaining: Math.max(0, daysRemaining),
      restockingFee: restockingFeeValue,
      refundMethods: policy.refundMethod as string[],
      specialInstructions,
    };

    log.info(
      {
        retailerId,
        eligible,
        daysSincePurchase,
        effectiveWindow,
        daysRemaining,
        category,
        condition,
      },
      'Eligibility check completed',
    );

    return result;
  }

  // -----------------------------------------------------------------------
  // getReturnWindow
  // -----------------------------------------------------------------------

  async getReturnWindow(
    retailerId: string,
    category?: string,
  ): Promise<number> {
    const policy = await this.getPolicy(retailerId);
    if (!policy) {
      throw new PolicyNotFoundError(retailerId);
    }

    if (category) {
      // Check special categories
      const categoryPolicy = policy.specialCategories.find(
        (cp) => cp.category.toLowerCase() === category.toLowerCase(),
      );
      if (categoryPolicy) {
        return categoryPolicy.returnWindow;
      }

      // Check exceptions
      const exception = policy.exceptions.find(
        (ex) => ex.category.toLowerCase() === category.toLowerCase(),
      );
      if (exception?.returnWindow !== undefined) {
        return exception.returnWindow;
      }
    }

    return policy.returnWindow;
  }

  // -----------------------------------------------------------------------
  // getReturnInstructions
  // -----------------------------------------------------------------------

  async getReturnInstructions(
    retailerId: string,
  ): Promise<ReturnInstructions> {
    const policy = await this.getPolicy(retailerId);
    if (!policy) {
      throw new PolicyNotFoundError(retailerId);
    }

    // Try to resolve a deep-link from the core constants
    const slug = policy.retailerName.toLowerCase().replace(/\s+/g, '') as SupportedRetailer;
    const deepLink =
      (DEEP_LINK_TEMPLATES as Record<string, string>)[slug] ?? null;

    // Build step-by-step instructions
    const steps: string[] = [];
    steps.push(`Visit ${policy.sourceUrl} or use the link below to start your return.`);

    if (policy.requiresReceipt) {
      steps.push('Have your receipt or order confirmation number ready.');
    }

    if (policy.conditions.length > 0) {
      const requiredConds = policy.conditions
        .filter((c) => c.required)
        .map((c) => c.description);
      if (requiredConds.length > 0) {
        steps.push(`Ensure the item meets these conditions: ${requiredConds.join('; ')}.`);
      }
    }

    if (policy.freeReturnShipping) {
      steps.push('Print the prepaid return shipping label provided by the retailer.');
    } else {
      steps.push('You may need to cover return shipping costs.');
    }

    if (policy.dropOffLocations.length > 0) {
      steps.push(
        `Drop-off options: ${policy.dropOffLocations.join(', ')}.`,
      );
    }

    if (
      policy.restockingFee &&
      !policy.restockingFee.waived &&
      policy.restockingFee.percentage > 0
    ) {
      steps.push(
        `Note: A ${policy.restockingFee.percentage}% restocking fee may apply.`,
      );
    }

    steps.push(
      'Once the return is received and inspected, your refund will be processed.',
    );

    const estimatedRefundDays =
      policy.freeReturnShipping
        ? '5-10 business days after drop-off'
        : '5-10 business days after the item is received';

    return {
      retailerName: policy.retailerName,
      returnUrl: policy.sourceUrl,
      deepLink,
      steps,
      requiredConditions: policy.conditions.filter((c) => c.required),
      dropOffOptions: policy.dropOffLocations,
      freeShipping: policy.freeReturnShipping,
      requiresReceipt: policy.requiresReceipt,
      estimatedRefundDays,
    };
  }

  // -----------------------------------------------------------------------
  // Cache management
  // -----------------------------------------------------------------------

  clearCache(): void {
    this.cache.clear();
    log.debug('Policy cache cleared');
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async close(): Promise<void> {
    this.clearCache();
    await this.store.close();
  }
}
