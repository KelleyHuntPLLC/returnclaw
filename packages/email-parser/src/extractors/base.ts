import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { EmailMessage } from '../providers/base';

dayjs.extend(customParseFormat);

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  sku?: string;
  imageUrl?: string;
}

export interface ExtractedOrder {
  externalOrderId: string;
  retailer: string;
  items: OrderItem[];
  orderDate: Date;
  estimatedDeliveryDate?: Date;
  totalAmount: number;
  currency: string;
  trackingNumber?: string;
  carrierCode?: string;
  returnByDate?: Date;
  returnLink?: string;
  status: 'confirmed' | 'shipped' | 'delivered' | 'return_initiated';
  rawEmailId: string;
}

export abstract class BaseOrderExtractor {
  abstract readonly retailerName: string;
  abstract readonly senderPatterns: string[];

  abstract extract(email: EmailMessage): Promise<ExtractedOrder | null>;

  canHandle(senderEmail: string): boolean {
    const senderLower = senderEmail.toLowerCase();
    return this.senderPatterns.some((pattern) => senderLower.includes(pattern));
  }

  protected parsePrice(priceStr: string): number {
    if (!priceStr || typeof priceStr !== 'string') {
      return 0;
    }
    // Strip currency symbols ($ EUR etc.), commas, whitespace, and keep digits/decimal
    const cleaned = priceStr
      .replace(/[^0-9.\-]/g, '')
      .trim();
    const value = parseFloat(cleaned);
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
  }

  protected parseDate(dateStr: string): Date | undefined {
    if (!dateStr || typeof dateStr !== 'string') {
      return undefined;
    }

    const trimmed = dateStr.trim();

    // Try a series of common date formats
    const formats = [
      'MMMM D, YYYY',
      'MMMM DD, YYYY',
      'MMM D, YYYY',
      'MMM DD, YYYY',
      'MM/DD/YYYY',
      'M/D/YYYY',
      'YYYY-MM-DD',
      'DD MMM YYYY',
      'DD MMMM YYYY',
      'MM-DD-YYYY',
      'M-D-YYYY',
      'MMMM D',
      'MMM D',
      'ddd, MMM D',
      'ddd, MMM DD',
      'ddd, MMMM D, YYYY',
      'ddd, MMM D, YYYY',
    ];

    for (const fmt of formats) {
      const parsed = dayjs(trimmed, fmt, true);
      if (parsed.isValid()) {
        // If no year was in the format string, default to current year
        if (!fmt.includes('YYYY')) {
          const withYear = parsed.year(dayjs().year());
          // If the resulting date is more than 30 days in the past, assume next year
          if (withYear.isBefore(dayjs().subtract(30, 'day'))) {
            return withYear.year(dayjs().year() + 1).toDate();
          }
          return withYear.toDate();
        }
        return parsed.toDate();
      }
    }

    // Fallback: try native Date parsing
    const nativeParsed = new Date(trimmed);
    if (!isNaN(nativeParsed.getTime())) {
      return nativeParsed;
    }

    return undefined;
  }
}
