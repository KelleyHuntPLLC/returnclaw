/**
 * ReturnClaw — Voice-first AI agent for consumer returns
 * Copyright (c) 2026 Kelley Hunt, PLLC. All rights reserved.
 * Source-available license. See LICENSE.md for terms.
 * https://kelleyhunt.law
 */
// ─── Core types ────────────────────────────────────────────────────────────
export {
  EmailConnection,
  EmailMessage,
  EmailSearchOptions,
  ProviderType,
  BaseEmailProvider,
} from './providers/base';

// ─── Email providers ───────────────────────────────────────────────────────
export { GmailProvider } from './providers/gmail';
export { OutlookProvider } from './providers/outlook';
export { ImapProvider } from './providers/imap';

// ─── Order extractors ──────────────────────────────────────────────────────
export {
  ExtractedOrder,
  OrderItem,
  BaseOrderExtractor,
} from './extractors/base';
export { AmazonOrderExtractor } from './extractors/amazon';
export { WalmartOrderExtractor } from './extractors/walmart';
export { TargetOrderExtractor } from './extractors/target';
export { BestBuyOrderExtractor } from './extractors/bestbuy';
export { GenericOrderExtractor } from './extractors/generic';
export { ExtractorRegistry } from './extractors/registry';

// ─── Main parser ───────────────────────────────────────────────────────────
export { EmailParser, Order, ParseOptions } from './parser';

// ─── Sync ──────────────────────────────────────────────────────────────────
export { EmailSyncScheduler, SyncConfig } from './sync/scheduler';
export { SyncWorker, SyncResult, SyncOptions } from './sync/worker';

// ─── Utilities ─────────────────────────────────────────────────────────────
export {
  htmlToText,
  extractTableRows,
  findLabeledValue,
  extractLinks,
  extractImages,
  parseItemPriceTable,
  cleanHtmlForLlm,
} from './utils/html';

export {
  parseOrderDate,
  parseDeliveryDate,
  parseDateRange,
  calculateReturnByDate,
  isReturnWindowOpen,
  returnWindowRemaining,
  formatDisplayDate,
  daysAgo,
} from './utils/dates';
