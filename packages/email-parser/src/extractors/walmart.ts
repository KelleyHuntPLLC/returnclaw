import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { EmailMessage } from '../providers/base';
import { BaseOrderExtractor, ExtractedOrder, OrderItem } from './base';

export class WalmartOrderExtractor extends BaseOrderExtractor {
  readonly retailerName = 'Walmart';
  readonly senderPatterns = [
    'help@walmart.com',
    'no-reply@walmart.com',
  ];

  /**
   * Walmart order IDs typically follow the pattern: XXXXXXXXXXX-XXXXXX (digits with a dash)
   * e.g. 2001234-567890
   */
  private static readonly ORDER_ID_PATTERN = /\d{7}-\d{6}/;

  async extract(email: EmailMessage): Promise<ExtractedOrder | null> {
    const html = email.htmlBody;
    const text = email.textBody ?? '';
    const subject = email.subject.toLowerCase();

    const orderId = this.findOrderId(html, text);
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

      // Extract items from order details
      // Walmart emails use tables or structured divs for item listings
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

      // Alternative: look for item containers in div-based layouts
      if (items.length === 0) {
        $('[class*="item"], [class*="product"], [class*="order-item"]').each((_i, el) => {
          const $el = $(el);
          const name = $el.find('[class*="name"], [class*="title"], [class*="description"], a').first().text().trim();
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

      // If still no items, try anchor-based extraction
      if (items.length === 0) {
        $('a[href*="walmart.com/ip/"]').each((_i, el) => {
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
      const totalStr = this.findTextNearLabel($, ['Order Total', 'Total', 'Grand Total']);
      if (totalStr) {
        totalAmount = this.parsePrice(totalStr);
      }

      // Extract order date
      const dateStr = this.findTextNearLabel($, ['Order placed', 'Order date', 'Ordered on']);
      if (dateStr) {
        const parsed = this.parseDate(dateStr);
        if (parsed) {
          orderDate = parsed;
        }
      }

      // Extract delivery estimate
      const deliveryStr = this.findTextNearLabel($, [
        'Arrives by',
        'Estimated delivery',
        'Delivery by',
        'Expected delivery',
        'Arriving',
      ]);
      if (deliveryStr) {
        estimatedDeliveryDate = this.parseDate(deliveryStr);
      }

      // Extract tracking info for shipped orders
      if (status === 'shipped') {
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

        if (!trackingNumber) {
          const bodyText = $.text();
          const trackingMatch = bodyText.match(
            /(?:tracking\s*(?:number|#|id)?[:\s]*)\s*([A-Z0-9]{10,30})/i,
          );
          if (trackingMatch) {
            trackingNumber = trackingMatch[1];
          }
        }

        // Detect carrier
        const bodyTextLower = $.text().toLowerCase();
        carrierCode = this.detectCarrier(bodyTextLower);
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

    // Try to extract total from text if still zero
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
      returnLink: `https://www.walmart.com/orders/${orderId}`,
      status,
      rawEmailId: email.id,
    };
  }

  // --- Helper methods ---

  private findOrderId(html: string | null, text: string): string | null {
    if (html) {
      const match = html.match(WalmartOrderExtractor.ORDER_ID_PATTERN);
      if (match) return match[0];
    }
    const textMatch = text.match(WalmartOrderExtractor.ORDER_ID_PATTERN);
    return textMatch ? textMatch[0] : null;
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
      const link = cell.find('a[href*="walmart.com"]').first();
      if (link.length && link.text().trim().length > 2) {
        name = link.text().trim();
      }

      // Check for product name in text
      if (!name) {
        const cellText = cell.text().trim();
        if (cellText.length > 5 && !cellText.match(/^\$?[\d,]+\.\d{2}$/) && !cellText.match(/^\d+$/)) {
          const firstLine = cellText.split('\n')[0].trim();
          if (firstLine.length > 2) {
            name = firstLine;
          }
        }
      }

      // Check for price
      const priceMatch = cell.text().trim().match(/\$?([\d,]+\.\d{2})/);
      if (priceMatch) {
        price = this.parsePrice(priceMatch[0]);
      }

      // Check for quantity
      const qtyMatch = cell.text().match(/(?:Qty|Quantity)[:\s]*(\d+)/i);
      if (qtyMatch) {
        quantity = parseInt(qtyMatch[1], 10);
      }

      // Check for image
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

  private extractItemsFromText(text: string, items: OrderItem[]): void {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(.+?)\s+\$?([\d,]+\.\d{2})$/);
      if (match) {
        const name = match[1].trim();
        const price = this.parsePrice(match[2]);
        if (name.length > 2 && price > 0) {
          items.push({ name, quantity: 1, price });
        }
      }
    }
  }

  private detectCarrier(text: string): string | undefined {
    if (text.includes('ups') || text.includes('united parcel')) return 'UPS';
    if (text.includes('usps') || text.includes('postal service')) return 'USPS';
    if (text.includes('fedex') || text.includes('federal express')) return 'FEDEX';
    if (text.includes('dhl')) return 'DHL';
    if (text.includes('ontrac')) return 'ONTRAC';
    if (text.includes('lasership')) return 'LASERSHIP';
    return undefined;
  }
}
