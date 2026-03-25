import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

/**
 * Common date formats found in order confirmation emails.
 */
const ORDER_DATE_FORMATS = [
  'MMMM D, YYYY',
  'MMM D, YYYY',
  'MM/DD/YYYY',
  'M/D/YYYY',
  'YYYY-MM-DD',
  'DD MMM YYYY',
  'D MMM YYYY',
  'MMMM D YYYY',
  'MMM D YYYY',
  'MM-DD-YYYY',
  'M-D-YYYY',
  'MM.DD.YYYY',
  'MMMM DD, YYYY',
  'ddd, MMM D, YYYY',
  'dddd, MMMM D, YYYY',
];

/**
 * Common delivery date formats, which sometimes include day-of-week.
 */
const DELIVERY_DATE_FORMATS = [
  ...ORDER_DATE_FORMATS,
  'ddd, MMM D',
  'dddd, MMMM D',
  'MMM D',
  'MMMM D',
  'ddd, MMM D, YYYY',
  'dddd, MMMM D, YYYY',
];

/**
 * Parses a date string from an email into a Date object.
 * Tries multiple common formats.
 */
export function parseOrderDate(dateStr: string): Date | undefined {
  if (!dateStr) return undefined;

  const cleaned = dateStr
    .replace(/\s+/g, ' ')
    .replace(/(\d)(st|nd|rd|th)/gi, '$1')
    .trim();

  // Try ISO format first
  const iso = dayjs(cleaned);
  if (iso.isValid() && cleaned.includes('-') && cleaned.length >= 8) {
    return iso.toDate();
  }

  // Try each known format
  for (const format of ORDER_DATE_FORMATS) {
    const parsed = dayjs(cleaned, format, true);
    if (parsed.isValid()) {
      return parsed.toDate();
    }
  }

  // Try lenient parsing as last resort
  const lenient = dayjs(cleaned);
  if (lenient.isValid()) {
    return lenient.toDate();
  }

  return undefined;
}

/**
 * Parses delivery date strings, which may be relative ("by Friday")
 * or partial ("Dec 15").
 */
export function parseDeliveryDate(dateStr: string): Date | undefined {
  if (!dateStr) return undefined;

  const cleaned = dateStr
    .replace(/\s+/g, ' ')
    .replace(/^(by|before|arriving|delivery by|est\.?|estimated)\s+/i, '')
    .replace(/(\d)(st|nd|rd|th)/gi, '$1')
    .trim();

  // Try delivery-specific formats
  for (const format of DELIVERY_DATE_FORMATS) {
    const parsed = dayjs(cleaned, format, true);
    if (parsed.isValid()) {
      // If no year in the format, assume current or next year
      const result = parsed.toDate();
      if (result < new Date()) {
        const withNextYear = dayjs(cleaned, format, true).add(1, 'year');
        return withNextYear.toDate();
      }
      return result;
    }
  }

  // Handle relative dates like "Tomorrow", "Monday", etc.
  const relativeDate = parseRelativeDate(cleaned);
  if (relativeDate) return relativeDate;

  // Try lenient parsing
  const lenient = dayjs(cleaned);
  if (lenient.isValid()) {
    return lenient.toDate();
  }

  return undefined;
}

/**
 * Parses relative date expressions.
 */
function parseRelativeDate(str: string): Date | undefined {
  const lower = str.toLowerCase();
  const now = dayjs();

  if (lower === 'today') {
    return now.toDate();
  }
  if (lower === 'tomorrow') {
    return now.add(1, 'day').toDate();
  }

  // Day of week: "Monday", "Tuesday", etc.
  const days = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  const dayIndex = days.indexOf(lower);
  if (dayIndex !== -1) {
    const currentDay = now.day();
    let daysAhead = dayIndex - currentDay;
    if (daysAhead <= 0) daysAhead += 7;
    return now.add(daysAhead, 'day').toDate();
  }

  // "in X days"
  const inDaysMatch = /in\s+(\d+)\s+days?/i.exec(lower);
  if (inDaysMatch) {
    return now.add(parseInt(inDaysMatch[1], 10), 'day').toDate();
  }

  // "X-Y business days"
  const businessDaysMatch = /(\d+)\s*-\s*(\d+)\s+business\s+days?/i.exec(lower);
  if (businessDaysMatch) {
    // Use the upper bound
    const maxDays = parseInt(businessDaysMatch[2], 10);
    return addBusinessDays(now, maxDays).toDate();
  }

  return undefined;
}

/**
 * Adds business days (skipping weekends) to a date.
 */
function addBusinessDays(date: dayjs.Dayjs, days: number): dayjs.Dayjs {
  let current = date;
  let remaining = days;

  while (remaining > 0) {
    current = current.add(1, 'day');
    const dayOfWeek = current.day();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      remaining--;
    }
  }

  return current;
}

/**
 * Parses a date range string like "Dec 15 - Dec 20" and returns
 * the end date (latest estimated delivery).
 */
export function parseDateRange(rangeStr: string): { start?: Date; end?: Date } {
  if (!rangeStr) return {};

  const parts = rangeStr.split(/\s*[-–—]\s*/);
  if (parts.length === 2) {
    return {
      start: parseDeliveryDate(parts[0]),
      end: parseDeliveryDate(parts[1]),
    };
  }

  const single = parseDeliveryDate(rangeStr);
  return { start: single, end: single };
}

/**
 * Calculates the return-by date based on the order date and
 * the retailer's return window (in days).
 */
export function calculateReturnByDate(
  orderDate: Date,
  returnWindowDays: number,
): Date {
  return dayjs(orderDate).add(returnWindowDays, 'day').toDate();
}

/**
 * Checks if a return window is still open.
 */
export function isReturnWindowOpen(returnByDate: Date): boolean {
  return dayjs(returnByDate).isAfter(dayjs());
}

/**
 * Returns a human-readable string for time remaining in a return window.
 */
export function returnWindowRemaining(returnByDate: Date): string {
  const now = dayjs();
  const deadline = dayjs(returnByDate);

  if (deadline.isBefore(now)) {
    return 'expired';
  }

  const daysLeft = deadline.diff(now, 'day');
  if (daysLeft === 0) {
    return 'expires today';
  }
  if (daysLeft === 1) {
    return '1 day left';
  }

  return `${daysLeft} days left`;
}

/**
 * Formats a date for display to users.
 */
export function formatDisplayDate(date: Date): string {
  return dayjs(date).format('MMM D, YYYY');
}

/**
 * Gets the date X days ago, useful for email search queries.
 */
export function daysAgo(days: number): Date {
  return dayjs().subtract(days, 'day').toDate();
}
