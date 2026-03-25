/**
 * ReturnClaw — Voice-first AI agent for consumer returns
 * Copyright (c) 2026 Kelley Hunt, PLLC. All rights reserved.
 * Source-available license. See LICENSE.md for terms.
 * https://kelleyhunt.law
 */
// PolicyGraph — main query engine for return policy lookups and eligibility checks
export { PolicyGraph } from './graph.js';
export type { EligibilityResult, ReturnInstructions } from './graph.js';

// PolicyStore — PostgreSQL persistence layer using Drizzle ORM
export {
  PolicyStore,
  retailers,
  policies,
  policyExceptions,
  policyVersions,
} from './store.js';
export type { Retailer, PolicyVersion } from './store.js';

// PolicyMonitor — automated policy change detection and alerting
export { PolicyMonitor } from './monitor.js';
export type { PolicyChangeEvent, PolicyReviewEvent } from './monitor.js';

// Zod schemas for validation
export {
  RetailerPolicySchema,
  EligibilityCheckSchema,
  ReturnConditionSchema,
  PolicyExceptionSchema,
  RestockingFeeSchema,
  ExchangePolicySchema,
  CategoryPolicySchema,
} from './schemas/policy.js';
export type {
  RetailerPolicyInput,
  EligibilityCheckInput,
} from './schemas/policy.js';

// Seed utilities
export { seedRetailers, RETAILER_POLICIES } from './seed/retailers.js';
