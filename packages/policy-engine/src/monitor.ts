// @ts-ignore
import { createChildLogger } from '@returnclaw/core';
import type { RetailerPolicy } from '@returnclaw/core';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { PolicyStore } from './store.js';

const log = createChildLogger({ component: 'policy-monitor' });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PolicyChangeEvent {
  retailerId: string;
  retailerName: string;
  type: 'minor' | 'major';
  field: string;
  previousValue: unknown;
  newValue: unknown;
  detectedAt: Date;
}

export interface PolicyReviewEvent {
  retailerId: string;
  retailerName: string;
  changes: PolicyChangeEvent[];
  policyPageUrl: string;
  rawText: string;
  detectedAt: Date;
}

interface ContentSnapshot {
  hash: string;
  text: string;
  fetchedAt: Date;
}

type CronTask = { stop: () => void };

// Known policy page URLs for monitoring
const POLICY_URLS: Record<string, string> = {
  amazon:
    'https://www.amazon.com/gp/help/customer/display.html?nodeId=GKM69DUUYKQWKCES',
  walmart: 'https://www.walmart.com/cp/returns/1231920',
  target:
    'https://help.target.com/help/subcategoryarticle?childcat=Returns+%26+Exchanges',
  bestbuy:
    'https://www.bestbuy.com/site/help-topics/return-exchange-policy/pcmcat260800050014.c',
  costco: 'https://customerservice.costco.com/app/answers/detail/a_id/1191',
  apple: 'https://www.apple.com/shop/help/returns_refund',
  nike: 'https://www.nike.com/help/a/returns-policy',
  homedepot: 'https://www.homedepot.com/c/Return_Policy',
  nordstrom: 'https://www.nordstrom.com/content/return-policy',
  macys:
    'https://www.customerservice-macys.com/articles/whats-macys-return-policy',
};

// ---------------------------------------------------------------------------
// PolicyMonitor — automated policy change detection
// ---------------------------------------------------------------------------

export class PolicyMonitor extends EventEmitter {
  private store: PolicyStore;
  private cronTask: CronTask | null = null;
  private snapshots: Map<string, ContentSnapshot> = new Map();
  private running = false;

  constructor(store: PolicyStore) {
    super();
    this.store = store;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Start the monitoring loop on a cron schedule.
   * Default: every Sunday at 02:00 (`0 2 * * 0`).
   */
  async start(cronExpression: string = '0 2 * * 0'): Promise<void> {
    if (this.running) {
      log.warn('Monitor is already running');
      return;
    }

    let cron: typeof import('node-cron');
    try {
      cron = await import('node-cron');
    } catch {
      log.error(
        'node-cron is not installed. Install it with: npm i node-cron',
      );
      throw new Error('node-cron dependency is required for PolicyMonitor');
    }

    this.cronTask = cron.schedule(cronExpression, () => {
      this.checkAllRetailers().catch((err: unknown) => {
        log.error({ err }, 'Error during scheduled retailer check');
      });
    });

    this.running = true;
    log.info({ cronExpression }, 'Policy monitor started');
  }

  /**
   * Stop the monitoring loop.
   */
  stop(): void {
    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
    }
    this.running = false;
    log.info('Policy monitor stopped');
  }

  /**
   * Returns whether the monitor cron is currently active.
   */
  isRunning(): boolean {
    return this.running;
  }

  // -----------------------------------------------------------------------
  // Checking
  // -----------------------------------------------------------------------

  /**
   * Check a single retailer's policy page for changes.
   * Fetches the HTML, extracts text with cheerio (or regex fallback),
   * compares the hash against the previous snapshot, and classifies any delta.
   */
  async checkRetailer(retailerId: string): Promise<void> {
    const policy = await this.store.getPolicy(retailerId);
    if (!policy) {
      log.warn({ retailerId }, 'No policy found — skipping check');
      return;
    }

    // Resolve the URL to fetch — prefer the per-retailer map, fall back to sourceUrl
    const slug = policy.retailerName.toLowerCase().replace(/\s+/g, '');
    const url = POLICY_URLS[slug] ?? policy.sourceUrl;

    log.info(
      { retailerId, retailerName: policy.retailerName, url },
      'Checking retailer policy page',
    );

    let pageHtml: string;
    try {
      pageHtml = await this.fetchPage(url);
    } catch (err) {
      log.error(
        { retailerId, err },
        'Failed to fetch policy page — skipping',
      );
      return;
    }

    const extractedText = this.extractPolicyText(pageHtml);
    const currentHash = this.hashContent(extractedText);
    const previousSnapshot = this.snapshots.get(retailerId);

    // First time we see this retailer — store snapshot and return
    if (!previousSnapshot) {
      this.snapshots.set(retailerId, {
        hash: currentHash,
        text: extractedText,
        fetchedAt: new Date(),
      });
      log.info({ retailerId }, 'Initial snapshot stored');
      return;
    }

    // No change
    if (currentHash === previousSnapshot.hash) {
      log.debug({ retailerId }, 'No change detected');
      return;
    }

    // Change detected — classify it
    const changes = this.classifyChanges(
      previousSnapshot.text,
      extractedText,
      policy,
    );

    // Update the snapshot
    this.snapshots.set(retailerId, {
      hash: currentHash,
      text: extractedText,
      fetchedAt: new Date(),
    });

    const hasMinorOnly = changes.length > 0 && changes.every((c) => c.type === 'minor');

    if (hasMinorOnly) {
      // Auto-update for minor changes (date/formatting)
      log.info(
        { retailerId, changeCount: changes.length },
        'Minor policy changes detected — auto-updating',
      );

      const { retailerId: _rid, retailerName: _rn, ...policyData } = policy;
      await this.store.upsertPolicy(retailerId, {
        ...policyData,
        lastVerified: new Date(),
      });

      this.emit('policy:changed', {
        retailerId,
        retailerName: policy.retailerName,
        changes,
        autoUpdated: true,
        detectedAt: new Date(),
      });
    } else {
      // Major changes need human review
      log.warn(
        { retailerId, changeCount: changes.length },
        'Major policy changes detected — flagging for review',
      );

      const reviewEvent: PolicyReviewEvent = {
        retailerId,
        retailerName: policy.retailerName,
        changes,
        policyPageUrl: url,
        rawText: extractedText,
        detectedAt: new Date(),
      };

      this.emit('policy:review_needed', reviewEvent);
    }
  }

  /**
   * Check all retailers currently in the store.
   */
  async checkAllRetailers(): Promise<void> {
    log.info('Starting check of all retailers');

    const allRetailers = await this.store.getAllRetailers();
    let checked = 0;
    let errored = 0;

    for (const retailer of allRetailers) {
      try {
        await this.checkRetailer(retailer.id);
        checked++;
      } catch (err) {
        errored++;
        log.error(
          { retailerId: retailer.id, retailerName: retailer.name, err },
          'Error checking retailer',
        );
      }

      // Polite delay between fetches to avoid hammering servers
      await this.delay(2000);
    }

    log.info(
      { total: allRetailers.length, checked, errored },
      'Finished checking all retailers',
    );
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Fetch a page using native fetch (Node 18+) with a fallback to axios.
   */
  private async fetchPage(url: string): Promise<string> {
    // Try native fetch first (available in Node 18+)
    if (typeof globalThis.fetch === 'function') {
      const response = await globalThis.fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; ReturnClaw/1.0; +https://returnclaw.com)',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching ${url}`);
      }

      return response.text();
    }

    // Fallback: try axios (dynamic import so the module is optional)
    let axios: typeof import('axios');
    try {
      axios = await import('axios');
    } catch {
      throw new Error(
        'Neither native fetch nor axios is available. Node 18+ or axios is required.',
      );
    }

    const resp = await axios.default.get<string>(url, {
      timeout: 30_000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; ReturnClaw/1.0; +https://returnclaw.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
      responseType: 'text',
    });

    return resp.data;
  }

  /**
   * Extract the meaningful policy text from raw HTML.
   * Uses cheerio when available, otherwise falls back to regex stripping.
   */
  private extractPolicyText(html: string): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const cheerio = require('cheerio') as typeof import('cheerio');
      const $ = cheerio.load(html);

      // Remove noise elements
      $('script, style, nav, header, footer, noscript, iframe, svg').remove();

      // Look for common policy containers
      const selectors = [
        '[class*="return" i]',
        '[class*="policy" i]',
        '[id*="return" i]',
        '[id*="policy" i]',
        'article',
        'main',
        '.content',
        '#content',
      ];

      for (const selector of selectors) {
        const el = $(selector);
        if (el.length > 0) {
          const text = el.text().replace(/\s+/g, ' ').trim();
          if (text.length > 100) {
            return text;
          }
        }
      }

      // Fallback: body text
      return $('body').text().replace(/\s+/g, ' ').trim();
    } catch {
      // cheerio not available — use regex-based fallback
      return this.extractPolicyTextFallback(html);
    }
  }

  /**
   * Simple regex-based text extraction when cheerio is not available.
   */
  private extractPolicyTextFallback(html: string): string {
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '');

    // Strip remaining HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();

    // Decode common HTML entities
    text = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');

    return text;
  }

  /**
   * SHA-256 hash of content for quick comparison.
   */
  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Classify detected text changes as minor or major.
   *
   * Minor: date changes, whitespace/formatting, last-verified timestamps.
   * Major: return window number changes, new non-returnable terms,
   *        restocking fee changes, new exception categories.
   */
  private classifyChanges(
    previousText: string,
    currentText: string,
    policy: RetailerPolicy,
  ): PolicyChangeEvent[] {
    const changes: PolicyChangeEvent[] = [];
    const now = new Date();

    const prevNorm = previousText.toLowerCase();
    const currNorm = currentText.toLowerCase();

    // ------------------------------------------------------------------
    // Major: return window number changes
    // ------------------------------------------------------------------
    const windowPatterns = [
      /(\d+)\s*(?:calendar\s*)?days?\s*(?:to\s*)?return/gi,
      /return\s*(?:within|window|period|policy)\s*(?:of\s*)?(\d+)\s*days?/gi,
      /(\d+)\s*-?\s*day\s*return/gi,
    ];

    const prevWindows = this.extractNumbers(prevNorm, windowPatterns);
    const currWindows = this.extractNumbers(currNorm, windowPatterns);

    if (
      prevWindows.length > 0 &&
      currWindows.length > 0 &&
      JSON.stringify(prevWindows.sort((a, b) => a - b)) !==
        JSON.stringify(currWindows.sort((a, b) => a - b))
    ) {
      changes.push({
        retailerId: policy.retailerId,
        retailerName: policy.retailerName,
        type: 'major',
        field: 'returnWindow',
        previousValue: prevWindows,
        newValue: currWindows,
        detectedAt: now,
      });
    }

    // ------------------------------------------------------------------
    // Major: restocking fee changes
    // ------------------------------------------------------------------
    const feePatterns = [
      /(\d+(?:\.\d+)?)\s*%\s*restocking/gi,
      /restocking\s*fee\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*%/gi,
    ];
    const prevFees = this.extractNumbers(prevNorm, feePatterns);
    const currFees = this.extractNumbers(currNorm, feePatterns);

    if (
      JSON.stringify(prevFees.sort((a, b) => a - b)) !==
      JSON.stringify(currFees.sort((a, b) => a - b))
    ) {
      changes.push({
        retailerId: policy.retailerId,
        retailerName: policy.retailerName,
        type: 'major',
        field: 'restockingFee',
        previousValue: prevFees,
        newValue: currFees,
        detectedAt: now,
      });
    }

    // ------------------------------------------------------------------
    // Major: new non-returnable / final sale language
    // ------------------------------------------------------------------
    const nonReturnableTerms = [
      'non-returnable',
      'final sale',
      'no returns',
      'cannot be returned',
      'not eligible for return',
      'all sales final',
    ];

    for (const term of nonReturnableTerms) {
      const prevHas = prevNorm.includes(term);
      const currHas = currNorm.includes(term);
      if (!prevHas && currHas) {
        changes.push({
          retailerId: policy.retailerId,
          retailerName: policy.retailerName,
          type: 'major',
          field: 'newRestriction',
          previousValue: null,
          newValue: term,
          detectedAt: now,
        });
      }
    }

    // ------------------------------------------------------------------
    // Minor: date/last-updated changes
    // ------------------------------------------------------------------
    const datePatterns = [
      /(?:updated|effective|as of|last (?:updated|modified))\s*:?\s*[\w\s,]+\d{4}/gi,
      /\d{1,2}\/\d{1,2}\/\d{2,4}/g,
    ];

    const prevDates = this.extractMatches(prevNorm, datePatterns);
    const currDates = this.extractMatches(currNorm, datePatterns);

    if (
      prevDates.length > 0 &&
      currDates.length > 0 &&
      JSON.stringify(prevDates) !== JSON.stringify(currDates)
    ) {
      changes.push({
        retailerId: policy.retailerId,
        retailerName: policy.retailerName,
        type: 'minor',
        field: 'dates',
        previousValue: prevDates,
        newValue: currDates,
        detectedAt: now,
      });
    }

    // ------------------------------------------------------------------
    // Minor fallback: any remaining diff is treated as formatting
    // ------------------------------------------------------------------
    if (changes.length === 0) {
      const prevTrimmed = prevNorm.replace(/\s+/g, '');
      const currTrimmed = currNorm.replace(/\s+/g, '');
      if (prevTrimmed !== currTrimmed) {
        changes.push({
          retailerId: policy.retailerId,
          retailerName: policy.retailerName,
          type: 'minor',
          field: 'formatting',
          previousValue: `${previousText.length} chars`,
          newValue: `${currentText.length} chars`,
          detectedAt: now,
        });
      }
    }

    return changes;
  }

  /**
   * Extract all numbers captured by group 1 across multiple patterns.
   */
  private extractNumbers(text: string, patterns: RegExp[]): number[] {
    const results: number[] = [];
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const num = parseFloat(match[1]!);
        if (!isNaN(num) && !results.includes(num)) {
          results.push(num);
        }
      }
    }
    return results;
  }

  /**
   * Extract all full match strings across multiple patterns.
   */
  private extractMatches(text: string, patterns: RegExp[]): string[] {
    const results: string[] = [];
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const val = match[0].trim();
        if (val && !results.includes(val)) {
          results.push(val);
        }
      }
    }
    return results;
  }

  /**
   * Simple async delay helper.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
