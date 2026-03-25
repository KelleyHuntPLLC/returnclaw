import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import { z } from 'zod';
import { EmailMessage } from '../providers/base';
import { BaseOrderExtractor, ExtractedOrder, OrderItem } from './base';

/**
 * Zod schema to validate the LLM-returned structured order data.
 */
const LLMOrderItemSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  price: z.number().nonnegative(),
  sku: z.string().optional(),
});

const LLMOrderResponseSchema = z.object({
  retailer: z.string().min(1),
  orderId: z.string().min(1),
  items: z.array(LLMOrderItemSchema).min(1),
  orderDate: z.string().optional(),
  estimatedDeliveryDate: z.string().optional(),
  totalAmount: z.number().nonnegative(),
  currency: z.string().default('USD'),
  trackingNumber: z.string().optional(),
  carrier: z.string().optional(),
  status: z
    .enum(['confirmed', 'shipped', 'delivered', 'return_initiated'])
    .default('confirmed'),
});

type LLMOrderResponse = z.infer<typeof LLMOrderResponseSchema>;

/**
 * Cached extraction pattern for a sender domain.
 * Stores hints learned from previous successful extractions
 * to improve prompt accuracy for repeat senders.
 */
interface CachedPattern {
  retailerName: string;
  typicalFields: string[];
  sampleOrderIdFormat?: string;
  lastUpdated: Date;
}

const SYSTEM_PROMPT = `You are an expert at extracting order information from e-commerce confirmation emails.
Given an email subject and body, extract structured order data.

You MUST respond with valid JSON matching this exact schema:
{
  "retailer": "string - the retailer/store name",
  "orderId": "string - the order ID/number",
  "items": [
    {
      "name": "string - product name",
      "quantity": number,
      "price": number,
      "sku": "string (optional)"
    }
  ],
  "orderDate": "string - ISO 8601 date if found (optional)",
  "estimatedDeliveryDate": "string - ISO 8601 date if found (optional)",
  "totalAmount": number,
  "currency": "string - 3 letter code, default USD",
  "trackingNumber": "string (optional)",
  "carrier": "string (optional)",
  "status": "one of: confirmed, shipped, delivered, return_initiated"
}

Rules:
- Extract ALL items in the order
- Prices should be numeric (no currency symbols)
- If you cannot determine a field, omit it or use the default
- Dates should be ISO 8601 format (YYYY-MM-DD)
- If this is not an order-related email, respond with: {"error": "not_an_order"}
- Do NOT hallucinate data. Only extract what is present in the email.`;

export class GenericOrderExtractor extends BaseOrderExtractor {
  readonly retailerName = 'Generic';
  readonly senderPatterns: string[] = [];

  private readonly openai: OpenAI;
  private readonly model: string;
  private readonly patternCache: Map<string, CachedPattern> = new Map();

  /**
   * Semaphore to limit concurrent LLM calls.
   * Tracks current active calls and queues waiters when at capacity.
   */
  private activeCallCount = 0;
  private readonly maxConcurrentCalls = 10;
  private readonly waitQueue: Array<() => void> = [];

  constructor(apiKey?: string, model = 'gpt-4o-mini') {
    super();
    const key = apiKey ?? process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        'GenericOrderExtractor requires an OpenAI API key. ' +
          'Pass it to the constructor or set OPENAI_API_KEY environment variable.',
      );
    }
    this.openai = new OpenAI({ apiKey: key });
    this.model = model;
  }

  /**
   * The generic extractor never claims to "handle" a sender on its own.
   * It is used as a fallback by the registry.
   */
  canHandle(_senderEmail: string): boolean {
    return false;
  }

  async extract(email: EmailMessage): Promise<ExtractedOrder | null> {
    try {
      await this.acquireConcurrencySlot();

      const body = this.prepareBody(email);
      const senderDomain = this.extractDomain(email.from);
      const cachedPattern = senderDomain
        ? this.patternCache.get(senderDomain)
        : undefined;

      const userPrompt = this.buildUserPrompt(email.subject, body, cachedPattern);

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return null;
      }

      const parsed = JSON.parse(content);

      // Check if the LLM reported this is not an order email
      if (parsed.error === 'not_an_order') {
        return null;
      }

      // Validate against Zod schema
      const validationResult = LLMOrderResponseSchema.safeParse(parsed);
      if (!validationResult.success) {
        return null;
      }

      const data = validationResult.data;
      const order = this.mapToExtractedOrder(data, email);

      // Cache the pattern for this sender domain
      if (senderDomain && order) {
        this.cachePattern(senderDomain, data);
      }

      return order;
    } catch {
      // LLM call failed — return null as specified
      return null;
    } finally {
      this.releaseConcurrencySlot();
    }
  }

  // --- Private helpers ---

  private prepareBody(email: EmailMessage): string {
    // Prefer text body; if unavailable, strip HTML
    if (email.textBody && email.textBody.trim().length > 0) {
      return this.truncate(email.textBody, 6000);
    }

    if (email.htmlBody) {
      const $ = cheerio.load(email.htmlBody);
      // Remove script and style tags
      $('script, style, head').remove();
      const text = $.text()
        .replace(/\s+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      return this.truncate(text, 6000);
    }

    return '';
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '\n...[truncated]';
  }

  private buildUserPrompt(
    subject: string,
    body: string,
    cachedPattern?: CachedPattern,
  ): string {
    let prompt = `Extract order information from this email.\n\nSubject: ${subject}\n\nBody:\n${body}`;

    if (cachedPattern) {
      prompt +=
        `\n\nHint: This sender is likely from "${cachedPattern.retailerName}".` +
        (cachedPattern.sampleOrderIdFormat
          ? ` Order IDs typically look like: ${cachedPattern.sampleOrderIdFormat}`
          : '') +
        (cachedPattern.typicalFields.length > 0
          ? ` Typically includes fields: ${cachedPattern.typicalFields.join(', ')}`
          : '');
    }

    return prompt;
  }

  private extractDomain(fromAddress: string): string | null {
    const match = fromAddress.match(/@([a-zA-Z0-9.-]+)/);
    return match ? match[1].toLowerCase() : null;
  }

  private cachePattern(domain: string, data: LLMOrderResponse): void {
    const typicalFields: string[] = [];
    if (data.trackingNumber) typicalFields.push('trackingNumber');
    if (data.estimatedDeliveryDate) typicalFields.push('estimatedDeliveryDate');
    if (data.carrier) typicalFields.push('carrier');
    if (data.items.some((i) => i.sku)) typicalFields.push('sku');

    this.patternCache.set(domain, {
      retailerName: data.retailer,
      typicalFields,
      sampleOrderIdFormat: data.orderId,
      lastUpdated: new Date(),
    });
  }

  private mapToExtractedOrder(
    data: LLMOrderResponse,
    email: EmailMessage,
  ): ExtractedOrder {
    const items: OrderItem[] = data.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      sku: item.sku,
    }));

    let orderDate = email.date;
    if (data.orderDate) {
      const parsed = this.parseDate(data.orderDate);
      if (parsed) {
        orderDate = parsed;
      }
    }

    let estimatedDeliveryDate: Date | undefined;
    if (data.estimatedDeliveryDate) {
      estimatedDeliveryDate = this.parseDate(data.estimatedDeliveryDate);
    }

    return {
      externalOrderId: data.orderId,
      retailer: data.retailer,
      items,
      orderDate,
      estimatedDeliveryDate,
      totalAmount: data.totalAmount,
      currency: data.currency,
      trackingNumber: data.trackingNumber,
      carrierCode: data.carrier,
      status: data.status,
      rawEmailId: email.id,
    };
  }

  /**
   * Acquire a slot in the concurrency semaphore.
   * If at max capacity, waits until a slot is released.
   */
  private async acquireConcurrencySlot(): Promise<void> {
    if (this.activeCallCount < this.maxConcurrentCalls) {
      this.activeCallCount++;
      return;
    }

    // Wait for a slot to open
    return new Promise<void>((resolve) => {
      this.waitQueue.push(() => {
        this.activeCallCount++;
        resolve();
      });
    });
  }

  /**
   * Release a concurrency slot, allowing the next waiter (if any) to proceed.
   */
  private releaseConcurrencySlot(): void {
    this.activeCallCount--;
    const next = this.waitQueue.shift();
    if (next) {
      next();
    }
  }
}
