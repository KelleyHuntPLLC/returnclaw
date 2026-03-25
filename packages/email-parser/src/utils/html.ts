import * as cheerio from 'cheerio';
import pino from 'pino';

const logger = pino({ name: 'email-parser:html-utils' });

/**
 * Strips HTML tags and returns clean text content.
 */
export function htmlToText(html: string): string {
  if (!html) return '';
  const $ = cheerio.load(html);

  // Remove script and style elements entirely
  $('script, style, head').remove();

  // Replace <br> and block elements with newlines
  $('br').replaceWith('\n');
  $('p, div, tr, li, h1, h2, h3, h4, h5, h6').each((_i, el) => {
    $(el).prepend('\n');
    $(el).append('\n');
  });

  const text = $.text();

  // Collapse multiple newlines and trim
  return text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Extracts all text from table rows, returning an array of row data.
 * Each row is an array of cell texts.
 */
export function extractTableRows(html: string, tableSelector?: string): string[][] {
  if (!html) return [];
  const $ = cheerio.load(html);
  const rows: string[][] = [];

  const selector = tableSelector ? `${tableSelector} tr` : 'table tr';
  $(selector).each((_i, row) => {
    const cells: string[] = [];
    $(row)
      .find('td, th')
      .each((_j, cell) => {
        cells.push($(cell).text().trim());
      });
    if (cells.length > 0) {
      rows.push(cells);
    }
  });

  return rows;
}

/**
 * Finds text content matching a pattern near a label in the HTML.
 * Useful for extracting values like "Order #: 12345" from structured emails.
 */
export function findLabeledValue(
  html: string,
  labelPattern: RegExp,
  valuePattern?: RegExp,
): string | null {
  if (!html) return null;
  const $ = cheerio.load(html);
  const text = $.text();

  const labelMatch = labelPattern.exec(text);
  if (!labelMatch) return null;

  if (valuePattern) {
    const afterLabel = text.slice(labelMatch.index + labelMatch[0].length);
    const valueMatch = valuePattern.exec(afterLabel);
    return valueMatch ? valueMatch[0].trim() : null;
  }

  // If no value pattern, return the text immediately after the label (up to newline)
  const afterLabel = text.slice(labelMatch.index + labelMatch[0].length);
  const nextLine = afterLabel.split('\n')[0]?.trim();
  return nextLine || null;
}

/**
 * Extracts all links (href values) from HTML, optionally filtered by link text pattern.
 */
export function extractLinks(
  html: string,
  textPattern?: RegExp,
): Array<{ href: string; text: string }> {
  if (!html) return [];
  const $ = cheerio.load(html);
  const links: Array<{ href: string; text: string }> = [];

  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    if (href && (!textPattern || textPattern.test(text))) {
      links.push({ href, text });
    }
  });

  return links;
}

/**
 * Extracts image sources from HTML, optionally filtered by alt text.
 */
export function extractImages(
  html: string,
  altPattern?: RegExp,
): Array<{ src: string; alt: string }> {
  if (!html) return [];
  const $ = cheerio.load(html);
  const images: Array<{ src: string; alt: string }> = [];

  $('img[src]').each((_i, el) => {
    const src = $(el).attr('src');
    const alt = $(el).attr('alt') || '';
    if (src && (!altPattern || altPattern.test(alt))) {
      images.push({ src, alt });
    }
  });

  return images;
}

/**
 * Finds a specific element's text content using a CSS selector path.
 */
export function selectText($: cheerio.CheerioAPI, selector: string): string {
  return $(selector).first().text().trim();
}

/**
 * Parses a price table from an HTML email, looking for item-price pairs.
 * Returns an array of { name, price } objects.
 */
export function parseItemPriceTable(
  html: string,
  tableSelector?: string,
): Array<{ name: string; price: string }> {
  const rows = extractTableRows(html, tableSelector);
  const items: Array<{ name: string; price: string }> = [];

  for (const row of rows) {
    if (row.length < 2) continue;

    // Look for a cell that contains a price pattern
    const priceIdx = row.findIndex((cell) => /\$[\d,.]+/.test(cell));
    if (priceIdx === -1) continue;

    // The item name is typically in the first non-empty cell before the price
    const nameCells = row.slice(0, priceIdx).filter((c) => c.length > 0);
    const name = nameCells[nameCells.length - 1];
    if (!name) continue;

    const priceMatch = /\$([\d,.]+)/.exec(row[priceIdx]);
    if (priceMatch) {
      items.push({ name, price: priceMatch[0] });
    }
  }

  return items;
}

/**
 * Cleans email HTML for LLM processing by stripping unnecessary elements
 * while preserving text structure.
 */
export function cleanHtmlForLlm(html: string, maxLength: number = 8000): string {
  if (!html) return '';

  const $ = cheerio.load(html);

  // Remove non-content elements
  $('script, style, head, meta, link, img, svg, iframe').remove();

  // Remove tracking pixels and hidden elements
  $('[style*="display:none"], [style*="display: none"]').remove();
  $('[width="1"][height="1"]').remove();

  // Remove common email template cruft
  $('table[class*="footer"], div[class*="footer"]').remove();
  $('table[class*="unsubscribe"], div[class*="unsubscribe"]').remove();

  const text = htmlToText($.html());

  if (text.length > maxLength) {
    logger.debug({ originalLength: text.length, maxLength }, 'Truncating HTML for LLM');
    return text.slice(0, maxLength) + '\n[TRUNCATED]';
  }

  return text;
}
