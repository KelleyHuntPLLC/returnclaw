import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { EmailMessage } from '../providers/base';
import { BaseOrderExtractor, ExtractedOrder, OrderItem } from './base';

export class TargetOrderExtractor extends BaseOrderExtractor {
  readonly retailerName = 'Target';
  readonly senderPatterns = [
    'orders@target.com',
    'no-reply@target.com',
  ];

  /**
   * Target order IDs are typically numeric, around 12-15 digits.
   * Found in patterns like "Order #123456789012" or "Order number: 123456789012"
   */
  private static readonly ORDER_ID_PATTERN = /(?:order\s*(?:#|number|num)?[:\s]*)\s*(\d{9,15})/i;

  /**
   * Fallback: standalone large number that might be an order ID
   */
  private static readonly BARE_ORDER_ID_PATTERN = /\b(\d{12,15})\b/;

  async extract(email: EmailMessage): Promise<ExtractedOrder | null> {
    const html = email.htmlBody;
    const text = email.textBody ?? '';
    const subject = email.subject.toLowerCase();

    const orderId = this.findOrderId(html, text, subject);
    if (!orderId) {
      return null;
    }

    const items: OrderItem[] = [];
    let totalAmount = 0;
    let orderDate: Date = email.date;
    let estimatedDeliveryDate: Date | undefined;
    let trackingNumber: string | undefined;
    let carrierCode: string | undefined;
    let status: ExtractedOrder['status'] = 'confirmed';

    // Determine email type from subject
    if (subject.includes('shipped') || subject.includes('on its way') || subject.includes('on the way')) {
      status = 'shipped';
    } else if (subject.includes('delivered')) {
      status = 'delivered';
    } else if (subject.includes('return') || subject.includes('refund')) {
      status = 'return_initiated';
    }

    if (html) {
      const $ = cheerio.load(html);

      // Extract items from Target's email HTML structure
      // Target emails typically use table-based layouts or structured divs
      $('table tr').each((_i, row) => {
        const $row = $(row);
        const cells = $row.find('td');

        if (cells.length >= 2) {
          const item = this.parseItemRow($, cells);
          if (item) {
            items.push(item);
          }
        }
      });

      // Try div-based item containers
      if (items.length === 0) {
        $('[class*="item"], [class*="product"], [class*="order-item"]').each((_i, el) => {
          const $el = $(el);
          const name = $el
            .find('[class*="name"], [class*="title"], [class*="description"], a[href*="target.com"]')
            .first()
            .text()
            .trim();
          const priceText = $el.find('[class*="price"], [class*="amount"]').first().text().trim();
          const quantityText = $el.find('[class*="qty"], [class*="quantity"]').first().text().trim();

          if (name && name.length > 2) {
            const price = priceText ? this.parsePrice(priceText) : 0;
            const quantityMatch = quantityText.match(/(\d+)/);
            const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : 1;
            const imageUrl = $el.find('img').first().attr('src') ?? undefined;

            items.push({ name, quantity, price, imageUrl });
          }
        });
      }

      // Try links to target.com product pages
      if (items.length === 0) {
        $('a[href*="target.com/p/"], a[href*="target.com/c/"]').each((_i, el) => {
          const $link = $(el);
          const name = $link.text().trim();
          if (name.length > 2 && !items.some((item) => item.name === name)) {
            const parent = $link.closest('tr, div, td');
            const parentText = parent.text();
            const priceMatch = parentText.match(/\$?([\d,]+\.\d{2})/);
            const price = priceMatch ? this.parsePrice(priceMatch[0]) : 0;
            const quantityMatch = parentText.match(/Qty[:\s]*(\d+)/i);
            const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : 1;
            const imageUrl = parent.find('img').first().attr('src') ?? undefined;

            items.push({ name, quantity, price, imageUrl });
          }
        });
      }

      // Extract total amount
      const totalStr = this.findTextNearLabel($, ['Order Total', 'Total', 'Grand Total', 'Estimated Total']);
      if (totalStr) {
        totalAmount = this.parsePrice(totalStr);
      }

      // Extract order date
      const dateStr = this.findTextNearLabel($, ['Order placed', 'Order date', 'Ordered on', 'Date']);
      if (dateStr) {
        const parsed = this.parseDate(dateStr);
        if (parsed) {
          orderDate = parsed;
        }
      }

      // Extract delivery estimate
      const deliveryStr = this.findTextNearLabel($, [
        'Estimated delivery',
        'Arrives by',
        'Get it by',
        'Expected delivery',
        'Delivery by',
      ]);
      if (deliveryStr) {
        estimatedDeliveryDate = this.parseDate(deliveryStr);
      }

      // Extract tracking info for shipped orders
      if (status === 'shipped') {
        const trackingResult = this.extractTracking($);
        trackingNumber = trackingResult.trackingNumber;
        carrierCode = trackingResult.carrierCode;
      }
    }

    // Text fallback for items
    if (items.length === 0 && text) {
      this.extractItemsFromText(text, items);
    }

    // Calculate total from items if not found
    if (totalAmount === 0 && items.length > 0) {
      totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      totalAmount = Math.round(totalAmount * 100) / 100;
    }

    // Text fallback for total
    if (totalAmount === 0) {
      const totalMatch = text.match(/(?:Order Total|Total)[:\s]*\$?([\d,]+\.\d{2})/i);
      if (totalMatch) {
        totalAmount = this.parsePrice(totalMatch[1]);
      }
    }

    return {
      externalOrderId: orderId,
      retailer: this.retailerName,
      items,
      orderDate,
      estimatedDeliveryDate,
      totalAmount,
      currency: 'USD',
      trackingNumber,
      carrierCode,
      returnLink: `https://www.target.com/account/orders/details/${orderId}`,
      status,
      rawEmailId: email.id,
    };
  }

  // --- Helper methods ---

  private findOrderId(html: string | null, text: string, subject: string): string | null {
    // Try the labeled pattern first (most reliable)
    const sources = [subject, text, html ?? ''];
    for (const source of sources) {
      const match = source.match(TargetOrderExtractor.ORDER_ID_PATTERN);
      if (match) return match[1];
    }

    // Fallback: bare large number
    for (const source of sources) {
      const match = source.match(TargetOrderExtractor.BARE_ORDER_ID_PATTERN);
      if (match) return match[1];
    }

    return null;
  }

  private parseItemRow(
    $: cheerio.CheerioAPI,
    cells: cheerio.Cheerio<Element>,
  ): OrderItem | null {
    let name = '';
    let price = 0;
    let quantity = 1;
    let imageUrl: string | undefined;

    for (let i = 0; i < cells.length; i++) {
      const cell = $(cells[i]);

      // Check for product link
      const link = cell.find('a[href*="target.com"]').first();
      if (link.length && link.text().trim().length > 2) {
        name = link.text().trim();
      }

      // Fallback to cell text
      if (!name) {
        const cellText = cell.text().trim();
        if (
          cellText.length > 5 &&
          !cellText.match(/^\$?[\d,]+\.\d{2}$/) &&
          !cellText.match(/^\d+$/)
        ) {
          const firstLine = cellText.split('\n')[0].trim();
          if (firstLine.length > 2) {
            name = firstLine;
          }
        }
      }

      // Price
      const priceMatch = cell.text().trim().match(/\$?([\d,]+\.\d{2})/);
      if (priceMatch) {
        price = this.parsePrice(priceMatch[0]);
      }

      // Quantity
      const qtyMatch = cell.text().match(/(?:Qty|Quantity)[:\s]*(\d+)/i);
      if (qtyMatch) {
        quantity = parseInt(qtyMatch[1], 10);
      }

      // Image
      const img = cell.find('img').first();
      if (img.length) {
        imageUrl = img.attr('src') ?? undefined;
      }
    }

    if (name && name.length > 2) {
      return { name, quantity, price, imageUrl };
    }
    return null;
  }

  private findTextNearLabel(
    $: cheerio.CheerioAPI,
    labels: string[],
  ): string | null {
    const bodyText = $.root().text();

    for (const label of labels) {
      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`${escapedLabel}[:\\s]*([^\\n]{1,100})`, 'i');
      const match = bodyText.match(regex);
      if (match) {
        const value = match[1].trim();
        if (value.length > 0) return value;
      }
    }

    return null;
  }

  private extractTracking($: cheerio.CheerioAPI): {
    trackingNumber?: string;
    carrierCode?: string;
  } {
    let trackingNumber: string | undefined;
    let carrierCode: string | undefined;

    // Look for tracking links
    const trackingLink = $('a[href*="track"]').first();
    if (trackingLink.length) {
      const linkText = trackingLink.text().trim();
      if (/^[A-Z0-9]{8,30}$/i.test(linkText)) {
        trackingNumber = linkText;
      } else {
        const href = trackingLink.attr('href') ?? '';
        const trackingMatch = href.match(/tracking[_\-]?(?:number|id)?[=\/]([A-Z0-9]+)/i);
        if (trackingMatch) {
          trackingNumber = trackingMatch[1];
        }
      }
    }

    // Regex fallback
    if (!trackingNumber) {
      const bodyText = $.text();
      const match = bodyText.match(
        /(?:tracking\s*(?:number|#|id)?[:\s]*)\s*([A-Z0-9]{10,30})/i,
      );
      if (match) {
        trackingNumber = match[1];
      }
    }

    // Detect carrier
    const bodyTextLower = $.text().toLowerCase();
    if (bodyTextLower.includes('ups') || bodyTextLower.includes('united parcel')) {
      carrierCode = 'UPS';
    } else if (bodyTextLower.includes('usps') || bodyTextLower.includes('postal service')) {
      carrierCode = 'USPS';
    } else if (bodyTextLower.includes('fedex') || bodyTextLower.includes('federal express')) {
      carrierCode = 'FEDEX';
    } else if (bodyTextLower.includes('dhl')) {
      carrierCode = 'DHL';
    } else if (bodyTextLower.includes('ontrac')) {
      carrierCode = 'ONTRAC';
    } else if (bodyTextLower.includes('lasership')) {
      carrierCode = 'LASERSHIP';
    }

    return { trackingNumber, carrierCode };
  }

  private extractItemsFromText(text: string, items: OrderItem[]): void {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const match = line.match(/^(.+?)\s+\$?([\d,]+\.\d{2})$/);
      if (match) {
        const name = match[1].trim();
        const price = this.parsePrice(match[2]);
        if (name.length > 2 && price > 0) {
          items.push({ name, quantity: 1, price });
        }
      }
    }
  }
}
