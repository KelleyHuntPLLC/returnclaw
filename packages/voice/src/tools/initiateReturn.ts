import { v4 as uuid } from 'uuid';
import pino from 'pino';
import type { ReturnRequest, ReturnReason, ReturnStatus } from '@returnclaw/core';
import type { RealtimeTool } from '../realtime.js';

const logger = pino({ name: 'returnclaw-voice-tool-initiate-return' });

export const initiateReturnSchema: RealtimeTool = {
  type: 'function',
  name: 'initiateReturn',
  description:
    'Initiate a return for one or more items from a specific order. Generates a deep link to the retailer return portal and provides step-by-step instructions. Use after confirming the user wants to proceed with the return.',
  parameters: {
    type: 'object',
    properties: {
      orderId: {
        type: 'string',
        description: 'The order ID or order number from the retailer',
      },
      items: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of item names or descriptions to return',
      },
      reason: {
        type: 'string',
        enum: [
          'wrong_item',
          'defective',
          'not_as_described',
          'changed_mind',
          'arrived_late',
          'better_price',
          'no_longer_needed',
          'other',
        ],
        description: 'The reason for the return',
      },
    },
    required: ['orderId', 'items', 'reason'],
  },
};

interface InitiateReturnArgs {
  orderId: string;
  items: string[];
  reason: string;
}

interface InitiateReturnResult {
  success: boolean;
  returnId: string;
  deepLinkUrl: string;
  nextSteps: string;
  returnRequest: Partial<ReturnRequest>;
}

/**
 * Known retailer deep link templates. In production these would come from a database
 * or configuration service. Keyed by lowercased retailer identifier extracted from order.
 */
const RETAILER_DEEP_LINKS: Record<string, string> = {
  amazon: 'https://www.amazon.com/returns/order/{orderId}',
  walmart: 'https://www.walmart.com/account/returns/start?orderId={orderId}',
  target: 'https://www.target.com/account/orders/{orderId}/return',
  bestbuy: 'https://www.bestbuy.com/returns/order/{orderId}',
  costco: 'https://www.costco.com/OrderStatusCmd?orderId={orderId}&action=return',
  apple: 'https://www.apple.com/shop/account/order/{orderId}/return',
  nike: 'https://www.nike.com/orders/{orderId}/return',
  nordstrom: 'https://www.nordstrom.com/account/orders/{orderId}/return',
  macys: 'https://www.macys.com/account/order/{orderId}/return',
  homedepot: 'https://www.homedepot.com/order/{orderId}/return',
  zara: 'https://www.zara.com/us/en/my-account/orders/{orderId}/return',
  hm: 'https://www2.hm.com/en_us/my-account/orders/{orderId}/return',
  gap: 'https://www.gap.com/account/order/{orderId}/return',
  oldnavy: 'https://www.oldnavy.com/account/order/{orderId}/return',
  uniqlo: 'https://www.uniqlo.com/us/en/account/orders/{orderId}/return',
};

const REASON_MAP: Record<string, ReturnReason> = {
  wrong_item: 'wrong_item' as ReturnReason,
  defective: 'defective' as ReturnReason,
  not_as_described: 'not_as_described' as ReturnReason,
  changed_mind: 'changed_mind' as ReturnReason,
  arrived_late: 'arrived_late' as ReturnReason,
  better_price: 'better_price' as ReturnReason,
  no_longer_needed: 'no_longer_needed' as ReturnReason,
  other: 'other' as ReturnReason,
};

/**
 * Attempt to detect the retailer name from the order ID format.
 * Many retailers use predictable order ID patterns.
 */
function detectRetailerFromOrderId(orderId: string): string | null {
  const normalized = orderId.toLowerCase().trim();

  // Amazon: starts with digits, typically 17-digit or "xxx-xxxxxxx-xxxxxxx"
  if (/^\d{3}-\d{7}-\d{7}$/.test(normalized)) return 'amazon';

  // Walmart: starts with a number, often 13+ digits
  if (/^\d{13,}$/.test(normalized)) return 'walmart';

  // Best Buy: "BBY" prefix
  if (normalized.startsWith('bby')) return 'bestbuy';

  // Target: often starts with a number and is 9 digits
  if (/^\d{9}$/.test(normalized)) return 'target';

  return null;
}

/**
 * Build a deep link URL for the detected retailer or return a generic fallback.
 */
function buildDeepLink(orderId: string, retailerHint?: string): string {
  const retailer = retailerHint ?? detectRetailerFromOrderId(orderId);

  if (retailer != null) {
    const template = RETAILER_DEEP_LINKS[retailer.toLowerCase()];
    if (template != null) {
      return template.replace('{orderId}', encodeURIComponent(orderId));
    }
  }

  // Fallback: generic search-based link
  return `https://returnclaw.com/return/start?orderId=${encodeURIComponent(orderId)}`;
}

function buildNextSteps(items: string[], reason: string, deepLinkUrl: string): string {
  const itemList = items.length === 1
    ? items[0]
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

  const steps: string[] = [
    `1. Open the return link I'm sending you: ${deepLinkUrl}`,
    `2. Select the following item(s) for return: ${itemList}`,
    `3. Choose "${formatReason(reason)}" as your return reason`,
    '4. Select your preferred refund method (original payment, store credit, or exchange if available)',
    '5. Print the return shipping label if one is provided',
    '6. Pack the item(s) securely in the original packaging if possible',
    '7. Attach the shipping label and drop off or schedule a pickup',
  ];

  if (reason === 'defective') {
    steps.splice(3, 0, '   Tip: Mention the specific defect — this often qualifies you for free return shipping');
  }

  return steps.join('\n');
}

function formatReason(reason: string): string {
  const labels: Record<string, string> = {
    wrong_item: 'Wrong item received',
    defective: 'Item is defective or damaged',
    not_as_described: 'Not as described',
    changed_mind: 'Changed my mind',
    arrived_late: 'Arrived too late',
    better_price: 'Found a better price',
    no_longer_needed: 'No longer needed',
    other: 'Other',
  };
  return labels[reason] ?? reason;
}

export async function execute(
  args: { orderId: string; items: string[]; reason: string },
): Promise<InitiateReturnResult> {
  const { orderId, items, reason } = args;

  logger.info({ orderId, itemCount: items.length, reason }, 'Initiating return');

  // Validate inputs
  if (orderId.trim().length === 0) {
    throw new Error('Order ID is required to initiate a return');
  }

  if (items.length === 0) {
    throw new Error('At least one item must be specified for the return');
  }

  const validReasons = Object.keys(REASON_MAP);
  const normalizedReason = validReasons.includes(reason) ? reason : 'other';

  // Generate the return request
  const returnId = uuid();
  const deepLinkUrl = buildDeepLink(orderId);
  const nextSteps = buildNextSteps(items, normalizedReason, deepLinkUrl);

  const returnRequest: Partial<ReturnRequest> = {
    id: returnId,
    orderId,
    status: 'initiated' as ReturnStatus,
    reason: REASON_MAP[normalizedReason],
    deepLink: deepLinkUrl,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: items.map((itemName, index) => ({
      orderItemId: `${orderId}-item-${index}`,
      quantity: 1,
      reason: REASON_MAP[normalizedReason]!,
      condition: normalizedReason === 'defective' ? 'defective' : 'like_new',
    })),
  };

  logger.info(
    { returnId, orderId, deepLinkUrl },
    'Return initiated successfully',
  );

  return {
    success: true,
    returnId,
    deepLinkUrl,
    nextSteps,
    returnRequest,
  };
}
