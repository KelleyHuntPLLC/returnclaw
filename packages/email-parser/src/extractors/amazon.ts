import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { EmailMessage } from '../providers/base';
import { BaseOrderExtractor, ExtractedOrder, OrderItem } from './base';

export class AmazonOrderExtractor extends BaseOrderExtractor {
  readonly retailerName = 'Amazon';
  readonly senderPatterns = [
    'auto-confirm@amazon.com',
    'ship-confirm@amazon.com',
    'returns@amazon.com',
    'order-update@amazon.com',
  ];

  private static readonly ORDER_ID_PATTERN = /\d{3}-\d{7}-\d{7}/;

  async extract(email: EmailMessage): Promise<ExtractedOrder | null> {
    const senderLower = email.from.toLowerCase();

    if (senderLower.includes('ship-confirm@amazon.com')) {
      return this.extractShippingConfirmation(email);
    }
    if (senderLower.includes('returns@amazon.com')) {
      return this.extractReturnStatus(email);
    }
    // order-update and auto-confirm both treated as order confirmations
    return this.extractOrderConfirmation(email);
  }

  private extractOrderConfirmation(email: EmailMessage): ExtractedOrder | null {
    const html = email.htmlBody;
    const text = email.textBody ?? '';

    // Extract order ID from HTML or text
    const orderId = this.findOrderId(html, text);
    if (!orderId) {
      return null;
    }

    const items: OrderItem[] = [];
    let totalAmount = 0;
    let orderDate: Date = email.date;
    let estimatedDeliveryDate: Date | undefined;

    if (html) {
      const $ = cheerio.load(html);

      // Extract items from order detail table rows
      // Amazon confirmation emails typically have item rows in tables
      $('table tr').each((_i, row) => {
        const $row = $(row);
        const cells = $row.find('td');

        // Look for rows that contain item information
        // Amazon typically has: image cell, item details cell, price cell
        if (cells.length >= 2) {
          const itemName = this.extractItemName($, cells);
          const priceText = this.extractPriceFromCells($, cells);

          if (itemName && priceText) {
            const price = this.parsePrice(priceText);
            const quantityMatch = $row.text().match(/Qty:\s*(\d+)/i)
              ?? $row.text().match(/Quantity:\s*(\d+)/i);
            const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : 1;

            const imageUrl = $row.find('img').first().attr('src') ?? undefined;

            items.push({
              name: itemName.trim(),
              quantity,
              price,
              imageUrl,
            });
          }
        }
      });

      // If table parsing yielded no items, try a broader approach
      if (items.length === 0) {
        this.extractItemsFromLinks($, items);
      }

      // Extract total
      const totalText = this.findTextNearLabel($, ['Order Total', 'Grand Total', 'Total for this Order']);
      if (totalText) {
        totalAmount = this.parsePrice(totalText);
      }

      // Extract order date
      const dateText = this.findTextNearLabel($, ['Order Placed', 'Order Date', 'Ordered on']);
      if (dateText) {
        const parsed = this.parseDate(dateText);
        if (parsed) {
          orderDate = parsed;
        }
      }

      // Extract estimated delivery date
      const deliveryText = this.findTextNearLabel($, [
        'Estimated delivery',
        'Arriving',
        'Delivery estimate',
        'Expected delivery',
      ]);
      if (deliveryText) {
        estimatedDeliveryDate = this.parseDate(deliveryText);
      }
    }

    // Fallback: try text body parsing if no items found from HTML
    if (items.length === 0 && text) {
      this.extractItemsFromText(text, items);
    }

    // Calculate total from items if not found
    if (totalAmount === 0 && items.length > 0) {
      totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      totalAmount = Math.round(totalAmount * 100) / 100;
    }

    // If still no items, extract minimal data
    if (items.length === 0) {
      // Try to find total from text
      const totalMatch = text.match(/(?:Order Total|Grand Total|Total)[:\s]*\$?([\d,]+\.\d{2})/i);
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
      returnLink: `https://www.amazon.com/gp/orc/returns/homepage.html?orderID=${orderId}`,
      status: 'confirmed',
      rawEmailId: email.id,
    };
  }

  private extractShippingConfirmation(email: EmailMessage): ExtractedOrder | null {
    const html = email.htmlBody;
    const text = email.textBody ?? '';

    const orderId = this.findOrderId(html, text);
    if (!orderId) {
      return null;
    }

    let trackingNumber: string | undefined;
    let carrierCode: string | undefined;
    let estimatedDeliveryDate: Date | undefined;
    const items: OrderItem[] = [];

    if (html) {
      const $ = cheerio.load(html);

      // Extract tracking number
      const trackingLink = $('a[href*="tracking"]').first();
      if (trackingLink.length) {
        const trackingText = trackingLink.text().trim();
        if (trackingText && /^[A-Z0-9]{8,}$/i.test(trackingText)) {
          trackingNumber = trackingText;
        } else {
          // Try to extract from href
          const href = trackingLink.attr('href') ?? '';
          const trackingMatch = href.match(/tracking[_\-]?(?:number|id)?[=\/]([A-Z0-9]+)/i);
          if (trackingMatch) {
            trackingNumber = trackingMatch[1];
          }
        }
      }

      // Fallback: regex on full text
      if (!trackingNumber) {
        const bodyText = $.text();
        const trackingMatch = bodyText.match(
          /(?:tracking\s*(?:number|#|id)?[:\s]*)\s*([A-Z0-9]{10,30})/i,
        );
        if (trackingMatch) {
          trackingNumber = trackingMatch[1];
        }
      }

      // Determine carrier
      const bodyText = $.text().toLowerCase();
      carrierCode = this.detectCarrier(bodyText);

      // Extract delivery estimate
      const deliveryText = this.findTextNearLabel($, [
        'Arriving',
        'Estimated delivery',
        'Delivery estimate',
        'Expected',
      ]);
      if (deliveryText) {
        estimatedDeliveryDate = this.parseDate(deliveryText);
      }

      // Extract shipped items
      this.extractItemsFromLinks($, items);
    }

    // Text-based tracking extraction fallback
    if (!trackingNumber && text) {
      const match = text.match(
        /(?:tracking\s*(?:number|#|id)?[:\s]*)\s*([A-Z0-9]{10,30})/i,
      );
      if (match) {
        trackingNumber = match[1];
      }
    }

    if (!carrierCode && text) {
      carrierCode = this.detectCarrier(text.toLowerCase());
    }

    return {
      externalOrderId: orderId,
      retailer: this.retailerName,
      items,
      orderDate: email.date,
      estimatedDeliveryDate,
      totalAmount: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      currency: 'USD',
      trackingNumber,
      carrierCode,
      returnLink: `https://www.amazon.com/gp/orc/returns/homepage.html?orderID=${orderId}`,
      status: 'shipped',
      rawEmailId: email.id,
    };
  }

  private extractReturnStatus(email: EmailMessage): ExtractedOrder | null {
    const html = email.htmlBody;
    const text = email.textBody ?? '';

    const orderId = this.findOrderId(html, text);
    if (!orderId) {
      return null;
    }

    const items: OrderItem[] = [];
    let totalAmount = 0;

    if (html) {
      const $ = cheerio.load(html);
      this.extractItemsFromLinks($, items);

      const refundText = this.findTextNearLabel($, ['Refund Total', 'Refund Amount', 'Total Refund']);
      if (refundText) {
        totalAmount = this.parsePrice(refundText);
      }
    }

    if (totalAmount === 0) {
      const refundMatch = text.match(/(?:refund|return)[^$]*\$?([\d,]+\.\d{2})/i);
      if (refundMatch) {
        totalAmount = this.parsePrice(refundMatch[1]);
      }
    }

    return {
      externalOrderId: orderId,
      retailer: this.retailerName,
      items,
      orderDate: email.date,
      totalAmount,
      currency: 'USD',
      returnLink: `https://www.amazon.com/gp/orc/returns/homepage.html?orderID=${orderId}`,
      status: 'return_initiated',
      rawEmailId: email.id,
    };
  }

  // --- Helper methods ---

  private findOrderId(html: string | null, text: string): string | null {
    // Try HTML first
    if (html) {
      const match = html.match(AmazonOrderExtractor.ORDER_ID_PATTERN);
      if (match) return match[0];
    }
    // Then text
    const textMatch = text.match(AmazonOrderExtractor.ORDER_ID_PATTERN);
    return textMatch ? textMatch[0] : null;
  }

  private extractItemName(
    $: cheerio.CheerioAPI,
    cells: cheerio.Cheerio<Element>,
  ): string | null {
    // Look for item name in anchor tags first (Amazon often links to product)
    for (let i = 0; i < cells.length; i++) {
      const cell = $(cells[i]);
      const link = cell.find('a').first();
      if (link.length) {
        const href = link.attr('href') ?? '';
        // Amazon product links contain /dp/ or /gp/product/
        if (href.includes('/dp/') || href.includes('/gp/product/')) {
          const name = link.text().trim();
          if (name.length > 2) return name;
        }
      }
    }

    // Fallback: find the cell with the most text that isn't just a price
    let bestText = '';
    for (let i = 0; i < cells.length; i++) {
      const cellText = $(cells[i]).text().trim();
      if (
        cellText.length > bestText.length &&
        !cellText.match(/^\$?[\d,]+\.\d{2}$/) &&
        cellText.length > 5
      ) {
        bestText = cellText;
      }
    }

    // Extract just the first meaningful line as the item name
    if (bestText) {
      const firstLine = bestText.split('\n')[0].trim();
      if (firstLine.length > 2) return firstLine;
    }

    return null;
  }

  private extractPriceFromCells(
    $: cheerio.CheerioAPI,
    cells: cheerio.Cheerio<Element>,
  ): string | null {
    // Look for a cell containing a price pattern
    for (let i = cells.length - 1; i >= 0; i--) {
      const cellText = $(cells[i]).text().trim();
      const priceMatch = cellText.match(/\$?([\d,]+\.\d{2})/);
      if (priceMatch) {
        return priceMatch[0];
      }
    }
    return null;
  }

  private extractItemsFromLinks(
    $: cheerio.CheerioAPI,
    items: OrderItem[],
  ): void {
    // Find Amazon product links and extract item names
    $('a[href*="/dp/"], a[href*="/gp/product/"]').each((_i, el) => {
      const $link = $(el);
      const name = $link.text().trim();
      if (name.length > 2 && !items.some((item) => item.name === name)) {
        // Try to find a nearby price
        const parent = $link.closest('tr, div, td');
        const parentText = parent.text();
        const priceMatch = parentText.match(/\$?([\d,]+\.\d{2})/);
        const price = priceMatch ? this.parsePrice(priceMatch[0]) : 0;

        const quantityMatch = parentText.match(/Qty:\s*(\d+)/i)
          ?? parentText.match(/Quantity:\s*(\d+)/i);
        const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : 1;

        const img = parent.find('img').first();
        const imageUrl = img.attr('src') ?? undefined;

        items.push({ name, quantity, price, imageUrl });
      }
    });
  }

  private extractItemsFromText(text: string, items: OrderItem[]): void {
    // Pattern: item name followed by price on next line or same line
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Look for lines that have a price at the end
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

  private findTextNearLabel(
    $: cheerio.CheerioAPI,
    labels: string[],
  ): string | null {
    const bodyText = $.root().text();

    for (const label of labels) {
      // Search in text content for the label and extract what follows
      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`${escapedLabel}[:\\s]*([^\\n]{1,100})`, 'i');
      const match = bodyText.match(regex);
      if (match) {
        const value = match[1].trim();
        if (value.length > 0) return value;
      }
    }

    // Also try finding in HTML structure (td/span pairs)
    for (const label of labels) {
      $('td, th, span, div, b, strong').each((_i, el) => {
        const elText = $(el).text().trim();
        if (elText.toLowerCase().includes(label.toLowerCase())) {
          // Get the next sibling or parent's next cell
          const next = $(el).next();
          if (next.length) {
            const value = next.text().trim();
            if (value.length > 0 && value.length < 200) {
              // Early exit by returning false won't help us return,
              // but we capture the first match via closure
              return;
            }
          }
        }
      });
    }

    return null;
  }

  private detectCarrier(text: string): string | undefined {
    if (text.includes('ups') || text.includes('united parcel')) return 'UPS';
    if (text.includes('usps') || text.includes('postal service')) return 'USPS';
    if (text.includes('fedex') || text.includes('federal express')) return 'FEDEX';
    if (text.includes('amzl') || text.includes('amazon logistics')) return 'AMZL';
    if (text.includes('dhl')) return 'DHL';
    if (text.includes('ontrac')) return 'ONTRAC';
    return undefined;
  }
}
