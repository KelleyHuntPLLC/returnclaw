import pino from 'pino';
import type {
  RetailerPolicy,
  ReturnCondition,
  PolicyEligibilityResult,
  RefundMethod,
  RestockingFee,
  CategoryPolicy,
} from '@returnclaw/core';
import type { RealtimeTool } from '../realtime.js';

const logger = pino({ name: 'returnclaw-voice-tool-check-policy' });

export const checkPolicySchema: RealtimeTool = {
  type: 'function',
  name: 'checkPolicy',
  description:
    'Check the return policy for a specific retailer, optionally filtered by product category and purchase date. Returns eligibility status, days remaining, conditions, and whether free return shipping is available.',
  parameters: {
    type: 'object',
    properties: {
      retailer: {
        type: 'string',
        description: 'The retailer name (e.g., Amazon, Walmart, Target, Best Buy)',
      },
      category: {
        type: 'string',
        description: 'Optional product category (e.g., Electronics, Clothing, Furniture) to get category-specific rules',
      },
      purchaseDate: {
        type: 'string',
        description: 'The purchase or order date in ISO format (YYYY-MM-DD) to calculate remaining return window',
      },
    },
    required: ['retailer'],
  },
};

/**
 * Built-in retailer policies. In production these would come from a database
 * or configuration service. Policies are maintained and verified by the ReturnClaw compliance team.
 */
const RETAILER_POLICIES: Record<string, RetailerPolicy> = {
  amazon: {
    retailerId: 'amazon',
    retailerName: 'Amazon',
    returnWindow: 30,
    conditions: [
      { type: 'any', required: false, description: 'Most items can be returned in any condition' },
      { type: 'original_packaging', required: false, description: 'Original packaging preferred but not required' },
    ],
    exceptions: [
      { category: 'Digital', rule: 'Non-returnable', nonReturnable: true },
      { category: 'Grocery', rule: 'Non-returnable', nonReturnable: true },
      { category: 'Hazardous Materials', rule: 'Non-returnable', nonReturnable: true },
      { category: 'Gift Cards', rule: 'Non-returnable', nonReturnable: true },
      { category: 'Electronics', rule: 'Must include all accessories and packaging', returnWindow: 30 },
    ],
    restockingFee: null,
    exchangePolicy: {
      allowed: true,
      sameItemOnly: false,
      priceDifferenceHandling: 'refund',
    },
    refundMethod: ['original_payment', 'gift_card'],
    requiresReceipt: false,
    freeReturnShipping: true,
    dropOffLocations: ['ups_store', 'whole_foods', 'amazon_locker', 'kohls'],
    specialCategories: [
      {
        category: 'Electronics',
        returnWindow: 30,
        conditions: [
          { type: 'original_packaging', required: true, description: 'Must include original packaging and all accessories' },
        ],
        nonReturnable: false,
        notes: 'Opened electronics may receive partial refund',
      },
      {
        category: 'Clothing',
        returnWindow: 30,
        conditions: [
          { type: 'tags_attached', required: false, description: 'Tags preferred but not required for most items' },
        ],
        nonReturnable: false,
        notes: 'Try Before You Buy items have extended window',
      },
      {
        category: 'Baby',
        returnWindow: 90,
        conditions: [
          { type: 'any', required: false, description: 'Extended return window for baby items' },
        ],
        nonReturnable: false,
        notes: 'Baby registry items have 90-day return window',
      },
    ],
    lastVerified: new Date('2024-12-01'),
    sourceUrl: 'https://www.amazon.com/gp/help/customer/display.html?nodeId=GKM69DUUYKQWKPJ7',
  },
  walmart: {
    retailerId: 'walmart',
    retailerName: 'Walmart',
    returnWindow: 90,
    conditions: [
      { type: 'unused', required: false, description: 'Item should be unused or in original condition' },
      { type: 'original_packaging', required: false, description: 'Original packaging preferred' },
    ],
    exceptions: [
      { category: 'Electronics', rule: '30-day return window for electronics', returnWindow: 30 },
      { category: 'Wireless Phones', rule: '14-day return window', returnWindow: 14 },
      { category: 'Perishables', rule: 'Non-returnable', nonReturnable: true },
    ],
    restockingFee: null,
    exchangePolicy: {
      allowed: true,
      sameItemOnly: false,
      priceDifferenceHandling: 'refund',
    },
    refundMethod: ['original_payment', 'store_credit'],
    requiresReceipt: false,
    freeReturnShipping: true,
    dropOffLocations: ['fedex_office', 'usps_office'],
    specialCategories: [
      {
        category: 'Electronics',
        returnWindow: 30,
        conditions: [
          { type: 'original_packaging', required: true, description: 'Must include all accessories and original packaging' },
        ],
        nonReturnable: false,
        notes: 'Electronics have a shorter 30-day window',
      },
    ],
    lastVerified: new Date('2024-11-15'),
    sourceUrl: 'https://www.walmart.com/cp/returns/1231920',
  },
  target: {
    retailerId: 'target',
    retailerName: 'Target',
    returnWindow: 90,
    conditions: [
      { type: 'any', required: false, description: 'Most items returnable in any condition' },
      { type: 'original_packaging', required: false, description: 'Original packaging preferred' },
    ],
    exceptions: [
      { category: 'Electronics', rule: '30-day return window', returnWindow: 30 },
      { category: 'Apple Products', rule: '15-day return window', returnWindow: 15 },
      { category: 'Opened Music/Movies/Video Games', rule: 'Exchange only for same title', nonReturnable: false },
    ],
    restockingFee: null,
    exchangePolicy: {
      allowed: true,
      sameItemOnly: false,
      priceDifferenceHandling: 'refund',
    },
    refundMethod: ['original_payment', 'store_credit', 'gift_card'],
    requiresReceipt: false,
    freeReturnShipping: true,
    dropOffLocations: ['usps_office', 'ups_store'],
    specialCategories: [
      {
        category: 'Target Owned Brands',
        returnWindow: 365,
        conditions: [
          { type: 'any', required: false, description: 'One-year return window for Target owned brands' },
        ],
        nonReturnable: false,
        notes: 'Cat & Jack, All in Motion, Goodfellow have a 1-year return window',
      },
    ],
    lastVerified: new Date('2024-11-20'),
    sourceUrl: 'https://help.target.com/help/subcategoryarticle?childcat=Returns+%26+Exchanges',
  },
  bestbuy: {
    retailerId: 'bestbuy',
    retailerName: 'Best Buy',
    returnWindow: 15,
    conditions: [
      { type: 'original_packaging', required: true, description: 'Items must be returned with original packaging and accessories' },
    ],
    exceptions: [
      { category: 'Cell Phones', rule: '14-day return window', returnWindow: 14 },
      { category: 'Major Appliances', rule: '15-day return window with delivery return only', returnWindow: 15 },
      { category: 'Final Sale', rule: 'Non-returnable', nonReturnable: true },
    ],
    restockingFee: {
      percentage: 15,
      applicableCategories: ['Drones', 'DSLR Cameras', 'Electric Vehicles'],
      waived: false,
    },
    exchangePolicy: {
      allowed: true,
      sameItemOnly: false,
      priceDifferenceHandling: 'charge',
    },
    refundMethod: ['original_payment', 'store_credit'],
    requiresReceipt: true,
    freeReturnShipping: true,
    dropOffLocations: ['ups_store'],
    specialCategories: [
      {
        category: 'TotalTech Members',
        returnWindow: 60,
        conditions: [
          { type: 'original_packaging', required: true, description: 'Must include all original packaging' },
        ],
        nonReturnable: false,
        notes: 'TotalTech members get extended 60-day return window',
      },
    ],
    lastVerified: new Date('2024-12-05'),
    sourceUrl: 'https://www.bestbuy.com/site/help-topics/return-exchange-policy/pcmcat260800050014.c',
  },
  costco: {
    retailerId: 'costco',
    retailerName: 'Costco',
    returnWindow: -1, // unlimited for most items
    conditions: [
      { type: 'any', required: false, description: 'Costco has a satisfaction guarantee with no time limit for most items' },
    ],
    exceptions: [
      { category: 'Electronics', rule: '90-day return window for electronics', returnWindow: 90 },
      { category: 'Diamonds', rule: '48-hour inspection period', returnWindow: 2 },
      { category: 'Cigarettes/Alcohol', rule: 'Non-returnable where prohibited', nonReturnable: true },
    ],
    restockingFee: null,
    exchangePolicy: {
      allowed: true,
      sameItemOnly: false,
      priceDifferenceHandling: 'refund',
    },
    refundMethod: ['original_payment'],
    requiresReceipt: false,
    freeReturnShipping: true,
    dropOffLocations: [],
    specialCategories: [
      {
        category: 'Electronics',
        returnWindow: 90,
        conditions: [
          { type: 'original_packaging', required: false, description: 'Original packaging preferred for electronics' },
        ],
        nonReturnable: false,
        notes: 'TVs, computers, cameras, and similar electronics have 90-day window',
      },
    ],
    lastVerified: new Date('2024-11-30'),
    sourceUrl: 'https://www.costco.com/return-policy.html',
  },
  nike: {
    retailerId: 'nike',
    retailerName: 'Nike',
    returnWindow: 60,
    conditions: [
      { type: 'unused', required: false, description: 'Nike accepts worn items within 60 days for Members' },
    ],
    exceptions: [
      { category: 'Customized (Nike By You)', rule: 'Non-returnable unless defective', nonReturnable: true },
      { category: 'Gift Cards', rule: 'Non-returnable', nonReturnable: true },
    ],
    restockingFee: null,
    exchangePolicy: {
      allowed: false,
      sameItemOnly: false,
      priceDifferenceHandling: 'refund',
    },
    refundMethod: ['original_payment'],
    requiresReceipt: false,
    freeReturnShipping: true,
    dropOffLocations: ['ups_store', 'fedex_office'],
    specialCategories: [],
    lastVerified: new Date('2024-12-01'),
    sourceUrl: 'https://www.nike.com/help/a/returns-policy',
  },
  apple: {
    retailerId: 'apple',
    retailerName: 'Apple',
    returnWindow: 14,
    conditions: [
      { type: 'original_packaging', required: true, description: 'Must be returned with original packaging and all accessories' },
      { type: 'unused', required: false, description: 'Item can be opened but should be in like-new condition' },
    ],
    exceptions: [
      { category: 'Software', rule: 'Non-returnable if opened', nonReturnable: true },
      { category: 'Gift Cards', rule: 'Non-returnable', nonReturnable: true },
      { category: 'AppleCare', rule: 'Can cancel within 30 days', returnWindow: 30 },
    ],
    restockingFee: null,
    exchangePolicy: {
      allowed: true,
      sameItemOnly: false,
      priceDifferenceHandling: 'charge',
    },
    refundMethod: ['original_payment'],
    requiresReceipt: true,
    freeReturnShipping: true,
    dropOffLocations: ['ups_store', 'fedex_office'],
    specialCategories: [
      {
        category: 'iPhone',
        returnWindow: 14,
        conditions: [
          { type: 'original_packaging', required: true, description: 'Must include box, charger, and all accessories' },
        ],
        nonReturnable: false,
        notes: 'Carrier-financed phones may have additional restrictions',
      },
    ],
    lastVerified: new Date('2024-12-01'),
    sourceUrl: 'https://www.apple.com/shop/help/returns_refund',
  },
  nordstrom: {
    retailerId: 'nordstrom',
    retailerName: 'Nordstrom',
    returnWindow: -1, // No fixed time limit
    conditions: [
      { type: 'any', required: false, description: 'Nordstrom evaluates returns on a case-by-case basis' },
    ],
    exceptions: [
      { category: 'Special Occasion Dresses', rule: 'Must have tags attached', nonReturnable: false },
      { category: 'Nordstrom Rack', rule: '45-day return window', returnWindow: 45 },
    ],
    restockingFee: null,
    exchangePolicy: {
      allowed: true,
      sameItemOnly: false,
      priceDifferenceHandling: 'refund',
    },
    refundMethod: ['original_payment', 'store_credit'],
    requiresReceipt: false,
    freeReturnShipping: true,
    dropOffLocations: ['usps_office', 'ups_store'],
    specialCategories: [],
    lastVerified: new Date('2024-11-25'),
    sourceUrl: 'https://www.nordstrom.com/customer-service/return-policy',
  },
  macys: {
    retailerId: 'macys',
    retailerName: "Macy's",
    returnWindow: 30,
    conditions: [
      { type: 'original_packaging', required: false, description: 'Original packaging preferred' },
      { type: 'tags_attached', required: false, description: 'Tags should be attached if possible' },
    ],
    exceptions: [
      { category: 'Last Act', rule: 'Final sale, non-returnable', nonReturnable: true },
      { category: 'Furniture/Mattresses', rule: 'Non-returnable after delivery', nonReturnable: true },
      { category: 'Apple Products', rule: '14-day return window', returnWindow: 14 },
    ],
    restockingFee: null,
    exchangePolicy: {
      allowed: true,
      sameItemOnly: false,
      priceDifferenceHandling: 'refund',
    },
    refundMethod: ['original_payment', 'store_credit'],
    requiresReceipt: true,
    freeReturnShipping: false,
    dropOffLocations: ['usps_office', 'ups_store'],
    specialCategories: [],
    lastVerified: new Date('2024-11-28'),
    sourceUrl: 'https://www.macys.com/service/returns-exchanges/',
  },
  homedepot: {
    retailerId: 'homedepot',
    retailerName: 'Home Depot',
    returnWindow: 90,
    conditions: [
      { type: 'unused', required: false, description: 'Items should be unused and in sellable condition' },
      { type: 'original_packaging', required: false, description: 'Original packaging preferred' },
    ],
    exceptions: [
      { category: 'Major Appliances', rule: '48-hour return window after delivery', returnWindow: 2 },
      { category: 'Generators', rule: 'Non-returnable if fuel has been added', nonReturnable: true },
      { category: 'Cut Materials', rule: 'Non-returnable', nonReturnable: true },
    ],
    restockingFee: {
      percentage: 15,
      applicableCategories: ['Special Order Items'],
      waived: false,
    },
    exchangePolicy: {
      allowed: true,
      sameItemOnly: false,
      priceDifferenceHandling: 'refund',
    },
    refundMethod: ['original_payment', 'store_credit'],
    requiresReceipt: false,
    freeReturnShipping: true,
    dropOffLocations: ['ups_store'],
    specialCategories: [],
    lastVerified: new Date('2024-12-01'),
    sourceUrl: 'https://www.homedepot.com/c/Return_Policy',
  },
};

function normalizeRetailerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^the/, '');
}

function findRetailerPolicy(retailerName: string): RetailerPolicy | null {
  const normalized = normalizeRetailerName(retailerName);

  // Direct lookup
  const directMatch = RETAILER_POLICIES[normalized];
  if (directMatch != null) {
    return directMatch;
  }

  // Fuzzy match
  for (const [key, policy] of Object.entries(RETAILER_POLICIES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return policy;
    }
  }

  return null;
}

function findCategoryPolicy(policy: RetailerPolicy, category: string): CategoryPolicy | null {
  if (category.length === 0) return null;

  const normalizedCategory = category.toLowerCase();
  for (const catPolicy of policy.specialCategories) {
    if (catPolicy.category.toLowerCase().includes(normalizedCategory) ||
        normalizedCategory.includes(catPolicy.category.toLowerCase())) {
      return catPolicy;
    }
  }
  return null;
}

function findCategoryException(
  policy: RetailerPolicy,
  category: string,
): { returnWindow?: number; nonReturnable?: boolean } | null {
  if (category.length === 0) return null;

  const normalizedCategory = category.toLowerCase();
  for (const exception of policy.exceptions) {
    if (exception.category.toLowerCase().includes(normalizedCategory) ||
        normalizedCategory.includes(exception.category.toLowerCase())) {
      return {
        returnWindow: exception.returnWindow,
        nonReturnable: exception.nonReturnable,
      };
    }
  }
  return null;
}

function calculateDaysRemaining(purchaseDate: Date, returnWindow: number): number {
  if (returnWindow < 0) {
    return Infinity;
  }

  const now = new Date();
  const deadline = new Date(purchaseDate);
  deadline.setDate(deadline.getDate() + returnWindow);

  const diffMs = deadline.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export async function execute(
  args: { retailer: string; category?: string; purchaseDate?: string },
): Promise<PolicyEligibilityResult> {
  const { retailer, category, purchaseDate } = args;

  logger.info({ retailer, category, purchaseDate }, 'Checking return policy');

  if (retailer.trim().length === 0) {
    throw new Error('Retailer name is required');
  }

  const policy = findRetailerPolicy(retailer);

  if (policy == null) {
    logger.warn({ retailer }, 'Retailer policy not found');
    return {
      eligible: false,
      retailerName: retailer,
      returnWindow: 0,
      daysRemaining: 0,
      conditions: [],
      restockingFee: null,
      refundMethods: [],
      freeShipping: false,
      reason: `We don't have return policy information for ${retailer} yet. We recommend checking their website directly or contacting their customer service.`,
      alternatives: [
        'Check the retailer website for their return policy',
        'Look for return information on your order confirmation email',
        'Contact the retailer customer service directly',
      ],
    };
  }

  // Determine the effective return window based on category
  let effectiveWindow = policy.returnWindow;
  let effectiveConditions: ReturnCondition[] = [...policy.conditions];
  let categoryNotes: string | undefined;

  if (category != null && category.length > 0) {
    // Check for category-specific exceptions
    const exception = findCategoryException(policy, category);
    if (exception != null) {
      if (exception.nonReturnable === true) {
        logger.info({ retailer, category }, 'Category is non-returnable');
        return {
          eligible: false,
          retailerName: policy.retailerName,
          returnWindow: 0,
          daysRemaining: 0,
          conditions: [],
          restockingFee: null,
          refundMethods: [],
          freeShipping: false,
          reason: `${category} items are non-returnable at ${policy.retailerName}.`,
          alternatives: [
            'Contact the retailer for defective items',
            'Check if the item qualifies for a warranty claim',
            'Consider reselling the item',
          ],
        };
      }
      if (exception.returnWindow != null) {
        effectiveWindow = exception.returnWindow;
      }
    }

    // Check for special category policies
    const catPolicy = findCategoryPolicy(policy, category);
    if (catPolicy != null) {
      if (catPolicy.nonReturnable) {
        return {
          eligible: false,
          retailerName: policy.retailerName,
          returnWindow: 0,
          daysRemaining: 0,
          conditions: catPolicy.conditions,
          restockingFee: null,
          refundMethods: [],
          freeShipping: false,
          reason: `${category} items are non-returnable at ${policy.retailerName}. ${catPolicy.notes}`,
        };
      }
      effectiveWindow = catPolicy.returnWindow;
      effectiveConditions = catPolicy.conditions;
      categoryNotes = catPolicy.notes;
    }
  }

  // Calculate days remaining if purchase date is provided
  let daysRemaining: number;
  let eligible: boolean;

  if (purchaseDate != null && purchaseDate.length > 0) {
    const parsedDate = new Date(purchaseDate);
    if (isNaN(parsedDate.getTime())) {
      throw new Error(`Invalid purchase date format: ${purchaseDate}. Use YYYY-MM-DD.`);
    }
    daysRemaining = calculateDaysRemaining(parsedDate, effectiveWindow);
    eligible = effectiveWindow < 0 || daysRemaining > 0;
  } else {
    // Without a purchase date, assume eligible and report the full window
    daysRemaining = effectiveWindow < 0 ? Infinity : effectiveWindow;
    eligible = true;
  }

  // Determine if restocking fee applies to this category
  const restockingFee: RestockingFee | null =
    policy.restockingFee != null && category != null
      ? policy.restockingFee.applicableCategories.some(
          (cat) => cat.toLowerCase().includes(category.toLowerCase()),
        )
        ? policy.restockingFee
        : null
      : null;

  const result: PolicyEligibilityResult = {
    eligible,
    retailerName: policy.retailerName,
    returnWindow: effectiveWindow < 0 ? 9999 : effectiveWindow,
    daysRemaining: daysRemaining === Infinity ? 9999 : daysRemaining,
    conditions: effectiveConditions,
    restockingFee,
    refundMethods: policy.refundMethod as RefundMethod[],
    freeShipping: policy.freeReturnShipping,
  };

  if (!eligible) {
    result.reason = `The return window for ${policy.retailerName} has expired. The deadline was ${effectiveWindow} days after purchase.`;
    result.alternatives = [
      'Contact the retailer directly for exceptions',
      policy.exchangePolicy.allowed ? 'Ask about exchange options' : 'Consider warranty claims for defective items',
      'Check credit card return protection benefits',
    ];
  }

  if (categoryNotes != null) {
    result.reason = ((result.reason ?? '') + ` Note: ${categoryNotes}`).trim();
  }

  logger.info(
    {
      retailer: policy.retailerName,
      eligible,
      daysRemaining: result.daysRemaining,
      returnWindow: effectiveWindow,
    },
    'Policy check complete',
  );

  return result;
}
