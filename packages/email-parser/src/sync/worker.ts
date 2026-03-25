import pino from 'pino';
import { EventEmitter } from 'events';
import { EmailConnection, EmailMessage, EmailSearchOptions, ProviderType } from '../providers/base';
import { BaseEmailProvider } from '../providers/base';
import { GmailProvider } from '../providers/gmail';
import { OutlookProvider } from '../providers/outlook';
import { ImapProvider } from '../providers/imap';
import { ExtractorRegistry } from '../extractors/registry';
import { ExtractedOrder } from '../extractors/base';

const logger = pino({ name: 'email-parser:sync-worker' });

export interface SyncOptions {
  batchSize: number;
  since?: Date;
}

export interface SyncResult {
  userId: string;
  provider: ProviderType;
  emailsProcessed: number;
  ordersFound: number;
  orders: ExtractedOrder[];
  errors: Array<{ emailId: string; error: string }>;
  syncDuration: number;
}

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;

export class SyncWorker extends EventEmitter {
  private readonly extractorRegistry: ExtractorRegistry;

  constructor(extractorRegistry: ExtractorRegistry) {
    super();
    this.extractorRegistry = extractorRegistry;
  }

  /**
   * Processes a complete email sync for a single user.
   */
  async processUserSync(
    userId: string,
    connection: EmailConnection,
    options: SyncOptions,
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      userId,
      provider: connection.provider,
      emailsProcessed: 0,
      ordersFound: 0,
      orders: [],
      errors: [],
      syncDuration: 0,
    };

    let provider: BaseEmailProvider | null = null;

    try {
      // Create and connect to the appropriate email provider
      provider = this.createProvider(connection.provider);
      await this.connectWithRetry(provider, connection);

      // Search for order-related emails
      const searchOptions: EmailSearchOptions = {
        query: this.buildSearchQuery(connection.provider),
        since: options.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days
        maxResults: options.batchSize,
      };

      logger.info(
        { userId, provider: connection.provider, since: searchOptions.since },
        'Searching for order emails',
      );

      const emails = await this.fetchEmailsWithRetry(provider, searchOptions);

      logger.info(
        { userId, emailCount: emails.length },
        'Found emails to process',
      );

      // Process each email through the extractor pipeline
      const seenOrderIds = new Set<string>();

      for (const email of emails) {
        try {
          const order = await this.processEmail(email);
          result.emailsProcessed++;

          if (order) {
            // Deduplicate by external order ID
            if (!seenOrderIds.has(order.externalOrderId)) {
              seenOrderIds.add(order.externalOrderId);
              result.orders.push(order);
              result.ordersFound++;

              // Emit events based on order status
              this.emitOrderEvent(userId, order);

              logger.info(
                {
                  userId,
                  orderId: order.externalOrderId,
                  retailer: order.retailer,
                  status: order.status,
                },
                'Order extracted from email',
              );
            } else {
              logger.debug(
                { orderId: order.externalOrderId },
                'Duplicate order skipped',
              );
            }
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          result.errors.push({ emailId: email.id, error: errorMsg });
          logger.error(
            { emailId: email.id, error: errorMsg },
            'Failed to process email',
          );
        }
      }
    } catch (error) {
      logger.error({ userId, error }, 'Sync failed');
      throw error;
    } finally {
      // Always disconnect
      if (provider) {
        try {
          await provider.disconnect();
        } catch (disconnectError) {
          logger.warn({ error: disconnectError }, 'Error disconnecting from provider');
        }
      }

      result.syncDuration = Date.now() - startTime;
      logger.info(
        {
          userId,
          emailsProcessed: result.emailsProcessed,
          ordersFound: result.ordersFound,
          errors: result.errors.length,
          durationMs: result.syncDuration,
        },
        'Sync complete',
      );
    }

    return result;
  }

  /**
   * Creates the appropriate email provider based on the connection type.
   */
  private createProvider(providerType: ProviderType): BaseEmailProvider {
    switch (providerType) {
      case ProviderType.GMAIL:
        return new GmailProvider();
      case ProviderType.OUTLOOK:
        return new OutlookProvider();
      case ProviderType.IMAP:
        return new ImapProvider();
      default:
        throw new Error(`Unsupported provider: ${providerType}`);
    }
  }

  /**
   * Builds a search query appropriate for the given provider.
   */
  private buildSearchQuery(provider: ProviderType): string {
    switch (provider) {
      case ProviderType.GMAIL:
        return 'subject:(order confirmation OR order shipped OR your order OR shipping confirmation OR delivery notification) newer_than:30d';
      case ProviderType.OUTLOOK:
        return '"order confirmation" OR "your order has shipped" OR "shipping confirmation" OR "delivery notification"';
      case ProviderType.IMAP:
        return 'order confirmation OR order shipped OR shipping confirmation';
      default:
        return 'order confirmation';
    }
  }

  /**
   * Connects to the email provider with retry and exponential backoff.
   */
  private async connectWithRetry(
    provider: BaseEmailProvider,
    connection: EmailConnection,
  ): Promise<void> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await provider.connect(connection);
        return;
      } catch (error) {
        if (attempt === MAX_RETRIES) {
          throw new Error(
            `Failed to connect after ${MAX_RETRIES} attempts: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
        logger.warn(
          { attempt, backoffMs: backoff, error },
          'Connection failed, retrying',
        );
        await this.sleep(backoff);
      }
    }
  }

  /**
   * Fetches emails with retry logic.
   */
  private async fetchEmailsWithRetry(
    provider: BaseEmailProvider,
    options: EmailSearchOptions,
  ): Promise<EmailMessage[]> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await provider.searchMessages(options);
      } catch (error) {
        if (attempt === MAX_RETRIES) {
          throw new Error(
            `Failed to fetch emails after ${MAX_RETRIES} attempts: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
        logger.warn(
          { attempt, backoffMs: backoff, error },
          'Email fetch failed, retrying',
        );
        await this.sleep(backoff);
      }
    }
    return []; // Unreachable but TypeScript needs it
  }

  /**
   * Processes a single email through the extractor pipeline.
   */
  private async processEmail(email: EmailMessage): Promise<ExtractedOrder | null> {
    const extractor = this.extractorRegistry.getExtractor(email.from);

    const order = await extractor.extract(email);
    return order;
  }

  /**
   * Emits appropriate events based on the order status.
   */
  private emitOrderEvent(userId: string, order: ExtractedOrder): void {
    switch (order.status) {
      case 'confirmed':
        this.emit('order:detected', { userId, order });
        break;
      case 'shipped':
        this.emit('order:shipped', { userId, order });
        break;
      case 'delivered':
        this.emit('order:delivered', { userId, order });
        break;
      case 'return_initiated':
        this.emit('return:confirmed', { userId, order });
        break;
    }

    // If the email contained a return shipping label reference
    if (order.trackingNumber && order.status === 'return_initiated') {
      this.emit('label:received', {
        userId,
        orderId: order.externalOrderId,
        trackingNumber: order.trackingNumber,
        carrier: order.carrierCode,
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
