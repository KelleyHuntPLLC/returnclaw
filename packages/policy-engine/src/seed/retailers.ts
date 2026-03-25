import type { RetailerPolicy } from '@returnclaw/core';
import { PolicyStore } from '../store.js';
import { createChildLogger } from '@returnclaw/core';

const log = createChildLogger({ component: 'seed' });

// ---------------------------------------------------------------------------
// Seed data — top 10 US retailers with accurate return policies (as of 2025)
// ---------------------------------------------------------------------------

interface RetailerSeedEntry {
  name: string;
  slug: string;
  website: string;
  logoUrl: string | null;
  policy: Omit<RetailerPolicy, 'retailerId' | 'retailerName'>;
}

export const RETAILER_POLICIES: RetailerSeedEntry[] = [
  // -----------------------------------------------------------------------
  // 1. Amazon — 30-day window most items
  // -----------------------------------------------------------------------
  {
    name: 'Amazon',
    slug: 'amazon',
    website: 'https://www.amazon.com',
    logoUrl: null,
    policy: {
      returnWindow: 30,
      conditions: [
        {
          type: 'any',
          required: false,
          description:
            'Most items can be returned in any condition within 30 days of delivery',
        },
      ],
      exceptions: [
        {
          category: 'Gift Cards',
          rule: 'Non-returnable',
          nonReturnable: true,
        },
        {
          category: 'Digital Content',
          rule: 'Non-returnable after download or stream access',
          nonReturnable: true,
        },
        {
          category: 'Grocery',
          rule: 'Non-returnable perishable items',
          returnWindow: 14,
          nonReturnable: true,
        },
        {
          category: 'Hazardous Materials',
          rule: 'Non-returnable due to shipping restrictions',
          nonReturnable: true,
        },
        {
          category: 'Live Insects',
          rule: 'Non-returnable',
          nonReturnable: true,
        },
        {
          category: 'Amazon Pharmacy',
          rule: 'Prescription items non-returnable',
          nonReturnable: true,
        },
        {
          category: 'Customized Products',
          rule: 'Personalized items are non-returnable',
          nonReturnable: true,
        },
      ],
      restockingFee: null,
      exchangePolicy: {
        allowed: true,
        sameItemOnly: false,
        priceDifferenceHandling: 'refund',
      },
      refundMethod: ['original_payment', 'gift_card'],
      requiresReceipt: false,
      freeReturnShipping: true,
      dropOffLocations: [
        'UPS Store',
        'Whole Foods Market',
        "Kohl's",
        'Amazon Locker',
        'Amazon Hub Counter',
      ],
      specialCategories: [
        {
          category: 'Electronics',
          returnWindow: 30,
          conditions: [
            {
              type: 'any',
              required: false,
              description:
                'Must include all accessories, manuals, and original packaging when possible',
            },
          ],
          nonReturnable: false,
          notes: 'Same 30-day window as standard items. Some third-party sellers may differ.',
        },
        {
          category: 'Baby Registry Items',
          returnWindow: 90,
          conditions: [
            {
              type: 'any',
              required: false,
              description: 'Extended return window for baby registry items',
            },
          ],
          nonReturnable: false,
          notes: '90-day return window for items purchased from a baby registry.',
        },
        {
          category: 'Wedding Registry Items',
          returnWindow: 90,
          conditions: [
            {
              type: 'any',
              required: false,
              description: 'Extended return window for wedding registry items',
            },
          ],
          nonReturnable: false,
          notes: '90-day return window for items purchased from a wedding registry.',
        },
        {
          category: 'Holiday Items',
          returnWindow: 60,
          conditions: [
            {
              type: 'any',
              required: false,
              description:
                'Items purchased during holiday season have extended return window through Jan 31',
            },
          ],
          nonReturnable: false,
          notes:
            'Items shipped between Nov 1 and Dec 31 can be returned through Jan 31 of the following year.',
        },
      ],
      lastVerified: new Date('2025-06-01'),
      sourceUrl: 'https://www.amazon.com/gp/help/customer/display.html?nodeId=GKM69DUUYKQWKCES',
    },
  },

  // -----------------------------------------------------------------------
  // 2. Walmart — 90-day most items
  // -----------------------------------------------------------------------
  {
    name: 'Walmart',
    slug: 'walmart',
    website: 'https://www.walmart.com',
    logoUrl: null,
    policy: {
      returnWindow: 90,
      conditions: [
        {
          type: 'original_packaging',
          required: false,
          description:
            'Items should be returned in original packaging when possible',
        },
        {
          type: 'unused',
          required: false,
          description: 'Items should be unused or in new condition',
        },
      ],
      exceptions: [
        {
          category: 'Wireless Phones',
          rule: '14-day return window with restocking fee possible',
          returnWindow: 14,
        },
        {
          category: 'Prescription Medications',
          rule: 'Non-returnable by law',
          nonReturnable: true,
        },
        {
          category: 'Firearms & Ammunition',
          rule: 'Non-returnable',
          nonReturnable: true,
        },
        {
          category: 'Trading Cards',
          rule: 'Non-returnable if opened',
          nonReturnable: true,
        },
        {
          category: 'Prepaid Phone Cards',
          rule: 'Non-returnable',
          nonReturnable: true,
        },
        {
          category: 'Gas Powered Items',
          rule: 'Cannot be returned if fueled',
          nonReturnable: false,
        },
      ],
      restockingFee: null,
      exchangePolicy: {
        allowed: true,
        sameItemOnly: false,
        priceDifferenceHandling: 'refund',
      },
      refundMethod: ['original_payment', 'store_credit', 'exchange'],
      requiresReceipt: false,
      freeReturnShipping: true,
      dropOffLocations: [
        'Walmart Store',
        'FedEx Office',
        'USPS',
      ],
      specialCategories: [
        {
          category: 'Electronics',
          returnWindow: 30,
          conditions: [
            {
              type: 'original_packaging',
              required: true,
              description:
                'Must be returned in original packaging with all accessories',
            },
          ],
          nonReturnable: false,
          notes:
            '30-day return window for electronics including TVs, computers, cameras, and tablets.',
        },
        {
          category: 'Computers & Tablets',
          returnWindow: 30,
          conditions: [
            {
              type: 'original_packaging',
              required: true,
              description: 'Must be in original packaging with all accessories',
            },
          ],
          nonReturnable: false,
          notes: '30-day return window for computers, laptops, and tablets.',
        },
        {
          category: 'Luxury Items',
          returnWindow: 14,
          conditions: [
            {
              type: 'unused',
              required: true,
              description: 'Must be unworn with tags and in original packaging',
            },
          ],
          nonReturnable: false,
          notes: 'Premium electronics, jewelry, and luxury goods have a 14-day window.',
        },
      ],
      lastVerified: new Date('2025-06-01'),
      sourceUrl: 'https://www.walmart.com/cp/returns/1231920',
    },
  },

  // -----------------------------------------------------------------------
  // 3. Target — 90-day standard, 120-day RedCard, 365-day owned brands
  // -----------------------------------------------------------------------
  {
    name: 'Target',
    slug: 'target',
    website: 'https://www.target.com',
    logoUrl: null,
    policy: {
      returnWindow: 90,
      conditions: [
        {
          type: 'any',
          required: false,
          description:
            'Most unopened items in new condition can be returned within 90 days for a full refund',
        },
      ],
      exceptions: [
        {
          category: 'Opened Music/Movies/Video Games',
          rule: 'Can be exchanged for the same title only if defective',
          nonReturnable: false,
        },
        {
          category: 'Personalized Items',
          rule: 'Non-returnable custom/personalized merchandise',
          nonReturnable: true,
        },
        {
          category: 'Gift Cards',
          rule: 'Non-returnable and non-refundable',
          nonReturnable: true,
        },
        {
          category: 'Opened Collectibles',
          rule: 'Non-returnable once opened',
          nonReturnable: true,
        },
      ],
      restockingFee: null,
      exchangePolicy: {
        allowed: true,
        sameItemOnly: false,
        priceDifferenceHandling: 'refund',
      },
      refundMethod: ['original_payment', 'store_credit', 'exchange'],
      requiresReceipt: false,
      freeReturnShipping: true,
      dropOffLocations: ['Target Store', 'USPS (prepaid label)'],
      specialCategories: [
        {
          category: 'Electronics',
          returnWindow: 30,
          conditions: [
            {
              type: 'original_packaging',
              required: true,
              description: 'Must include all accessories and original packaging',
            },
          ],
          nonReturnable: false,
          notes:
            '30-day return window for electronics. Target RedCard holders get an additional 30 days (60 total).',
        },
        {
          category: 'Apple Products',
          returnWindow: 15,
          conditions: [
            {
              type: 'original_packaging',
              required: true,
              description: 'Must be in original, undamaged packaging',
            },
          ],
          nonReturnable: false,
          notes: '15-day return window for Apple products purchased at Target.',
        },
        {
          category: 'Target Owned Brands',
          returnWindow: 365,
          conditions: [
            {
              type: 'any',
              required: false,
              description:
                'One-year return window on all Target owned brand items',
            },
          ],
          nonReturnable: false,
          notes:
            'Target owned brands (Cat & Jack, Room Essentials, Up & Up, Threshold, Good & Gather, etc.) can be returned within 365 days.',
        },
        {
          category: 'RedCard Purchases',
          returnWindow: 120,
          conditions: [
            {
              type: 'any',
              required: false,
              description:
                'RedCard holders receive an additional 30 days on the standard return window',
            },
          ],
          nonReturnable: false,
          notes:
            'Target RedCard (debit or credit) holders get 120 days for most items (standard 90 + 30 bonus).',
        },
      ],
      lastVerified: new Date('2025-06-01'),
      sourceUrl: 'https://help.target.com/help/subcategoryarticle?childcat=Returns+%26+Exchanges',
    },
  },

  // -----------------------------------------------------------------------
  // 4. Best Buy — 15-day standard, 60-day TotalTech, 15% restocking fee
  // -----------------------------------------------------------------------
  {
    name: 'Best Buy',
    slug: 'bestbuy',
    website: 'https://www.bestbuy.com',
    logoUrl: null,
    policy: {
      returnWindow: 15,
      conditions: [
        {
          type: 'original_packaging',
          required: true,
          description:
            'Items must be returned in like-new condition with all original packaging and accessories',
        },
      ],
      exceptions: [
        {
          category: 'Cell Phones & Devices',
          rule: '14-day return window for activatable devices',
          returnWindow: 14,
        },
        {
          category: 'Final Sale Items',
          rule: 'Non-returnable as marked at time of sale',
          nonReturnable: true,
        },
        {
          category: 'Digital Content',
          rule: 'Non-returnable digital downloads and subscriptions',
          nonReturnable: true,
        },
        {
          category: 'Marketplace Items',
          rule: 'Follows individual seller return policies',
          nonReturnable: false,
        },
      ],
      restockingFee: {
        percentage: 15,
        applicableCategories: [
          'Drones',
          'DSLR Cameras & Lenses',
          'Electric Vehicles',
          'Premium Camcorders',
          'Projectors & Projector Screens',
          'Special Order Products',
        ],
        waived: false,
        waiverCondition:
          'Restocking fee waived for My Best Buy Total (TotalTech) members',
      },
      exchangePolicy: {
        allowed: true,
        sameItemOnly: false,
        priceDifferenceHandling: 'refund',
      },
      refundMethod: ['original_payment', 'store_credit', 'exchange'],
      requiresReceipt: true,
      freeReturnShipping: true,
      dropOffLocations: ['Best Buy Store', 'UPS Store (prepaid label)'],
      specialCategories: [
        {
          category: 'TotalTech Members',
          returnWindow: 60,
          conditions: [
            {
              type: 'original_packaging',
              required: true,
              description:
                'Extended 60-day return window for My Best Buy Total members',
            },
          ],
          nonReturnable: false,
          notes:
            'My Best Buy Total (formerly TotalTech) members receive a 60-day return window on most products, and the restocking fee is waived.',
        },
        {
          category: 'Activatable Devices',
          returnWindow: 14,
          conditions: [
            {
              type: 'original_packaging',
              required: true,
              description:
                'Cell phones, tablets with carrier plans, and mobile hotspots',
            },
          ],
          nonReturnable: false,
          notes:
            '14-day return/exchange window for activatable devices. Early termination fees from carriers may apply.',
        },
        {
          category: 'Major Appliances',
          returnWindow: 15,
          conditions: [
            {
              type: 'unused',
              required: true,
              description: 'Must be in original condition, not installed',
            },
          ],
          nonReturnable: false,
          notes:
            '15-day return window for major appliances. Must be returned in like-new, uninstalled condition.',
        },
      ],
      lastVerified: new Date('2025-06-01'),
      sourceUrl: 'https://www.bestbuy.com/site/help-topics/return-exchange-policy/pcmcat260800050014.c',
    },
  },

  // -----------------------------------------------------------------------
  // 5. Costco — satisfaction guarantee, 90-day electronics
  // -----------------------------------------------------------------------
  {
    name: 'Costco',
    slug: 'costco',
    website: 'https://www.costco.com',
    logoUrl: null,
    policy: {
      returnWindow: 365,
      conditions: [
        {
          type: 'any',
          required: false,
          description:
            'Costco has a generous satisfaction guarantee with no formal time limit on most items. 365 days used as practical maximum.',
        },
      ],
      exceptions: [
        {
          category: 'Diamonds over 1.00ct',
          rule: '48-hour inspection period; must submit IGI and/or GIA certificates for refund',
          returnWindow: 2,
        },
        {
          category: 'Cigarettes & Alcohol',
          rule: 'Non-returnable where prohibited by state law',
          nonReturnable: true,
        },
        {
          category: 'Special Order Kiosk Items',
          rule: 'Non-returnable custom-order products',
          nonReturnable: true,
        },
        {
          category: 'Airline & Live Event Tickets',
          rule: 'Non-refundable after purchase',
          nonReturnable: true,
        },
        {
          category: 'Gold Bars & Gift Cards',
          rule: 'Non-returnable',
          nonReturnable: true,
        },
      ],
      restockingFee: null,
      exchangePolicy: {
        allowed: true,
        sameItemOnly: false,
        priceDifferenceHandling: 'refund',
      },
      refundMethod: ['original_payment', 'store_credit'],
      requiresReceipt: false,
      freeReturnShipping: true,
      dropOffLocations: ['Costco Warehouse (in-store only)'],
      specialCategories: [
        {
          category: 'Electronics',
          returnWindow: 90,
          conditions: [
            {
              type: 'any',
              required: false,
              description:
                'TVs, projectors, computers, tablets, smartwatches, cameras, drones, and more',
            },
          ],
          nonReturnable: false,
          notes:
            '90-day return window for electronics. Includes TVs, projectors, major appliances, computers, tablets, smartwatches, cameras, drones, camcorders, and MP3 players.',
        },
        {
          category: 'Appliances',
          returnWindow: 90,
          conditions: [
            {
              type: 'any',
              required: false,
              description: 'Major appliances follow 90-day electronics policy',
            },
          ],
          nonReturnable: false,
          notes:
            '90-day return window for major appliances including refrigerators, washers, dryers, and ranges.',
        },
      ],
      lastVerified: new Date('2025-06-01'),
      sourceUrl: 'https://customerservice.costco.com/app/answers/detail/a_id/1191',
    },
  },

  // -----------------------------------------------------------------------
  // 6. Apple — 14 days from delivery
  // -----------------------------------------------------------------------
  {
    name: 'Apple',
    slug: 'apple',
    website: 'https://www.apple.com',
    logoUrl: null,
    policy: {
      returnWindow: 14,
      conditions: [
        {
          type: 'original_packaging',
          required: true,
          description:
            'Items must be undamaged, in original packaging, with all accessories and documentation',
        },
        {
          type: 'unused',
          required: false,
          description: 'Product should be in like-new condition',
        },
      ],
      exceptions: [
        {
          category: 'Gift Cards',
          rule: 'Non-refundable and non-returnable',
          nonReturnable: true,
        },
        {
          category: 'Electronic Software Downloads',
          rule: 'Non-returnable once download code is redeemed',
          nonReturnable: true,
        },
        {
          category: 'Opened Software',
          rule: 'Opened software with a visible license seal cannot be returned',
          nonReturnable: true,
        },
        {
          category: 'Personalized/Engraved Products',
          rule: 'Custom engravings make the product non-returnable',
          nonReturnable: true,
        },
        {
          category: 'AppleCare+',
          rule: 'Can be cancelled within 30 days for full refund, or later for pro-rated refund',
          returnWindow: 30,
          nonReturnable: false,
        },
      ],
      restockingFee: null,
      exchangePolicy: {
        allowed: true,
        sameItemOnly: false,
        priceDifferenceHandling: 'refund',
      },
      refundMethod: ['original_payment'],
      requiresReceipt: true,
      freeReturnShipping: true,
      dropOffLocations: ['Apple Store', 'Prepaid shipping label (online orders)'],
      specialCategories: [
        {
          category: 'iPhone',
          returnWindow: 14,
          conditions: [
            {
              type: 'original_packaging',
              required: true,
              description: 'Must include all accessories and original packaging',
            },
          ],
          nonReturnable: false,
          notes:
            'Standard 14-day return window. Carrier activation fees and wireless service charges may not be refundable by Apple.',
        },
        {
          category: 'Mac',
          returnWindow: 14,
          conditions: [
            {
              type: 'original_packaging',
              required: true,
              description: 'Must be in original packaging with all included accessories',
            },
          ],
          nonReturnable: false,
          notes:
            'Standard 14-day return window from date of delivery. Custom configured Macs are also returnable within 14 days.',
        },
        {
          category: 'Holiday Purchases',
          returnWindow: 28,
          conditions: [
            {
              type: 'original_packaging',
              required: true,
              description: 'Extended holiday return window',
            },
          ],
          nonReturnable: false,
          notes:
            'Products purchased between mid-November and December 25 may be returned through early January (extended holiday window).',
        },
      ],
      lastVerified: new Date('2025-06-01'),
      sourceUrl: 'https://www.apple.com/shop/help/returns_refund',
    },
  },

  // -----------------------------------------------------------------------
  // 7. Nike — 30 days unworn, 60 days Nike Members
  // -----------------------------------------------------------------------
  {
    name: 'Nike',
    slug: 'nike',
    website: 'https://www.nike.com',
    logoUrl: null,
    policy: {
      returnWindow: 30,
      conditions: [
        {
          type: 'unused',
          required: false,
          description:
            'Items should be unworn and unwashed for full refund. Nike Members can return worn shoes within 30 days.',
        },
        {
          type: 'tags_attached',
          required: false,
          description: 'Tags should be attached when possible',
        },
      ],
      exceptions: [
        {
          category: 'Nike By You (Custom)',
          rule: 'Customized/personalized products are final sale and non-returnable',
          nonReturnable: true,
        },
        {
          category: 'Apple Watch Nike',
          rule: 'Follows Apple 14-day return policy',
          returnWindow: 14,
        },
        {
          category: 'Gift Cards',
          rule: 'Non-returnable and non-refundable',
          nonReturnable: true,
        },
      ],
      restockingFee: null,
      exchangePolicy: {
        allowed: true,
        sameItemOnly: false,
        priceDifferenceHandling: 'refund',
      },
      refundMethod: ['original_payment'],
      requiresReceipt: true,
      freeReturnShipping: true,
      dropOffLocations: ['Nike Store', 'UPS Store', 'USPS'],
      specialCategories: [
        {
          category: 'Nike Members Footwear',
          returnWindow: 60,
          conditions: [
            {
              type: 'any',
              required: false,
              description:
                'Nike Members can try shoes and return them even if worn within 60 days',
            },
          ],
          nonReturnable: false,
          notes:
            'Nike Members get a 60-day wear test on footwear. Shoes can be returned even if worn outdoors, as long as they are within the 60-day window.',
        },
        {
          category: 'Nike Members Apparel',
          returnWindow: 60,
          conditions: [
            {
              type: 'unused',
              required: false,
              description:
                'Nike Members get 60 days; apparel should be unworn/unwashed with tags',
            },
          ],
          nonReturnable: false,
          notes:
            'Nike Members receive a 60-day return window on apparel and accessories.',
        },
      ],
      lastVerified: new Date('2025-06-01'),
      sourceUrl: 'https://www.nike.com/help/a/returns-policy',
    },
  },

  // -----------------------------------------------------------------------
  // 8. Home Depot — 90 days most, 30 days appliances
  // -----------------------------------------------------------------------
  {
    name: 'Home Depot',
    slug: 'homedepot',
    website: 'https://www.homedepot.com',
    logoUrl: null,
    policy: {
      returnWindow: 90,
      conditions: [
        {
          type: 'unused',
          required: false,
          description:
            'Most new, unopened merchandise can be returned within 90 days of purchase',
        },
        {
          type: 'original_packaging',
          required: false,
          description: 'Original packaging preferred but not always required',
        },
      ],
      exceptions: [
        {
          category: 'Custom Products',
          rule: 'Non-returnable: custom blinds, countertops, special-order items',
          nonReturnable: true,
        },
        {
          category: 'Cut Materials',
          rule: 'Non-returnable: cut lumber, pipe, wire, chain, fabric, and similar',
          nonReturnable: true,
        },
        {
          category: 'Utility Trailers',
          rule: 'Non-returnable once title has been issued',
          nonReturnable: true,
        },
        {
          category: 'Gift Cards',
          rule: 'Non-returnable',
          nonReturnable: true,
        },
        {
          category: 'Whole House and Stationary Generators',
          rule: 'Non-returnable once fueled',
          nonReturnable: false,
          returnWindow: 30,
        },
      ],
      restockingFee: {
        percentage: 15,
        applicableCategories: ['Special Order Returns', 'Custom Blinds (if error)'],
        waived: false,
        waiverCondition: 'Waived if return is due to a Home Depot error',
      },
      exchangePolicy: {
        allowed: true,
        sameItemOnly: false,
        priceDifferenceHandling: 'refund',
      },
      refundMethod: ['original_payment', 'store_credit'],
      requiresReceipt: true,
      freeReturnShipping: false,
      dropOffLocations: ['Home Depot Store'],
      specialCategories: [
        {
          category: 'Appliances',
          returnWindow: 30,
          conditions: [
            {
              type: 'unused',
              required: true,
              description:
                'Major appliances must be in original, uninstalled condition',
            },
          ],
          nonReturnable: false,
          notes:
            '30-day return window for major appliances (refrigerators, washers, dryers, ranges, dishwashers). Must be uninstalled and in original condition.',
        },
        {
          category: 'Furniture & Area Rugs',
          returnWindow: 30,
          conditions: [
            {
              type: 'unused',
              required: true,
              description: 'Must be unassembled, in original packaging',
            },
          ],
          nonReturnable: false,
          notes: '30-day return window for furniture and area rugs.',
        },
        {
          category: 'Generators',
          returnWindow: 30,
          conditions: [
            {
              type: 'unused',
              required: true,
              description: 'Must not have been fueled or used',
            },
          ],
          nonReturnable: false,
          notes:
            '30-day return window for consumer electronics, generators, and gas-powered items. Must not have been fueled.',
        },
        {
          category: 'Plants',
          returnWindow: 365,
          conditions: [
            {
              type: 'any',
              required: false,
              description: 'One-year plant guarantee',
            },
          ],
          nonReturnable: false,
          notes:
            'Home Depot guarantees perennials, trees, shrubs, and roses for one year. Annuals, tropicals, and succulents are guaranteed for 90 days.',
        },
      ],
      lastVerified: new Date('2025-06-01'),
      sourceUrl: 'https://www.homedepot.com/c/Return_Policy',
    },
  },

  // -----------------------------------------------------------------------
  // 9. Nordstrom — case-by-case, no formal limit
  // -----------------------------------------------------------------------
  {
    name: 'Nordstrom',
    slug: 'nordstrom',
    website: 'https://www.nordstrom.com',
    logoUrl: null,
    policy: {
      returnWindow: 365,
      conditions: [
        {
          type: 'any',
          required: false,
          description:
            'Nordstrom handles returns on a case-by-case basis. There is no hard time limit, but returns should be "reasonable." 365 used as practical limit.',
        },
      ],
      exceptions: [
        {
          category: 'Final Sale Items',
          rule: 'Items marked "Final Sale" cannot be returned or exchanged',
          nonReturnable: true,
        },
        {
          category: 'Special Occasion Dresses (tag removed)',
          rule: 'Non-returnable if the tag has been removed',
          nonReturnable: true,
        },
        {
          category: 'Gift Cards',
          rule: 'Non-refundable',
          nonReturnable: true,
        },
      ],
      restockingFee: null,
      exchangePolicy: {
        allowed: true,
        sameItemOnly: false,
        priceDifferenceHandling: 'refund',
      },
      refundMethod: ['original_payment', 'store_credit', 'gift_card'],
      requiresReceipt: false,
      freeReturnShipping: true,
      dropOffLocations: [
        'Nordstrom Store',
        'Nordstrom Rack',
        'USPS (prepaid label)',
        'UPS Store',
      ],
      specialCategories: [
        {
          category: 'Nordstrom Rack',
          returnWindow: 45,
          conditions: [
            {
              type: 'tags_attached',
              required: true,
              description:
                'Nordstrom Rack items must have tags attached for return',
            },
          ],
          nonReturnable: false,
          notes:
            'Nordstrom Rack purchases have a 45-day return window. Items must have tags attached. Returns can be made at any Nordstrom Rack location or by mail.',
        },
        {
          category: 'Designer Items',
          returnWindow: 365,
          conditions: [
            {
              type: 'tags_attached',
              required: false,
              description:
                'Designer items handled with same generous case-by-case policy',
            },
          ],
          nonReturnable: false,
          notes:
            'High-end designer items follow the same generous return policy. Nordstrom is known for being very accommodating.',
        },
      ],
      lastVerified: new Date('2025-06-01'),
      sourceUrl: 'https://www.nordstrom.com/content/return-policy',
    },
  },

  // -----------------------------------------------------------------------
  // 10. Macy's — 30 days most items
  // -----------------------------------------------------------------------
  {
    name: "Macy's",
    slug: 'macys',
    website: 'https://www.macys.com',
    logoUrl: null,
    policy: {
      returnWindow: 30,
      conditions: [
        {
          type: 'tags_attached',
          required: false,
          description:
            'Items should have original tags when possible for full refund',
        },
        {
          type: 'original_packaging',
          required: false,
          description: 'Original packaging preferred',
        },
      ],
      exceptions: [
        {
          category: 'Last Act Clearance',
          rule: 'Final sale items are non-returnable and non-exchangeable',
          nonReturnable: true,
        },
        {
          category: 'Gift Cards',
          rule: 'Non-refundable and non-returnable',
          nonReturnable: true,
        },
        {
          category: 'Gourmet Food',
          rule: 'Non-returnable perishable goods',
          nonReturnable: true,
        },
        {
          category: 'Swimwear & Intimates (hygienic liner removed)',
          rule: 'Non-returnable if hygienic liner has been removed',
          nonReturnable: true,
        },
        {
          category: 'Cosmetics & Fragrances',
          rule: 'Returnable within 30 days even if opened/used',
          nonReturnable: false,
          returnWindow: 30,
        },
      ],
      restockingFee: null,
      exchangePolicy: {
        allowed: true,
        sameItemOnly: false,
        priceDifferenceHandling: 'refund',
      },
      refundMethod: ['original_payment', 'store_credit'],
      requiresReceipt: true,
      freeReturnShipping: false,
      dropOffLocations: [
        "Macy's Store",
        'USPS (return label $9.99 deducted from refund)',
        'UPS Store',
      ],
      specialCategories: [
        {
          category: 'Furniture & Mattresses',
          returnWindow: 30,
          conditions: [
            {
              type: 'unused',
              required: true,
              description:
                'Furniture must be in original, unused condition',
            },
          ],
          nonReturnable: false,
          notes:
            '30-day return window for furniture and mattresses. A pickup fee may apply for large items. Mattresses must have the law tag intact.',
        },
        {
          category: 'Area Rugs',
          returnWindow: 30,
          conditions: [
            {
              type: 'original_packaging',
              required: true,
              description: 'Must be in original packaging, unused',
            },
          ],
          nonReturnable: false,
          notes: '30-day return window; must be in original rolled packaging.',
        },
        {
          category: 'Apple Products',
          returnWindow: 14,
          conditions: [
            {
              type: 'original_packaging',
              required: true,
              description: 'Apple products follow Apple 14-day return policy',
            },
          ],
          nonReturnable: false,
          notes:
            "14-day return window for Apple products purchased at Macy's, following Apple's standard policy.",
        },
        {
          category: 'Watches & Jewelry',
          returnWindow: 30,
          conditions: [
            {
              type: 'tags_attached',
              required: true,
              description: 'Must have all tags and original packaging',
            },
          ],
          nonReturnable: false,
          notes:
            '30-day return window for watches and jewelry. Items must be in unworn condition with all tags and packaging.',
        },
      ],
      lastVerified: new Date('2025-06-01'),
      sourceUrl: 'https://www.customerservice-macys.com/articles/whats-macys-return-policy',
    },
  },
];

// ---------------------------------------------------------------------------
// seedRetailers — insert all 10 retailers + policies into the store
// ---------------------------------------------------------------------------

export async function seedRetailers(store: PolicyStore): Promise<void> {
  log.info('Starting retailer policy seed');

  for (const entry of RETAILER_POLICIES) {
    const retailerId = await store.upsertRetailer(
      entry.name,
      entry.slug,
      entry.website,
      entry.logoUrl ?? undefined,
    );
    await store.upsertPolicy(retailerId, entry.policy);
    log.info({ retailerName: entry.name, retailerId }, 'Retailer policy seeded');
  }

  log.info(
    { count: RETAILER_POLICIES.length },
    'Retailer policy seed completed successfully',
  );
}

// ---------------------------------------------------------------------------
// CLI entrypoint — run directly with `tsx src/seed/retailers.ts`
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const store = new PolicyStore(databaseUrl);

  try {
    await seedRetailers(store);
  } catch (err) {
    log.error({ err }, 'Seed failed');
    process.exit(1);
  } finally {
    await store.close();
  }
}

// Detect direct execution (ESM)
const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('/retailers.ts') ||
    process.argv[1].endsWith('/retailers.js'));

if (isDirectRun) {
  main().catch((err) => {
    console.error('Seed error:', err);
    process.exit(1);
  });
}
