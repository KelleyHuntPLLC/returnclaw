import pino from 'pino';
import { EventEmitter } from 'events';
import {
  EmailConnection,
  EmailMessage,
  EmailSearchOptions,
  ProviderType,
  BaseEmailProvider,
} from './providers/base';
import { GmailProvider } from './providers/gmail';
import { OutlookProvider } from './providers/outlook';
import { ImapProvider } from './providers/imap';
import { ExtractorRegistry } from './extractors/registry';
import { ExtractedOrder } from './extractors/base';

const logger = pino({ name: 'email-parser' });

export interface Order extends ExtractedOrder {
  userId: string;
  provider: ProviderType;
  detectedAt: Date;
}

export interface ParseOptions {
  /** Number of days to look back for emails. Default: 30 */
  lookbackDays?: number;
  /** Maximum number of emails to process. Default: 100 */
  maxEmails?: number;
  /** Last sync timestamp — only fetch emails newer than this */
  since?: Date;
}

/**
 * EmailParser — main entry point for email-based order detection.
 *
 * Connects to a user's email account, scans for order/shipping emails,
 * and extracts structured order data.
 */
export class EmailParser extends EventEmitter {
  private readonly extractorRegistry: ExtractorRegistry;
  private readonly processedOrderIds: Set<string> = new Set();

  constructor(extractorRegistry?: ExtractorRegistry) {
    super();
    this.extractorRegistry = extractorRegistry || new ExtractorRegistry();
  }

  /**
   * Main entry point — syncs orders from a user's email account.
   *
   * Connects to the email provider, searches for order-related emails,
   * runs them through the extractor pipeline, and returns structured orders.
   */
  async syncOrders(
    userId: string,
    connection: EmailConnection,
    options: ParseOptions = {},
  ): Promise<Order[]> {
    const {
      lookbackDays = 30,
      maxEmails = 100,
      since,
    } = options;

    const startTime = Date.now();
    logger.info(
      { userId, provider: connection.provider, lookbackDays },
      'Starting order sync',
    );

    let provider: BaseEmailProvider | null = null;
    const orders: Order[] = [];

    try {
      // 1. Create and connect to the email provider
      provider = this.createProvider(connection.provider);
      await provider.connect(connection);

      // 2. Build search query and fetch emails
      const searchOptions: EmailSearchOptions = {
        query: this.getSearchQuery(connection.provider),
        since: since || new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000),
        maxResults: maxEmails,
      };

      logger.info(
        { since: searchOptions.since, maxResults: searchOptions.maxResults },
        'Searching for order emails',
      );

      const emails = await provider.searchMessages(searchOptions);

      logger.info({ emailCount: emails.length }, 'Found order-related emails');

      // 3. Process each email through extractors
      for (const email of emails) {
        try {
          const extractedOrder = await this.processEmail(email);

          if (extractedOrder) {
            // Deduplicate by external order ID
            const dedupeKey = `${extractedOrder.retailer}:${extractedOrder.externalOrderId}`;
            if (this.processedOrderIds.has(dedupeKey)) {
              logger.debug(
                { orderId: extractedOrder.externalOrderId },
                'Skipping duplicate order',
              );
              continue;
            }
            this.processedOrderIds.add(dedupeKey);

            const order: Order = {
              ...extractedOrder,
              userId,
              provider: connection.provider,
              detectedAt: new Date(),
            };

            orders.push(order);
            this.emit('order:detected', order);

            logger.info(
              {
                orderId: order.externalOrderId,
                retailer: order.retailer,
                items: order.items.length,
                total: order.totalAmount,
              },
              'Order detected',
            );
          }
        } catch (extractError) {
          logger.error(
            {
              emailId: email.id,
              from: email.from,
              subject: email.subject,
              error: extractError instanceof Error ? extractError.message : String(extractError),
            },
            'Failed to extract order from email',
          );
        }
      }

      const duration = Date.now() - startTime;
      logger.info(
        {
          userId,
          emailsProcessed: emails.length,
          ordersFound: orders.length,
          durationMs: duration,
        },
        'Order sync complete',
      );

      return orders;
    } catch (error) {
      logger.error(
        {
          userId,
          provider: connection.provider,
          error: error instanceof Error ? error.message : String(error),
        },
        'Order sync failed',
      );
      throw error;
    } finally {
      if (provider) {
        try {
          await provider.disconnect();
        } catch (disconnectError) {
          logger.warn({ error: disconnectError }, 'Error disconnecting from email provider');
        }
      }
    }
  }

  /**
   * Processes a single email and extracts order data.
   */
  async processEmail(email: EmailMessage): Promise<ExtractedOrder | null> {
    const extractor = this.extractorRegistry.getExtractor(email.from);

    logger.debug(
      {
        emailId: email.id,
        from: email.from,
        extractor: extractor.retailerName,
      },
      'Processing email with extractor',
    );

    return extractor.extract(email);
  }

  /**
   * Clears the deduplication cache. Useful for testing or forced re-processing.
   */
  clearDeduplicationCache(): void {
    this.processedOrderIds.clear();
  }

  /**
   * Returns the appropriate search query for each provider type.
   */
  private getSearchQuery(providerType: ProviderType): string {
    switch (providerType) {
      case ProviderType.GMAIL:
        return [
          'subject:(order confirmation OR order shipped OR your order',
          'OR shipping confirmation OR delivery notification',
          'OR return label OR return confirmation)',
          'newer_than:30d',
        ].join(' ');

      case ProviderType.OUTLOOK:
        return '"order confirmation" OR "your order has shipped" OR "shipping confirmation" OR "return label"';

      case ProviderType.IMAP:
        return 'order confirmation OR order shipped OR shipping confirmation';

      default:
        return 'order confirmation';
    }
  }

  /**
   * Creates the appropriate email provider instance.
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
        throw new Error(`Unsupported email provider: ${providerType}`);
    }
  }
}
