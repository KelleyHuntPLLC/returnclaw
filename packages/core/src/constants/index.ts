export const SESSION_TTL_SECONDS = 3600; // 1 hour
export const SESSION_MAX_PER_USER = 5;
export const VOICE_SESSION_TTL_SECONDS = 1800; // 30 minutes

export const RATE_LIMIT_DEFAULTS = {
  max: 100,
  windowMs: 60_000, // 1 minute
} as const;

export const RETURN_WINDOW_DEFAULTS = {
  standard: 30,
  extended: 90,
  unlimited: 365,
} as const;

export const SUPPORTED_RETAILERS = [
  'amazon',
  'walmart',
  'target',
  'bestbuy',
  'costco',
  'apple',
  'nike',
  'homedepot',
  'nordstrom',
  'macys',
] as const;

export type SupportedRetailer = (typeof SUPPORTED_RETAILERS)[number];

export const RETAILER_DOMAINS: Record<SupportedRetailer, string[]> = {
  amazon: ['amazon.com', 'amazon.co.uk'],
  walmart: ['walmart.com'],
  target: ['target.com'],
  bestbuy: ['bestbuy.com'],
  costco: ['costco.com'],
  apple: ['apple.com'],
  nike: ['nike.com'],
  homedepot: ['homedepot.com'],
  nordstrom: ['nordstrom.com'],
  macys: ['macys.com'],
};

export const DEEP_LINK_TEMPLATES: Record<SupportedRetailer, string> = {
  amazon: 'https://www.amazon.com/gp/orc/returns/homepage.html',
  walmart: 'https://www.walmart.com/account/wmpurchasehistory',
  target: 'https://www.target.com/account/orders',
  bestbuy: 'https://www.bestbuy.com/profile/ss/orders',
  costco: 'https://www.costco.com/OrderStatusCmd',
  apple: 'https://support.apple.com/returns',
  nike: 'https://www.nike.com/orders',
  homedepot: 'https://www.homedepot.com/order/view/orders',
  nordstrom: 'https://www.nordstrom.com/account/orders',
  macys: 'https://www.macys.com/account/orderhistory',
};

export const CARRIER_TRACKING_URLS: Record<string, string> = {
  ups: 'https://www.ups.com/track?tracknum=',
  fedex: 'https://www.fedex.com/fedextrack/?trknbr=',
  usps: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=',
  dhl: 'https://www.dhl.com/en/express/tracking.html?AWB=',
};

export const API_VERSION = 'v1';
export const API_PREFIX = `/api/${API_VERSION}`;
