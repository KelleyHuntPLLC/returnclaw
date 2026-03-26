/**
 * ReturnClaw — Frontend Application v1.0.0
 * Copyright (c) 2026 Kelley Hunt, PLLC. All rights reserved.
 * Created with Perplexity Computer
 *
 * Dual-mode: makes real API calls when running with backend (node server.js),
 * falls back to mock/demo behavior when running as static site (GitHub Pages).
 */

/* ============================================================
   SECTION 0: LIVE MODE DETECTION
   ============================================================ */

// Detect if running with the backend
let isLiveMode = false;
let API_BASE = '';

async function detectLiveMode() {
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'ok') {
        isLiveMode = true;
        API_BASE = '';
        console.log('🦞 ReturnClaw: Live mode — connected to backend');
        return;
      }
    }
  } catch (e) {
    // Backend not available
  }
  isLiveMode = false;
  API_BASE = null;
  console.log('🦞 ReturnClaw: Demo mode — using mock data');
}

// Run detection immediately
const liveModeReady = detectLiveMode();


/* ============================================================
   SECTION 1: LANDING PAGE INTERACTIONS
   Scroll animations, counter animations, smooth scroll to demo
   ============================================================ */

(function() {
  'use strict';

  // --- Smooth Scroll for anchor links ---
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // --- Counter Animation ---
  function animateCounters() {
    const counters = document.querySelectorAll('.stat-number[data-target]');
    counters.forEach(counter => {
      if (counter.dataset.animated) return;
      const target = parseInt(counter.dataset.target);
      const duration = 2000;
      const startTime = performance.now();

      function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.floor(eased * target);

        if (target > 1000) {
          counter.textContent = current.toLocaleString();
        } else {
          counter.textContent = current;
        }

        if (progress < 1) {
          requestAnimationFrame(update);
        } else {
          counter.textContent = target.toLocaleString();
        }
      }

      counter.dataset.animated = 'true';
      requestAnimationFrame(update);
    });
  }

  // --- IntersectionObserver for scroll animations ---
  const observerOptions = {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Stagger children animations
        if (entry.target.classList.contains('landing-steps')) {
          const cards = entry.target.querySelectorAll('.landing-step-card');
          cards.forEach((card, i) => {
            setTimeout(() => card.classList.add('visible'), i * 150);
          });
        } else if (entry.target.classList.contains('arch-stack')) {
          const layers = entry.target.querySelectorAll('.arch-layer');
          layers.forEach((layer, i) => {
            setTimeout(() => layer.classList.add('visible'), i * 120);
          });
        } else if (entry.target.classList.contains('landing-stats')) {
          animateCounters();
        } else {
          entry.target.classList.add('visible');
        }
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Observe elements when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    // Observe stagger containers
    document.querySelectorAll('.landing-steps, .arch-stack, .landing-stats').forEach(el => {
      observer.observe(el);
    });

    // Observe individual fade-in elements
    document.querySelectorAll('.landing-fade-in').forEach(el => {
      observer.observe(el);
    });
  });
})();


/* ============================================================
   SECTION 2: LEVENSHTEIN DISTANCE FOR FUZZY MATCHING
   ============================================================ */

function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}


/* ============================================================
   ReturnClaw — Conversation Engine
   Full B2C return flow with Web Speech API
   Upgraded with agentic capabilities + real API integration
   ============================================================ */

// ============================================================
// RETAILER DATABASE
// ============================================================
const RETAILERS = {
  amazon: {
    name: 'Amazon',
    window: 30,
    shipping: 'Free return shipping',
    refund: 'Refund to original payment method',
    conditions: ['Item must be in original packaging', 'All accessories included', 'No signs of excessive wear'],
    returnUrl: 'https://www.amazon.com/gp/orc/returns/homepage.html',
    icon: '📦',
    dropoffs: ['The UPS Store', 'Whole Foods', "Kohl's"],
    defectiveNote: 'Amazon covers return shipping for defective items regardless of window'
  },
  walmart: {
    name: 'Walmart',
    window: 90,
    shipping: 'Free in-store returns; mail returns may have fees',
    refund: 'Refund to original payment method',
    conditions: ['Item must be in original packaging', 'Receipt or order confirmation required'],
    returnUrl: 'https://www.walmart.com/account/returns',
    icon: '🏬',
    dropoffs: ['Walmart Store', 'FedEx Office'],
    defectiveNote: 'Walmart provides free return shipping for defective items'
  },
  target: {
    name: 'Target',
    window: 90,
    shipping: 'Free in-store returns; free mail returns with RedCard',
    refund: 'Refund to original payment method; store credit for no receipt',
    conditions: ['Item must be unopened or gently used', 'Electronics: 15-day window'],
    returnUrl: 'https://www.target.com/account/orders',
    icon: '🎯',
    dropoffs: ['Target Store', 'UPS Drop-off'],
    defectiveNote: 'Target may offer replacement or full refund for defective items'
  },
  bestbuy: {
    name: 'Best Buy',
    window: 15,
    shipping: 'Free return shipping on most items',
    refund: 'Refund to original payment method',
    conditions: ['Item must include all original packaging and accessories', 'Opened items may incur restocking fee', 'Totaltech members get 60-day window'],
    returnUrl: 'https://www.bestbuy.com/profile/ss/returns',
    icon: '💻',
    dropoffs: ['Best Buy Store', 'UPS Drop-off'],
    defectiveNote: 'Defective items may be exchanged beyond normal return window'
  },
  apple: {
    name: 'Apple',
    window: 14,
    shipping: 'Free return shipping',
    refund: 'Refund to original payment method',
    conditions: ['Item must be in original condition', 'All accessories and packaging included', 'Personalized items are final sale'],
    returnUrl: 'https://support.apple.com/returns',
    icon: '🍎',
    dropoffs: ['Apple Store', 'UPS Drop-off'],
    defectiveNote: 'Defective Apple products are covered under warranty for repair or replacement'
  },
  nike: {
    name: 'Nike',
    window: 60,
    shipping: 'Free return shipping',
    refund: 'Refund to original payment method',
    conditions: ['Unworn items in original packaging', 'Nike Members get 60 days; non-members 30 days'],
    returnUrl: 'https://www.nike.com/orders',
    icon: '👟',
    dropoffs: ['Nike Store', 'UPS Drop-off'],
    defectiveNote: 'Nike offers free return shipping for defective items outside normal window'
  },
  costco: {
    name: 'Costco',
    window: 365,
    shipping: 'Return at any Costco warehouse',
    refund: 'Refund to original payment method',
    conditions: ['Electronics: 90-day window', 'Satisfaction guaranteed on most items', 'Membership card required'],
    returnUrl: 'https://www.costco.com/OrderStatusCmd',
    icon: '🏪',
    dropoffs: ['Costco Warehouse'],
    defectiveNote: 'Costco satisfaction guarantee covers defective items with full refund'
  },
  nordstrom: {
    name: 'Nordstrom',
    window: 365,
    shipping: 'Free return shipping',
    refund: 'Refund to original payment method',
    conditions: ['No strict time limit — evaluated case by case', 'Items should be in resalable condition'],
    returnUrl: 'https://www.nordstrom.com/account/orders',
    icon: '👗',
    dropoffs: ['Nordstrom Store', 'UPS Drop-off'],
    defectiveNote: 'Nordstrom will always accept returns for defective merchandise'
  },
  zara: {
    name: 'Zara',
    window: 30,
    shipping: 'Free in-store returns; $4.95 for mail returns',
    refund: 'Refund to original payment method',
    conditions: ['Items must be unworn with tags attached', 'Underwear and swimwear are final sale'],
    returnUrl: 'https://www.zara.com/us/en/my-account/returns',
    icon: '👔',
    dropoffs: ['Zara Store', 'USPS Drop-off'],
    defectiveNote: 'Defective items qualify for free return shipping'
  },
  homeDepot: {
    name: 'The Home Depot',
    window: 90,
    shipping: 'Free in-store returns; mail returns available',
    refund: 'Refund to original payment method',
    conditions: ['Receipt required for full refund', 'Some items have 30-day window', 'Plants: 1-year guarantee'],
    returnUrl: 'https://www.homedepot.com/mycart/order/returns',
    icon: '🏠',
    dropoffs: ['The Home Depot Store', 'UPS Drop-off'],
    defectiveNote: 'Home Depot replaces defective items under manufacturer warranty'
  },
  sephora: {
    name: 'Sephora',
    window: 30,
    shipping: 'Free return shipping for Beauty Insiders',
    refund: 'Refund to original payment method; store credit after 30 days',
    conditions: ['New or gently used products', 'Must be purchased from Sephora'],
    returnUrl: 'https://www.sephora.com/profile/orders',
    icon: '💄',
    dropoffs: ['Sephora Store', 'UPS Drop-off'],
    defectiveNote: 'Defective products eligible for immediate replacement'
  },
  macys: {
    name: "Macy's",
    window: 30,
    shipping: 'Free return shipping; free in-store returns',
    refund: 'Refund to original payment method',
    conditions: ['Items must have tags attached', 'Last Act items: final sale', 'Furniture: fees may apply'],
    returnUrl: 'https://www.macys.com/account/returns',
    icon: '🛍️',
    dropoffs: ["Macy's Store", 'UPS Drop-off'],
    defectiveNote: 'Defective items accepted for return outside normal window'
  },
  gap: {
    name: 'Gap',
    window: 30,
    shipping: 'Free mail returns; free in-store returns',
    refund: 'Refund to original payment method',
    conditions: ['Unwashed and unworn with tags', 'Final sale items are non-returnable'],
    returnUrl: 'https://www.gap.com/profile/orders',
    icon: '👕',
    dropoffs: ['Gap Store', 'USPS Drop-off'],
    defectiveNote: 'Gap covers shipping for defective returns'
  },
  hm: {
    name: 'H&M',
    window: 30,
    shipping: '$5.99 return shipping fee; free in-store',
    refund: 'Refund to original payment method',
    conditions: ['Unworn items with tags', 'Undergarments and swimwear final sale', 'H&M Members may get extended window'],
    returnUrl: 'https://www2.hm.com/en_us/customer-service/returns.html',
    icon: '🧥',
    dropoffs: ['H&M Store', 'USPS Drop-off'],
    defectiveNote: 'Defective items qualify for free return shipping at H&M'
  },
  adidas: {
    name: 'Adidas',
    window: 30,
    shipping: 'Free return shipping',
    refund: 'Refund to original payment method',
    conditions: ['Items must be unworn and in original packaging', 'adiClub members may get extended window', 'Personalized items are final sale'],
    returnUrl: 'https://www.adidas.com/us/help-topics-returns_refunds.html',
    icon: '👟',
    dropoffs: ['Adidas Store', 'UPS Drop-off', 'USPS Drop-off'],
    defectiveNote: 'Defective items qualify for free return shipping regardless of window'
  },
  lululemon: {
    name: 'Lululemon',
    window: 30,
    shipping: 'Free return shipping',
    refund: 'Refund to original payment method',
    conditions: ['Items must be unworn with tags', 'Like New program accepts gently used for store credit'],
    returnUrl: 'https://info.lululemon.com/help/our-policies/return-policy',
    icon: '🧘',
    dropoffs: ['Lululemon Store', 'Mail Return'],
    defectiveNote: 'Lululemon quality promise covers defective items for replacement'
  },
  rei: {
    name: 'REI',
    window: 365,
    shipping: 'Free return shipping for Co-op members',
    refund: 'Refund to original payment method',
    conditions: ['Co-op members: 1-year satisfaction guarantee', 'Electronics: 90-day window', 'Items should be clean and dry'],
    returnUrl: 'https://www.rei.com/help/return-policy.html',
    icon: '🏔️',
    dropoffs: ['REI Store', 'Mail Return'],
    defectiveNote: 'REI satisfaction guarantee covers defective items with full refund'
  },
  potterybarn: {
    name: 'Pottery Barn',
    window: 30,
    shipping: 'Return shipping fee applies for mail returns',
    refund: 'Refund to original payment method',
    conditions: ['Furniture returns subject to pickup fee', 'Monogrammed items are final sale'],
    returnUrl: 'https://www.potterybarn.com/customer-service/return-policy.html',
    icon: '🏡',
    dropoffs: ['Pottery Barn Store', 'UPS Drop-off'],
    defectiveNote: 'Defective items receive free return shipping'
  },
  williamsSonoma: {
    name: 'Williams-Sonoma',
    window: 30,
    shipping: 'Return shipping fee may apply',
    refund: 'Refund to original payment method',
    conditions: ['Electrics must be unused in original packaging', 'Personalized items and perishables are final sale'],
    returnUrl: 'https://www.williams-sonoma.com/customer-service/return-policy.html',
    icon: '🍽️',
    dropoffs: ['Williams-Sonoma Store', 'UPS Drop-off'],
    defectiveNote: 'Defective items receive free return shipping'
  },
  wayfair: {
    name: 'Wayfair',
    window: 30,
    shipping: 'Free return shipping; large items get free pickup',
    refund: 'Refund to original payment method',
    conditions: ['Items must be unassembled and in original packaging', 'Clearance and open box items are final sale'],
    returnUrl: 'https://www.wayfair.com/help/article/return_policy',
    icon: '🛋️',
    dropoffs: ['Mail Return', 'Large Item Pickup'],
    defectiveNote: 'Wayfair covers return shipping and pickup for defective items'
  }
};

// Retailer name aliases for fuzzy matching
const RETAILER_ALIASES = {
  'amazon': 'amazon', 'amzn': 'amazon', 'prime': 'amazon',
  'walmart': 'walmart', 'wal-mart': 'walmart', 'wally world': 'walmart',
  'target': 'target',
  'best buy': 'bestbuy', 'bestbuy': 'bestbuy', 'best-buy': 'bestbuy',
  'apple': 'apple', 'apple store': 'apple',
  'nike': 'nike',
  'costco': 'costco',
  'nordstrom': 'nordstrom', 'nordstroms': 'nordstrom', "nordstrom's": 'nordstrom',
  'zara': 'zara',
  'home depot': 'homeDepot', 'homedepot': 'homeDepot', 'the home depot': 'homeDepot',
  'sephora': 'sephora',
  "macy's": 'macys', 'macys': 'macys', 'macy': 'macys',
  'gap': 'gap', 'the gap': 'gap',
  'h&m': 'hm', 'hm': 'hm', 'h and m': 'hm', 'h & m': 'hm',
  'adidas': 'adidas',
  'lululemon': 'lululemon', 'lulu lemon': 'lululemon', 'lulu': 'lululemon',
  'rei': 'rei',
  'pottery barn': 'potterybarn', 'potterybarn': 'potterybarn',
  'williams-sonoma': 'williamsSonoma', 'williams sonoma': 'williamsSonoma', 'williamssonoma': 'williamsSonoma',
  'wayfair': 'wayfair'
};

// Common items and their emojis
const ITEM_EMOJIS = {
  'airpods': '🎧', 'headphones': '🎧', 'earbuds': '🎧', 'earphones': '🎧', 'galaxy buds': '🎧', 'buds': '🎧',
  'iphone': '📱', 'phone': '📱', 'samsung': '📱', 'pixel': '📱', 'smartphone': '📱', 'case': '📱',
  'laptop': '💻', 'macbook': '💻', 'chromebook': '💻', 'computer': '💻', 'hub': '💻', 'usb': '💻',
  'ipad': '📱', 'tablet': '📱',
  'shoes': '👟', 'sneakers': '👟', 'boots': '👢', 'sandals': '👡', 'runners': '👟', 'air max': '👟',
  'shirt': '👕', 'tshirt': '👕', 't-shirt': '👕', 'top': '👕', 'blouse': '👚',
  'dress': '👗', 'jacket': '🧥', 'coat': '🧥', 'hoodie': '🧥', 'sweater': '🧥',
  'pants': '👖', 'jeans': '👖', 'shorts': '🩳', '501': '👖', 'leggings': '👖',
  'watch': '⌚', 'apple watch': '⌚',
  'tv': '📺', 'television': '📺', 'monitor': '🖥️',
  'camera': '📷',
  'keyboard': '⌨️', 'mouse': '🖱️',
  'book': '📚', 'books': '📚',
  'toy': '🧸', 'game': '🎮', 'controller': '🎮',
  'mattress': '🛏️', 'bed': '🛏️', 'pillow': '🛏️', 'sheets': '🛏️', 'bed sheets': '🛏️',
  'makeup': '💄', 'lipstick': '💄', 'foundation': '💄',
  'bag': '👜', 'purse': '👜', 'backpack': '🎒',
  'sunglasses': '🕶️', 'glasses': '👓',
  'tumbler': '🥤', 'stanley': '🥤', 'water bottle': '🥤',
  'pot': '🍳', 'instant pot': '🍳', 'kitchen': '🍳',
  'cable': '🔌', 'charger': '🔌', 'lightning': '🔌',
  'yoga mat': '🧘', 'mat': '🧘',
  'couch': '🛋️', 'sofa': '🛋️', 'furniture': '🛋️',
  default: '📦'
};

// ============================================================
// EXPANDED MOCK ORDER DATABASE
// ============================================================
const MOCK_ORDERS = [
  {
    retailer: 'amazon', item: 'AirPods Pro 2', price: 249.99,
    orderId: '114-1234567-1234567', emoji: '🎧',
    daysAgo: 5, category: 'audio', keywords: ['airpods', 'headphones', 'earbuds', 'audio']
  },
  {
    retailer: 'amazon', item: 'USB-C Hub', price: 34.99,
    orderId: '114-7654321-7654321', emoji: '💻',
    daysAgo: 8, category: 'electronics', keywords: ['usb', 'hub', 'adapter', 'dongle']
  },
  {
    retailer: 'walmart', item: 'Instant Pot Duo', price: 89.99,
    orderId: '200-1234567890', emoji: '🍳',
    daysAgo: 12, category: 'kitchen', keywords: ['instant pot', 'pot', 'kitchen', 'cooker', 'pressure']
  },
  {
    retailer: 'walmart', item: 'Bed Sheets (Queen)', price: 45.00,
    orderId: '200-0987654321', emoji: '🛏️',
    daysAgo: 15, category: 'home', keywords: ['sheets', 'bed', 'bedding', 'queen']
  },
  {
    retailer: 'target', item: "Levi's 501 Jeans", price: 69.50,
    orderId: 'TGT-987654321', emoji: '👖',
    daysAgo: 18, category: 'clothing', keywords: ['jeans', 'levis', "levi's", '501', 'pants', 'denim']
  },
  {
    retailer: 'target', item: 'Stanley Tumbler', price: 35.00,
    orderId: 'TGT-123456789', emoji: '🥤',
    daysAgo: 10, category: 'accessories', keywords: ['tumbler', 'stanley', 'cup', 'water bottle', 'drink']
  },
  {
    retailer: 'nike', item: 'Air Max 90', price: 130.00,
    orderId: 'NKE-5551234', emoji: '👟',
    daysAgo: 7, category: 'shoes', keywords: ['air max', 'shoes', 'sneakers', 'nike', '90']
  },
  {
    retailer: 'bestbuy', item: 'Samsung Galaxy Buds FE', price: 149.99,
    orderId: 'BBY-8675309', emoji: '🎧',
    daysAgo: 3, category: 'audio', keywords: ['galaxy buds', 'samsung', 'earbuds', 'buds', 'headphones', 'audio']
  },
  {
    retailer: 'apple', item: 'iPhone 15 Case (MagSafe)', price: 49.00,
    orderId: 'APL-2024001', emoji: '📱',
    daysAgo: 6, category: 'accessories', keywords: ['case', 'iphone', 'magsafe', 'phone case']
  },
  {
    retailer: 'nordstrom', item: 'Allbirds Tree Runners', price: 100.00,
    orderId: 'NRD-3344556', emoji: '👟',
    daysAgo: 20, category: 'shoes', keywords: ['allbirds', 'runners', 'shoes', 'sneakers', 'tree runners']
  }
];

// Return reasons
const RETURN_REASONS = [
  { id: 'changed_mind', label: 'Changed my mind', icon: '💭' },
  { id: 'defective', label: 'Item is defective', icon: '⚠️' },
  { id: 'wrong_item', label: 'Wrong item received', icon: '❌' },
  { id: 'not_as_described', label: "Doesn't match description", icon: '📝' },
  { id: 'arrived_late', label: 'Arrived too late', icon: '⏰' },
  { id: 'better_price', label: 'Better price elsewhere', icon: '💰' },
  { id: 'other', label: 'Other', icon: '📋' }
];

// ============================================================
// MOCK DATA GENERATORS
// ============================================================
function generateOrderId(retailer) {
  const r = RETAILERS[retailer];
  if (!r) return 'ORD-' + Math.random().toString(36).substr(2, 8).toUpperCase();
  switch (retailer) {
    case 'amazon': return '114-' + rand7() + '-' + rand7();
    case 'walmart': return 'WM-' + rand7();
    case 'target': return 'TGT-' + rand8();
    default: return r.name.substring(0, 3).toUpperCase() + '-' + rand7();
  }
}

function rand7() { return Math.floor(1000000 + Math.random() * 9000000).toString(); }
function rand8() { return Math.floor(10000000 + Math.random() * 90000000).toString(); }

function getRecentDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - (daysAgo || Math.floor(3 + Math.random() * 12)));
  return d;
}

function formatDate(d) {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatShortDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatMonthDay(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getTomorrowDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

function getFutureDate(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d;
}

function getItemEmoji(item) {
  if (!item) return ITEM_EMOJIS.default;
  const lower = item.toLowerCase();
  for (const [key, emoji] of Object.entries(ITEM_EMOJIS)) {
    if (key === 'default') continue;
    if (lower.includes(key)) return emoji;
  }
  return ITEM_EMOJIS.default;
}

function getDaysRemaining(retailer) {
  const r = RETAILERS[retailer];
  if (!r) return 15;
  return Math.max(1, Math.floor(r.window * 0.5 + Math.random() * r.window * 0.4));
}

function generateTrackingNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return '1Z-RTC-' + date;
}

// ============================================================
// NLU — Intent Parsing (Upgraded: 30+ consumer return intents)
// With Levenshtein fuzzy matching for retailer names
// ============================================================

// Domain-specific intent patterns — checked before generic return patterns
const DOMAIN_INTENT_PATTERNS = [
  // PRE-RETURN QUESTIONS
  { patterns: [/can i return/i, /is.*returnable/i, /eligible.*return/i, /return.*this/i], intent: 'return_eligibility' },
  { patterns: [/how long.*return/i, /return window/i, /deadline.*return/i, /when.*last day/i, /days.*left/i], intent: 'return_window' },
  { patterns: [/restocking fee/i, /fee.*return/i, /charge.*return/i, /cost.*return/i], intent: 'restocking_fee' },
  { patterns: [/original packaging/i, /need.*box/i, /without.*box/i, /lost.*packaging/i], intent: 'packaging_requirements' },
  { patterns: [/without.*receipt/i, /lost.*receipt/i, /no.*receipt/i, /proof.*purchase/i], intent: 'receipt_requirements' },
  { patterns: [/free.*return/i, /shipping.*free/i, /pay.*shipping/i, /return.*shipping.*cost/i], intent: 'shipping_cost' },
  { patterns: [/exchange/i, /swap/i, /different size/i, /different color/i], intent: 'exchange_policy' },
  { patterns: [/refund.*option/i, /how.*refund/i, /store credit/i, /gift card/i, /original.*payment/i], intent: 'refund_options' },
  { patterns: [/gift.*return/i, /return.*gift/i, /someone.*gave/i], intent: 'gift_return' },
  { patterns: [/opened/i, /used/i, /worn/i, /tried.*on/i], intent: 'open_item_return' },
  { patterns: [/can't.*return/i, /non.*returnable/i, /final.*sale/i, /not.*eligible/i], intent: 'non_returnable' },
  { patterns: [/in.*store/i, /take.*store/i, /return.*store/i, /brick.*mortar/i], intent: 'in_store_return' },
  { patterns: [/defective/i, /broken/i, /doesn't work/i, /malfunction/i, /damaged/i], intent: 'defective_item' },
  { patterns: [/after.*window/i, /past.*deadline/i, /too late/i, /expired/i], intent: 'late_return' },

  // DURING RETURN QUESTIONS
  { patterns: [/how.*start/i, /initiate.*return/i, /begin.*return/i, /first step/i], intent: 'how_to_start' },
  { patterns: [/drop.*off/i, /where.*bring/i, /nearest.*location/i, /drop.*location/i], intent: 'drop_off' },
  { patterns: [/pick.*up/i, /schedule.*pickup/i, /come.*get/i, /home.*pickup/i], intent: 'schedule_pickup' },
  { patterns: [/print.*label/i, /shipping.*label/i, /return.*label/i, /no.*printer/i, /qr.*code/i], intent: 'label_help' },
  { patterns: [/package.*how/i, /how.*pack/i, /wrap/i, /box.*it/i], intent: 'packaging_help' },
  { patterns: [/which.*carrier/i, /ups.*fedex/i, /best.*ship/i, /cheapest.*ship/i], intent: 'carrier_recommendation' },
  { patterns: [/multiple.*item/i, /several.*item/i, /return.*everything/i, /batch/i], intent: 'multi_item' },

  // POST-RETURN QUESTIONS
  { patterns: [/where.*return/i, /track.*return/i, /status.*return/i, /return.*status/i], intent: 'track_return' },
  { patterns: [/when.*refund/i, /refund.*when/i, /how long.*refund/i, /refund.*time/i], intent: 'refund_timeline' },
  { patterns: [/refund.*hasn't/i, /no.*refund/i, /missing.*refund/i, /still.*waiting/i], intent: 'refund_missing' },
  { patterns: [/wrong.*amount/i, /partial.*refund/i, /less.*expected/i], intent: 'refund_discrepancy' },
  { patterns: [/rejected/i, /denied/i, /refused/i, /not.*accepted/i], intent: 'return_rejected' },

  // GENERAL
  { patterns: [/help/i, /what.*can.*do/i, /how.*work/i, /what.*is.*returnclaw/i], intent: 'help' },
  { patterns: [/hello|hi|hey|good morning|good evening/i], intent: 'greeting' },
  { patterns: [/thank/i, /thanks/i, /appreciate/i], intent: 'thanks' },
  { patterns: [/bye|goodbye|done|that's all/i], intent: 'goodbye' },
];

function parseIntent(text) {
  let lower = text.toLowerCase().trim();

  // Fuzzy matching for common voice recognition mishearings
  lower = lower.replace(/g\s+mail/gi, 'gmail');
  lower = lower.replace(/jean\s*mail/gi, 'gmail');
  lower = lower.replace(/out\s+look/gi, 'outlook');
  lower = lower.replace(/\byou\s*tube\b/gi, ''); // ignore youtube mishearing

  // Off-topic / greeting (short messages only)
  if (/^(hi|hello|hey|sup|what's up|howdy|yo)\b/i.test(lower) && lower.length < 20) {
    return { intent: 'greeting' };
  }

  if (/^(thanks|thank you|thx)/i.test(lower) && lower.length < 30) {
    return { intent: 'thanks' };
  }

  if (/^(bye|goodbye|see ya|done|that's all)/i.test(lower)) {
    return { intent: 'goodbye' };
  }

  // Help / what can you do
  if (/what (can|do) you (do|help)/i.test(lower) || /^help$/i.test(lower) || /what.*is.*returnclaw/i.test(lower) || /how.*work/i.test(lower)) {
    return { intent: 'help' };
  }

  // Multi-item return detection
  if (/return (everything|all|both|all items|the whole order|my (whole|entire|full) order)/i.test(lower)) {
    const retailerMatch = lower.match(/from\s+(\w[\w\s&'.-]*)/i);
    const retailerKey = retailerMatch ? findRetailer(retailerMatch[1]) : null;
    return { intent: 'multi_return', retailer: retailerKey };
  }

  // Policy inquiry (not a return request)
  const policyMatch = lower.match(/(?:what(?:'s| is|s)|tell me (?:about )?|how (?:long|does)|check )(?:the )?(.+?)(?:'s|s)?\s*(?:return )?(?:policy|return policy|return window)/i);
  if (policyMatch) {
    const retailerKey = findRetailer(policyMatch[1]);
    if (retailerKey) return { intent: 'policy_inquiry', retailer: retailerKey };
  }

  // --- Domain-specific intent matching (30+ intents) ---
  // Extract retailer from the text if present (for context)
  const retailerInText = extractRetailerFromText(lower);

  for (const rule of DOMAIN_INTENT_PATTERNS) {
    for (const pattern of rule.patterns) {
      if (pattern.test(lower)) {
        // Don't match 'greeting' or 'thanks' or 'goodbye' here if already caught above
        if (['greeting', 'thanks', 'goodbye', 'help'].includes(rule.intent)) continue;
        return { intent: rule.intent, retailer: retailerInText, text: text };
      }
    }
  }

  // Return intent — multiple patterns
  const returnPatterns = [
    // "return my AirPods from Amazon"
    /(?:return|send back|bring back|exchange)\s+(?:my |the |a |an )?(.+?)(?:\s+from\s+|\s+at\s+|\s+to\s+|\s+on\s+|\s+i (?:bought|got|ordered) (?:from|at|on)\s+)(\w[\w\s&'.-]*)/i,
    // "I want to return shoes from Nike"
    /(?:i (?:want|need|would like|wanna|gotta|have) to (?:return|send back)|(?:can|could) (?:i|you) (?:return|help (?:me )?return))\s+(?:my |the |a |an )?(.+?)(?:\s+from\s+|\s+at\s+|\s+to\s+|\s+(?:i )?(?:bought|got|ordered) (?:from|at|on)\s+)(\w[\w\s&'.-]*)/i,
    // "Amazon return for AirPods"
    /(\w[\w\s&'.-]*?)\s+return\s+(?:for|on)\s+(?:my |the |a |an )?(.+)/i,
    // "return from amazon" (no item specified)
    /(?:return|send back)\s+(?:something |an item |a purchase )?(?:from|at)\s+(\w[\w\s&'.-]*)/i,
  ];

  for (let i = 0; i < returnPatterns.length; i++) {
    const m = lower.match(returnPatterns[i]);
    if (m) {
      if (i === 2) {
        const retailerKey = findRetailer(m[1]);
        if (retailerKey) {
          return { intent: 'return', retailer: retailerKey, item: cleanItem(m[2]) };
        }
      } else if (i === 3) {
        const retailerKey = findRetailer(m[1]);
        if (retailerKey) {
          return { intent: 'return', retailer: retailerKey, item: null };
        }
      } else {
        const retailerKey = findRetailer(m[2]);
        if (retailerKey) {
          return { intent: 'return', retailer: retailerKey, item: cleanItem(m[1]) };
        }
      }
    }
  }

  // Simple "return [item]" without retailer — vague item search
  const simpleReturn = lower.match(/(?:return|send back|bring back)\s+(?:my |the |a |an )?(.+)/i);
  if (simpleReturn) {
    const asRetailer = findRetailer(simpleReturn[1]);
    if (asRetailer) {
      return { intent: 'return', retailer: asRetailer, item: null };
    }
    return { intent: 'return', retailer: null, item: cleanItem(simpleReturn[1]) };
  }

  // Check if message just contains a retailer name
  const retailerOnly = findRetailer(lower);
  if (retailerOnly) {
    return { intent: 'retailer_mention', retailer: retailerOnly };
  }

  // Smarter yes/no handling — expanded affirmative recognition
  if (/^(yes|yeah|yep|sure|ok|okay|absolutely|definitely|go ahead|do it|let's do it|let's do this|please|yea|ya|yup|go for it|proceed|make it happen|affirmative|for sure|bet|sounds good|perfect|right|correct|exactly|you bet|of course|why not|alright|fine|roger)/i.test(lower)) {
    return { intent: 'yes' };
  }

  if (/^(no|nah|nope|not now|never mind|cancel|skip|i'm good|no thanks|not really|negative|pass|forget it)/i.test(lower)) {
    return { intent: 'no' };
  }

  // Zip code
  if (/^\d{5}(-\d{4})?$/.test(lower.trim())) {
    return { intent: 'zipcode', value: lower.trim() };
  }

  // Phone number
  if (/^[\d\s\-().+]{10,}$/.test(lower.trim())) {
    return { intent: 'phone', value: lower.replace(/\D/g, '') };
  }

  // Address-like pattern
  if (/^\d+\s+\w+/.test(lower) && (lower.includes('st') || lower.includes('ave') || lower.includes('blvd') || lower.includes('dr') || lower.includes('rd') || lower.includes('ln') || lower.includes('way') || lower.includes('ct') || lower.includes('street') || lower.includes('avenue'))) {
    return { intent: 'address', value: text.trim() };
  }

  // Order ID
  if (/^[a-z0-9#-]{5,}$/i.test(lower.replace(/\s/g, '')) || lower.includes('order') || lower.startsWith('#')) {
    return { intent: 'order_id', value: lower.replace(/^#/, '').trim() };
  }

  return { intent: 'unknown', text: text };
}

// Helper: extract a retailer name from arbitrary text
function extractRetailerFromText(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [alias, key] of Object.entries(RETAILER_ALIASES)) {
    if (lower.includes(alias)) return key;
  }
  for (const [key, r] of Object.entries(RETAILERS)) {
    if (lower.includes(r.name.toLowerCase())) return key;
  }
  return null;
}

function findRetailer(text) {
  if (!text) return null;
  const lower = text.toLowerCase().trim().replace(/[.,!?;]+$/, '');

  // Direct alias match
  if (RETAILER_ALIASES[lower]) return RETAILER_ALIASES[lower];

  // Substring match in aliases
  for (const [alias, key] of Object.entries(RETAILER_ALIASES)) {
    if (lower.includes(alias) || alias.includes(lower)) return key;
  }

  // Substring match in retailer names
  for (const [key, r] of Object.entries(RETAILERS)) {
    if (lower.includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(lower)) return key;
  }

  // Fuzzy matching with Levenshtein distance
  // Only for words >= 4 chars to avoid false positives
  if (lower.length >= 4) {
    let bestMatch = null;
    let bestDistance = Infinity;
    const threshold = lower.length <= 5 ? 1 : 2; // stricter for short names

    for (const [alias, key] of Object.entries(RETAILER_ALIASES)) {
      if (alias.length < 3) continue;
      const dist = levenshteinDistance(lower, alias);
      if (dist <= threshold && dist < bestDistance) {
        bestDistance = dist;
        bestMatch = key;
      }
    }

    for (const [key, r] of Object.entries(RETAILERS)) {
      const dist = levenshteinDistance(lower, r.name.toLowerCase());
      if (dist <= threshold && dist < bestDistance) {
        bestDistance = dist;
        bestMatch = key;
      }
    }

    if (bestMatch) return bestMatch;
  }

  return null;
}

function cleanItem(text) {
  if (!text) return null;
  return text.replace(/[.,!?;]+$/, '').replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
}

const KNOWN_NAMES = {
  'airpods': 'AirPods', 'airpods pro': 'AirPods Pro', 'airpods max': 'AirPods Max',
  'iphone': 'iPhone', 'ipad': 'iPad', 'macbook': 'MacBook', 'macbook pro': 'MacBook Pro',
  'macbook air': 'MacBook Air', 'imac': 'iMac', 'apple watch': 'Apple Watch',
  'playstation': 'PlayStation', 'ps5': 'PS5', 'xbox': 'Xbox',
  'nintendo switch': 'Nintendo Switch', 'gopro': 'GoPro',
  'samsung galaxy': 'Samsung Galaxy', 'google pixel': 'Google Pixel',
  "levi's": "Levi's", 'ray-ban': 'Ray-Ban', 'ray ban': 'Ray-Ban',
  't-shirt': 'T-Shirt', 'tshirt': 'T-Shirt', 'instant pot': 'Instant Pot',
  'air max': 'Air Max', 'galaxy buds': 'Galaxy Buds', 'allbirds': 'Allbirds',
  'stanley': 'Stanley'
};

function capitalizeItem(item) {
  if (!item) return 'your item';
  const lower = item.toLowerCase();
  if (KNOWN_NAMES[lower]) return KNOWN_NAMES[lower];
  for (const [key, val] of Object.entries(KNOWN_NAMES)) {
    if (lower.startsWith(key)) return val + item.slice(key.length);
  }
  return item.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Agentic Search: find matching orders by vague description
function searchOrders(query) {
  const lower = query.toLowerCase();
  const tokens = lower.split(/\s+/);

  return MOCK_ORDERS.filter(order => {
    // Check keywords
    for (const token of tokens) {
      if (token.length < 2) continue;
      if (order.keywords.some(kw => kw.includes(token) || token.includes(kw))) return true;
      if (order.item.toLowerCase().includes(token)) return true;
      if (order.category.includes(token)) return true;
    }
    return false;
  }).sort((a, b) => a.daysAgo - b.daysAgo);
}

// ============================================================
// SPEECH ENGINE
// ============================================================
class SpeechEngine {
  constructor() {
    this.synthesis = window.speechSynthesis;
    this.recognition = null;
    this.isListening = false;
    this.isSpeaking = false;
    this.voicesLoaded = false;
    this.preferredVoice = null;
    this.onResult = null;
    this.onListeningChange = null;

    if (this.synthesis) {
      this.synthesis.getVoices();
      this.synthesis.onvoiceschanged = () => this._selectVoice();
      setTimeout(() => this._selectVoice(), 200);
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.hasRecognition = !!SR;
    if (this.hasRecognition) {
      this.SpeechRecognition = SR;
    }
  }

  _selectVoice() {
    const voices = this.synthesis.getVoices();
    if (!voices.length) return;
    this.voicesLoaded = true;

    // Prefer warm, professional voices
    const preferred = [
      'Google US English', 'Samantha', 'Karen', 'Microsoft Zira',
      'Google UK English Female', 'Victoria', 'Tessa', 'Alex'
    ];

    for (const name of preferred) {
      const v = voices.find(voice => voice.name.includes(name));
      if (v) { this.preferredVoice = v; return; }
    }

    const enUS = voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female'));
    if (enUS) { this.preferredVoice = enUS; return; }

    this.preferredVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
  }

  speak(text) {
    return new Promise((resolve) => {
      if (!this.synthesis) { resolve(); return; }

      this.synthesis.cancel();

      // Add brief pauses between sentences for natural rhythm
      const spokenText = text.replace(/\.\s+/g, '. ... ').replace(/\?\s+/g, '? ... ').replace(/!\s+/g, '! ... ');
      const utterance = new SpeechSynthesisUtterance(spokenText);
      utterance.rate = 0.95;  // Slightly slower = more professional
      utterance.pitch = 1.0;
      utterance.volume = 0.9;

      if (this.preferredVoice) utterance.voice = this.preferredVoice;

      utterance.onstart = () => {
        this.isSpeaking = true;
        if (this.onSpeakingChange) this.onSpeakingChange(true);
      };

      const keepAlive = setInterval(() => {
        if (!this.synthesis.speaking) { clearInterval(keepAlive); return; }
        this.synthesis.pause();
        this.synthesis.resume();
      }, 10000);

      utterance.onend = () => {
        clearInterval(keepAlive);
        this.isSpeaking = false;
        if (this.onSpeakingChange) this.onSpeakingChange(false);
        resolve();
      };

      utterance.onerror = () => {
        clearInterval(keepAlive);
        this.isSpeaking = false;
        if (this.onSpeakingChange) this.onSpeakingChange(false);
        resolve();
      };

      this.synthesis.speak(utterance);
    });
  }

  stopSpeaking() {
    if (this.synthesis) this.synthesis.cancel();
    this.isSpeaking = false;
  }

  startListening() {
    if (!this.hasRecognition || this.isListening) return;

    this.recognition = new this.SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isListening = true;
      if (this.onListeningChange) this.onListeningChange(true);
    };

    this.recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        }
      }
      if (finalTranscript && this.onResult) {
        this.onResult(finalTranscript.trim());
      }
    };

    this.recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('Speech recognition error:', event.error);
      }
      this.isListening = false;
      if (this.onListeningChange) this.onListeningChange(false);
      // Notify the agent about speech failure for better UX
      if (this.onSpeechError && event.error !== 'no-speech' && event.error !== 'aborted') {
        this.onSpeechError(event.error);
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (this.onListeningChange) this.onListeningChange(false);
    };

    this.recognition.start();
  }

  stopListening() {
    if (this.recognition) {
      this.recognition.abort();
      this.recognition = null;
    }
    this.isListening = false;
    if (this.onListeningChange) this.onListeningChange(false);
  }
}

// ============================================================
// RETURNCLAW AGENT
// ============================================================
class ReturnClawAgent {
  constructor() {
    this.state = 'idle';
    this.context = {
      retailer: null,
      item: null,
      orderId: null,
      orderDate: null,
      price: null,
      daysRemaining: null,
      carrierChoice: null,
      emoji: '📦',
      returnReason: null,
      refundMethod: null,
      trackingNumber: null
    };

    // Persistent session memory (survives across returns in same session)
    this.session = {
      email: null,
      emailProvider: null,
      address: null,
      phone: null,
      connectedOrders: false,
      completedReturns: [],
      preferredCarrier: null,      // Remember carrier preference
      preferredRefundMethod: null  // Remember refund preference
    };

    // Live mode session ID for OAuth
    this.sessionId = null;

    // Multi-item tracking
    this.multiItems = [];

    this.speech = new SpeechEngine();
    this.chatArea = document.getElementById('chatArea');
    this.textInput = document.getElementById('textInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.orb = document.getElementById('orb');
    this.orbArea = document.getElementById('orbArea');
    this.orbLabel = document.getElementById('orbLabel');
    this.orbGlow = document.getElementById('orbGlow');
    this.orbReadyBadge = document.getElementById('orbReadyBadge');
    this.pipeline = document.getElementById('pipeline');
    this.modalOverlay = document.getElementById('modalOverlay');
    this.modalClose = document.getElementById('modalClose');
    this.howItWorksBtn = document.getElementById('howItWorksBtn');
    this.historyPanel = document.getElementById('historyPanel');
    this.historyToggleBtn = document.getElementById('historyToggleBtn');
    this.historyCloseBtn = document.getElementById('historyCloseBtn');
    this.historyList = document.getElementById('historyList');
    this.historyEmpty = document.getElementById('historyEmpty');

    this._bindEvents();
    this._setupSpeechCallbacks();
    this._setupOAuthListener();
    this._setupQuickActions();
    this._setupHistoryPanel();
  }

  _bindEvents() {
    this.orb.addEventListener('click', () => this._handleOrbClick());
    this.sendBtn.addEventListener('click', () => this._handleSend());
    this.textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._handleSend();
      }
    });
    this.howItWorksBtn.addEventListener('click', () => this.modalOverlay.classList.add('visible'));
    this.modalClose.addEventListener('click', () => this.modalOverlay.classList.remove('visible'));
    this.modalOverlay.addEventListener('click', (e) => {
      if (e.target === this.modalOverlay) this.modalOverlay.classList.remove('visible');
    });
  }

  _setupSpeechCallbacks() {
    this.speech.onResult = (text) => {
      this._handleUserInput(text);
    };

    this.speech.onListeningChange = (listening) => {
      if (listening) {
        this.orb.classList.add('listening');
        this.orb.classList.remove('speaking');
        this.orbLabel.textContent = 'Listening...';
        if (this.orbReadyBadge) this.orbReadyBadge.style.display = 'none';
      } else {
        this.orb.classList.remove('listening');
        if (!this.speech.isSpeaking) {
          this.orbLabel.textContent = 'Tap to speak';
        }
      }
    };

    this.speech.onSpeakingChange = (speaking) => {
      if (speaking) {
        this.orb.classList.add('speaking');
        this.orb.classList.remove('listening');
      } else {
        this.orb.classList.remove('speaking');
      }
    };

    // Speech recognition error handler — guide user to type instead
    this.speech.onSpeechError = (error) => {
      if (this.state !== 'idle') {
        const msg = "I didn't catch that. You can also type your question below.";
        this._addAgentMessage(msg);
        // Don't speak this — just show it in chat
      }
    };
  }

  // ============================================================
  // QUICK ACTION BUTTON HANDLERS
  // ============================================================
  _setupQuickActions() {
    const bar = document.getElementById('quickActionBar');
    if (!bar) return;
    bar.querySelectorAll('.quick-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        this._handleQuickAction(action);
      });
    });
  }

  async _handleQuickAction(action) {
    // Ensure conversation is started
    if (this.state === 'idle') {
      this.orbArea.classList.add('minimized');
      if (this.orbReadyBadge) this.orbReadyBadge.style.display = 'none';
    }

    switch (action) {
      case 'new-return': {
        this._resetContext();
        this._resetPipeline();
        this.state = 'awaiting_item';
        const msg = "Let's start a new return. What item would you like to return, and from which retailer?";
        this._addAgentMessage(msg);
        await this.speech.speak(msg);
        this._startListeningAfterDelay();
        break;
      }
      case 'track-return': {
        if (this.session.completedReturns.length > 0) {
          const last = this.session.completedReturns[this.session.completedReturns.length - 1];
          const msg = `Your most recent return: ${last.emoji || '📦'} ${last.item} from ${RETAILERS[last.retailer]?.name || 'retailer'}. Tracking: ${last.tracking}. Status: In Transit. Is there a specific return you'd like to check?`;
          this._addAgentMessage(msg);
          await this.speech.speak(msg);
        } else {
          const msg = "You don't have any returns to track yet. Would you like to start a return?";
          this._addAgentMessage(msg);
          await this.speech.speak(msg);
        }
        this.state = 'awaiting_item';
        this._startListeningAfterDelay();
        break;
      }
      case 'policy-lookup': {
        const msg = "Which retailer's return policy would you like to look up? Just say the name — for example, \"Amazon\" or \"Target\".";
        this._addAgentMessage(msg);
        await this.speech.speak(msg);
        this.state = 'awaiting_item';
        this._startListeningAfterDelay();
        break;
      }
      case 'return-history': {
        this._toggleHistoryPanel();
        break;
      }
    }
  }

  // ============================================================
  // RETURN HISTORY PANEL
  // ============================================================
  _setupHistoryPanel() {
    if (this.historyToggleBtn) {
      this.historyToggleBtn.addEventListener('click', () => this._toggleHistoryPanel());
    }
    if (this.historyCloseBtn) {
      this.historyCloseBtn.addEventListener('click', () => this._closeHistoryPanel());
    }
  }

  _toggleHistoryPanel() {
    if (this.historyPanel) {
      this.historyPanel.classList.toggle('open');
      this._updateHistoryPanel();
    }
  }

  _closeHistoryPanel() {
    if (this.historyPanel) {
      this.historyPanel.classList.remove('open');
    }
  }

  _updateHistoryPanel() {
    if (!this.historyList || !this.historyEmpty) return;

    if (this.session.completedReturns.length === 0) {
      this.historyEmpty.style.display = 'flex';
      this.historyList.innerHTML = '';
      return;
    }

    this.historyEmpty.style.display = 'none';
    this.historyList.innerHTML = this.session.completedReturns.map((ret, i) => {
      const r = RETAILERS[ret.retailer];
      return `
        <div class="history-item">
          <div class="history-item-header">
            <span class="history-item-name">${ret.emoji || '📦'} ${ret.item}</span>
            <span class="history-item-price">$${ret.price.toFixed(2)}</span>
          </div>
          <div class="history-item-meta">${r ? r.name : ret.retailer} · ${ret.tracking}</div>
          <div class="history-item-status">● In Progress</div>
        </div>
      `;
    }).join('');
  }

  // ============================================================
  // LIVE MODE: OAuth Message Listener
  // ============================================================
  _setupOAuthListener() {
    window.addEventListener('message', (event) => {
      // Only accept messages from our own origin
      if (event.origin !== window.location.origin) return;
      if (event.data && event.data.type === 'oauth_complete') {
        this._handleOAuthComplete(event.data);
      }
    });
  }

  async _handleOAuthComplete(data) {
    this.sessionId = data.sessionId;
    this.session.email = data.email;
    this.session.emailProvider = 'Gmail';
    this.session.connectedOrders = true;
    this.session.connectionType = 'oauth';

    const msg = `Connected to ${data.email}! I can now search for your orders.`;
    this._addAgentMessage(msg);
    await this.speech.speak(msg);

    await this._delay(400);

    // If user already told us what they want, search for it
    if (this.context.retailer || this.context.item) {
      const followUp = `What would you like to return? Or I can show you your recent orders.`;
      this._addAgentMessage(followUp);
      await this.speech.speak(followUp);
      this.state = 'awaiting_item';
      this._startListeningAfterDelay();
    } else {
      const followUp = `What would you like to return? Or I can show you your recent orders.`;
      this._addAgentMessage(followUp);
      await this.speech.speak(followUp);
      this.state = 'awaiting_item';
      this._startListeningAfterDelay();
    }
  }

  // Real order search via backend
  async _searchRealOrders() {
    if (!this.sessionId || !isLiveMode) return false;
    try {
      await this._showTyping(1800);
      const res = await fetch('/api/email/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          retailer: this.context.retailer || undefined
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.orders && data.orders.length > 0) {
          this._realOrders = data.orders;
          await this._showFoundOrders();
          return true;
        }
      }
    } catch (e) {
      console.error('Real order search failed:', e);
      const msg = "I had trouble searching your emails. Let's continue with what we know.";
      this._addAgentMessage(msg);
    }
    return false;
  }

  async _displayRealOrders(orders) {
    const card = document.createElement('div');
    card.className = 'action-card';
    let html = `
      <div class="card-header">
        <div class="card-status-dot green"></div>
        <div class="card-title">📧 Orders Found in Email</div>
      </div>
      <div class="card-body">
        <div class="order-select-list">
    `;
    orders.forEach((order, idx) => {
      const emoji = getItemEmoji(order.subject || '');
      const date = order.date ? formatDate(new Date(order.date)) : 'Unknown date';
      html += `
        <div class="order-select-item" data-real-idx="${idx}">
          <div class="order-thumb">${emoji}</div>
          <div class="order-info">
            <div class="order-item-name">${order.subject || 'Order'}</div>
            <div class="order-meta">${order.retailer || 'Unknown'} · ${date}${order.total ? ' · $' + order.total.toFixed(2) : ''}</div>
          </div>
          <div class="select-indicator"></div>
        </div>
      `;
    });
    html += `</div></div>`;
    card.innerHTML = html;
    this._addAgentMessageWithCard(`I found ${orders.length} order${orders.length > 1 ? 's' : ''} in your email:`, card);
    this.state = 'select_real_order';
    setTimeout(() => {
      card.querySelectorAll('.order-select-item').forEach(item => {
        item.addEventListener('click', () => {
          const idx = parseInt(item.dataset.realIdx);
          this._selectRealOrder(idx);
        });
      });
    }, 100);
  }

  async _selectRealOrder(idx) {
    const order = this._realOrders[idx];
    if (!order) return;
    this.context.item = order.subject || 'your item';
    this.context.orderId = order.orderId;
    this.context.orderDate = order.date ? new Date(order.date) : getRecentDate(7);
    this.context.price = order.total || 0;
    this.context.emoji = getItemEmoji(order.subject || '');
    if (order.retailer) {
      const rKey = findRetailer(order.retailer);
      if (rKey) this.context.retailer = rKey;
    }
    await this._showPolicyCheckForReal();
  }

  async _showPolicyCheckForReal() {
    if (!this.context.retailer) {
      const msg = `I found your order for "${this.context.item}". Which retailer is this from?`;
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this.state = 'awaiting_retailer';
      this._startListeningAfterDelay();
      return;
    }

    const r = RETAILERS[this.context.retailer];
    this._setPipelineStep('triage', 'done');
    this._setPipelineStep('policy', 'active');
    this.pipeline.classList.add('visible');

    await this._showTyping(1500);

    // Use real policy API if available
    if (isLiveMode) {
      try {
        const policyRes = await fetch(`/api/policy/${this.context.retailer}?orderDate=${this.context.orderDate?.toISOString() || ''}`);
        if (policyRes.ok) {
          const policy = await policyRes.json();
          this.context.daysRemaining = policy.daysRemaining;
          const policyCard = this._createPolicyCard(r, policy.eligible);
          const msg = policy.eligible
            ? `${r.name} has a ${r.window}-day return window. You have ${policy.daysRemaining} days left. Would you like me to start this return?`
            : `The return window for ${r.name} has expired. ${this._getCreditCardProtectionTip()}`;
          this._addAgentMessageWithCard(msg, policyCard);
          await this.speech.speak(msg);
          this._setPipelineStep('policy', 'done');
          this.state = policy.eligible ? 'confirm_return' : 'awaiting_item';
          this._startListeningAfterDelay();
          return;
        }
      } catch (e) { /* fallback to mock */ }
    }

    // Fallback to mock
    this.context.daysRemaining = getDaysRemaining(this.context.retailer);
    const policyCard = this._createPolicyCard(r, true);
    const msg = `${r.name} has a ${r.window}-day return window. You have ${this.context.daysRemaining} days left. Would you like me to start this return?`;
    this._addAgentMessageWithCard(msg, policyCard);
    await this.speech.speak(msg);
    this._setPipelineStep('policy', 'done');
    this.state = 'confirm_return';
    this._startListeningAfterDelay();
  }

  async _generateRealReturnLink() {
    if (!isLiveMode || !this.context.retailer) return null;
    try {
      const res = await fetch('/api/return/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retailer: this.context.retailer,
          orderId: this.context.orderId
        })
      });
      if (res.ok) {
        const data = await res.json();
        return data.url;
      }
    } catch (e) { /* fallback */ }
    return null;
  }

  // ============================================================
  // CREDIT CARD PROTECTION AWARENESS
  // ============================================================
  _getCreditCardProtectionTip() {
    return "However, your credit card may offer extended return protection. Visa, Mastercard, and Amex cards often extend returns by 60–90 days beyond the retailer's window. Check with your card issuer.";
  }

  _createCreditCardProtectionCard() {
    const card = document.createElement('div');
    card.className = 'cc-protection-tip';
    card.innerHTML = `
      <span class="cc-protection-tip-icon">💳</span>
      <div class="cc-protection-tip-text">
        <strong>Credit Card Return Protection</strong><br>
        Many credit cards extend return windows by 60–90 days. Visa Signature, Mastercard World, and Amex cards commonly include this benefit. Contact your card issuer to check if you're covered.
      </div>
    `;
    return card;
  }

  // ============================================================
  // ORB & CONVERSATION START
  // ============================================================
  _handleOrbClick() {
    if (this.speech.isListening) {
      this.speech.stopListening();
      return;
    }
    if (this.speech.isSpeaking) {
      this.speech.stopSpeaking();
      return;
    }

    if (this.state === 'idle') {
      this._startConversation();
    } else {
      this.speech.startListening();
    }
  }

  _handleSend() {
    const text = this.textInput.value.trim();
    if (!text) return;
    this.textInput.value = '';

    if (this.state === 'idle') {
      this._startConversation(text);
    } else {
      this._handleUserInput(text);
    }
  }

  async _startConversation(initialText) {
    this.orbArea.classList.add('minimized');
    if (this.orbReadyBadge) this.orbReadyBadge.style.display = 'none';
    this.state = 'greeting';

    // Wait for live mode detection
    await liveModeReady;

    const greeting = isLiveMode
      ? "Hi! I'm ReturnClaw, your AI returns assistant. I can help you return items from 20+ retailers. What would you like to return?"
      : "Hi! I'm ReturnClaw, your AI returns assistant. I can help you return items from 20+ retailers. What would you like to return?";

    this._addAgentMessage(greeting);
    await this.speech.speak(greeting);

    this.state = 'awaiting_item';

    if (initialText) {
      await this._delay(200);
      await this._handleUserInput(initialText);
    } else {
      await this._delay(400);
      // Proactive: offer email connect
      await this._showProactiveEmailConnect();
    }
  }

  async _showProactiveEmailConnect() {
    if (this.session.connectedOrders) return;

    const card = document.createElement('div');
    card.className = 'action-card';

    // Demo mode banner
    const demoNote = !isLiveMode ? '<div class="demo-banner">⚡ Demo Mode — Connect your email for real order data</div>' : '';

    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot blue"></div>
        <div class="card-title">📧 Connect Your Email</div>
      </div>
      <div class="card-body">
        ${demoNote}
        <p style="font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 0.75rem;">Connect your email so I can find your orders automatically. I only look at order confirmations — nothing else.</p>
        <div class="card-btn-group">
          ${isLiveMode ? `
            <button class="gmail-btn" id="gmailConnectBtn">
              <svg width="18" height="18" viewBox="0 0 24 24"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/></svg>
              Sign in with Gmail
            </button>
          ` : `
            <button class="gmail-btn" id="gmailDemoBtn">
              <svg width="18" height="18" viewBox="0 0 24 24"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" fill="#EA4335"/></svg>
              Try with Gmail (Demo)
            </button>
          `}
          <button class="card-btn outline" id="manualEntryBtn">I'll type it manually</button>
        </div>
        <div class="privacy-note">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Read-only access. Your password is never stored. You can disconnect anytime.
        </div>
      </div>
    `;

    this._addAgentMessageWithCard('', card);

    setTimeout(() => {
      if (isLiveMode) {
        document.getElementById('gmailConnectBtn')?.addEventListener('click', async () => {
          try {
            const res = await fetch('/auth/google');
            const data = await res.json();
            this.sessionId = data.sessionId;
            window.open(data.url, 'ReturnClaw OAuth', 'width=500,height=600,scrollbars=yes');
          } catch (e) {
            this._addAgentMessage("Sorry, I couldn't start the authentication process. Please try again.");
          }
        });
      } else {
        document.getElementById('gmailDemoBtn')?.addEventListener('click', () => {
          this._showDemoEmailPrompt('gmail');
        });
      }
      document.getElementById('manualEntryBtn')?.addEventListener('click', () => {
        this._startManualFlow();
      });
    }, 100);
  }

  async _startManualFlow() {
    const msg = "No problem! Just tell me what you'd like to return. For example: \"Return my AirPods from Amazon\"";
    this._addAgentMessage(msg);
    await this.speech.speak(msg);
    this.state = 'awaiting_item';
    this._startListeningAfterDelay();
  }

  _showDemoEmailPrompt(provider) {
    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot blue"></div>
        <div class="card-title">📧 Demo Email Connection</div>
      </div>
      <div class="card-body">
        <div class="demo-banner">⚡ Demo orders shown below — connect your email for real order data</div>
        <div class="card-input-row">
          <input type="email" class="card-input" id="demoEmailInput" placeholder="Enter your email address" autocomplete="email">
          <button class="card-input-btn" id="demoEmailSubmit">Connect</button>
        </div>
        <div class="gmail-sim">
          <div class="gmail-sim-logo">
            <svg width="18" height="14" viewBox="0 0 24 18"><path d="M24 4.457v12.909c0 .904-.732 1.636-1.636 1.636h-3.819V10.73L12 15.64l-6.545-4.91v8.273H1.636A1.636 1.636 0 0 1 0 17.366V4.457c0-2.023 2.309-3.178 3.927-1.964L5.455 3.64 12 8.548l6.545-4.91 1.528-1.145C21.69 1.28 24 2.434 24 4.457z" fill="#EA4335"/></svg>
            Gmail (Demo Mode)
          </div>
          <div class="gmail-sim-text">ReturnClaw would like to:</div>
          <div class="gmail-sim-perms">
            <div><span class="check">✓</span> View your email messages (read-only)</div>
            <div><span class="check">✓</span> See your email address</div>
          </div>
        </div>
      </div>
    `;

    this._addAgentMessageWithCard('Enter your email to try the demo:', card);

    setTimeout(() => {
      const submit = () => {
        const emailVal = document.getElementById('demoEmailInput')?.value.trim();
        if (emailVal && emailVal.includes('@')) {
          this.session.email = emailVal;
          this.session.emailProvider = provider === 'gmail' ? 'Gmail' : 'Outlook';
          this.session.connectedOrders = true;
          this.session.connectionType = 'demo';
          this._handleDemoConnect(emailVal);
        } else if (emailVal) {
          this._addAgentMessage("That doesn't look like a valid email. Please enter a full email address like name@gmail.com.");
        }
      };
      document.getElementById('demoEmailSubmit')?.addEventListener('click', submit);
      document.getElementById('demoEmailInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
      });
    }, 100);
  }

  async _handleDemoConnect(email) {
    await this._showTyping(1200);
    const msg = `Connected to ${email}! (Demo mode — showing sample orders.) What would you like to return?`;
    this._addAgentMessage(msg);
    await this.speech.speak(msg);
    this.state = 'awaiting_item';
    this._startListeningAfterDelay();
  }

  // ============================================================
  // MAIN INPUT HANDLER (state machine)
  // ============================================================
  async _handleUserInput(text) {
    this._addUserMessage(text);
    this.speech.stopListening();

    const intent = parseIntent(text);

    switch (this.state) {
      case 'greeting':
      case 'idle':
        await this._handleGreetingInterrupt(intent, text);
        break;
      case 'awaiting_item':
        await this._handleAwaitingItem(intent, text);
        break;
      case 'awaiting_item_clarify':
        await this._handleItemClarify(intent, text);
        break;
      case 'awaiting_retailer':
        await this._handleRetailerInput(intent, text);
        break;
      case 'confirm_return':
        await this._handleReturnConfirm(intent, text);
        break;
      case 'awaiting_email_identify':
        await this._handleEmailIdentification(intent, text);
        break;
      case 'awaiting_email_choice':
        await this._handleEmailChoice(intent, text);
        break;
      case 'select_order':
      case 'select_real_order':
        await this._handleOrderSelection(intent, text);
        break;
      case 'awaiting_order_id':
        await this._handleOrderId(intent, text);
        break;
      case 'awaiting_order_confirm':
        await this._handleOrderConfirm(intent, text);
        break;
      case 'selecting_reason':
        await this._handleReasonSelection(intent, text);
        break;
      case 'selecting_refund':
        await this._handleRefundSelection(intent, text);
        break;
      case 'awaiting_carrier_choice':
        await this._handleCarrierChoice(intent, text);
        break;
      case 'awaiting_address':
        await this._handleAddressInput(intent, text);
        break;
      case 'confirm_address':
        await this._handleAddressConfirm(intent, text);
        break;
      case 'awaiting_zip':
        await this._handleZipcode(intent, text);
        break;
      case 'awaiting_pickup_date':
        await this._handlePickupDate(intent, text);
        break;
      case 'enabling_sms':
        await this._handleSmsInput(intent, text);
        break;
      case 'tracking':
        await this._handleTracking(intent, text);
        break;
      case 'multi_item_select':
        await this._handleMultiItemInput(intent, text);
        break;
      case 'complete':
        await this._handleComplete(intent, text);
        break;
      default:
        await this._handleDefault(intent, text);
    }
  }

  // ============================================================
  // DOMAIN INTENT RESPONSES
  // ============================================================
  _getDomainIntentResponse(intent) {
    const r = intent.retailer ? RETAILERS[intent.retailer] : (this.context.retailer ? RETAILERS[this.context.retailer] : null);
    const rName = r ? r.name : 'the retailer';
    const responses = {
      return_eligibility: r ? `${r.name} has a ${r.window}-day return window. ${r.conditions[0]}. Would you like me to check a specific item?` : "I can check return eligibility once you tell me the retailer. Which store did you order from?",
      return_window: r ? `${r.name}'s return window is ${r.window} days from delivery. ${r.conditions.join('. ')}.` : "I need to know the retailer to check the return window. Which store?",
      restocking_fee: r ? `${r.name}: ${r.shipping}. Most items don't have a restocking fee unless noted in the conditions.` : "Restocking fees vary by retailer. Which store are you returning to?",
      packaging_requirements: r ? `For ${r.name}: ${r.conditions[0]}. If you've lost the original box, most retailers still accept returns — just pack it safely.` : "Most retailers prefer original packaging but will accept items packed safely. Which retailer?",
      receipt_requirements: "Most online orders have digital receipts in your email. I can find your order confirmation if you connect your email.",
      shipping_cost: r ? `${r.name}: ${r.shipping}.` : "Return shipping costs vary by retailer. Which store?",
      exchange_policy: r ? `${r.name} offers exchanges — you can select a different size or color during the return process. ${r.refund}.` : "Most retailers offer exchanges. Tell me which store and I'll get the details.",
      refund_options: r ? `${r.name}: ${r.refund}. Options typically include original payment, store credit (often faster), or exchange.` : "Refund options vary. Which retailer are you returning to?",
      gift_return: "For gift returns, you'll typically receive store credit instead of a refund to the original payment. Most retailers handle this — just select 'gift return' during the process.",
      open_item_return: r ? `${r.name}: ${r.conditions.join('. ')}. Opened items may have different conditions but are usually accepted within the return window.` : "Most retailers accept opened items within the return window. Conditions vary — which retailer?",
      non_returnable: "Some items like underwear, swimwear, personalized items, and digital downloads are typically non-returnable. Want me to check for a specific retailer?",
      in_store_return: r ? `You can return to a ${r.name} store. ${r.dropoffs.join(', ')} accept returns. Bring the item and your order confirmation.` : "Most online purchases can be returned in-store. Which retailer?",
      defective_item: r ? `For defective items at ${r.name}: ${r.defectiveNote}. I can start this return for you — just say the word.` : "Defective items usually get special treatment — free return shipping and sometimes extended windows. Which retailer?",
      late_return: r ? `${r.name}'s standard window is ${r.window} days. ${this._getCreditCardProtectionTip()}` : `If you're past the return window, your credit card may help. ${this._getCreditCardProtectionTip()}`,
      how_to_start: "Just tell me what you want to return and from which retailer. For example: 'Return my AirPods from Amazon'. I'll handle everything from there.",
      drop_off: r ? `${r.name} drop-off options: ${r.dropoffs.join(', ')}. Want me to find the nearest location?` : "Tell me the retailer and I'll find drop-off locations near you.",
      schedule_pickup: "I can schedule a carrier pickup at your address. Let's first set up your return, then we'll arrange the pickup.",
      label_help: "Most retailers provide a free prepaid shipping label. I'll generate one for you during the return process. No printer? Many drop-off locations can print it for you — or use the QR code option.",
      packaging_help: "Pack the item in its original box if possible. Use bubble wrap or packing paper for fragile items. Seal the box securely with tape. Then attach the return label on the outside.",
      carrier_recommendation: r ? `For ${r.name} returns, these carriers are available: ${r.dropoffs.join(', ')}. UPS tends to have the most locations.` : "UPS and FedEx are the most common return carriers. I'll recommend the best option once we start your return.",
      multi_item: "I can handle multi-item returns! Just say 'return everything from [retailer]' and I'll show you all your items to select from.",
      track_return: "I can track your return. If you've completed a return through me, I'll show the tracking dashboard. Otherwise, check your email for tracking info from the retailer.",
      refund_timeline: "Most refunds take 3–5 business days after the retailer receives the item. Store credit is usually instant. Some retailers take up to 10 days during busy periods.",
      refund_missing: "If your refund is delayed, here's what to do: 1) Check the tracking — make sure the item was delivered to the return center. 2) Allow 5–10 business days from delivery. 3) Contact the retailer's customer service with your return tracking number.",
      refund_discrepancy: "If you received a partial refund, it could be due to a restocking fee, return shipping deduction, or the item's condition. Check the retailer's return confirmation email for details.",
      return_rejected: "If your return was rejected, common reasons include: past the return window, item not in acceptable condition, or missing components. Contact the retailer directly — they may offer store credit as an alternative."
    };
    return responses[intent.intent] || null;
  }

  async _handleDomainQuestion(intent) {
    const response = this._getDomainIntentResponse(intent);
    if (response) {
      this._addAgentMessage(response);
      await this.speech.speak(response);

      // If late return, show credit card protection card
      if (intent.intent === 'late_return') {
        this.chatArea.lastElementChild.appendChild(this._createCreditCardProtectionCard());
        this._scrollToBottom();
      }

      this._startListeningAfterDelay();
    }
  }

  async _handleGreetingInterrupt(intent, text) {
    this.state = 'awaiting_item';
    await this._handleAwaitingItem(intent, text);
  }

  // ============================================================
  // AWAITING ITEM — Main entry point for return requests
  // ============================================================
  async _handleAwaitingItem(intent, text) {
    if (intent.intent === 'multi_return') {
      this.context.retailer = intent.retailer;
      await this._showMultiItemSelect();
      return;
    }

    if (intent.intent === 'return' && intent.retailer) {
      this.context.retailer = intent.retailer;
      this.context.item = intent.item ? capitalizeItem(intent.item) : null;
      this.context.emoji = getItemEmoji(intent.item);

      if (!this.context.item) {
        await this._showPolicyCheck();
        return;
      }

      // Proactive: Ask about order date for return window check
      const r = RETAILERS[this.context.retailer];
      if (r && r.window <= 30) {
        const msg = `Got it — returning ${this.context.emoji} ${this.context.item} from ${r.name}. Do you know approximately when you ordered it? This helps me check if it's still within the ${r.window}-day return window.`;
        this._addAgentMessage(msg);
        await this.speech.speak(msg);
        this.state = 'confirm_return';
      } else {
        await this._showPolicyCheck();
      }
      return;
    }

    if (intent.intent === 'return' && intent.item && !intent.retailer) {
      this.context.item = capitalizeItem(intent.item);
      this.context.emoji = getItemEmoji(intent.item);
      const matches = searchOrders(intent.item);
      if (matches.length > 0) {
        await this._showAgenticSearch(matches, intent.item);
      } else {
        const msg = `I'll help you return ${this.context.emoji} ${this.context.item}. Which retailer did you buy it from?`;
        this._addAgentMessage(msg);
        await this.speech.speak(msg);
        this.state = 'awaiting_retailer';
      }
      this._startListeningAfterDelay();
      return;
    }

    if (intent.intent === 'policy_inquiry' && intent.retailer) {
      await this._showPolicyOnly(intent.retailer);
      return;
    }

    if (intent.intent === 'retailer_mention' && intent.retailer) {
      // Contextual memory: if user says "actually, it was from Target not Amazon"
      if (this.context.retailer && /actually|no wait|i meant|not .+|switch|change/i.test(text.toLowerCase())) {
        const oldRetailer = RETAILERS[this.context.retailer]?.name || this.context.retailer;
        this.context.retailer = intent.retailer;
        const r = RETAILERS[intent.retailer];
        const msg = `No problem — switching from ${oldRetailer} to ${r.name}. ${this.context.item ? `Let me check ${r.name}'s return policy for your ${this.context.item}.` : `What item would you like to return from ${r.name}?`}`;
        this._addAgentMessage(msg);
        await this.speech.speak(msg);
        if (this.context.item) {
          await this._delay(300);
          await this._showPolicyCheck();
        } else {
          this.state = 'awaiting_item_clarify';
          this._startListeningAfterDelay();
        }
        return;
      }

      this.context.retailer = intent.retailer;
      const r = RETAILERS[intent.retailer];
      const msg = `I can help with a ${r.name} return. What item would you like to return?`;
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this.state = 'awaiting_item_clarify';
      this._startListeningAfterDelay();
      return;
    }

    // Domain intents
    if (this._getDomainIntentResponse(intent)) {
      await this._handleDomainQuestion(intent);
      return;
    }

    if (intent.intent === 'greeting') {
      const msg = "Hey! Tell me what you'd like to return, or ask about a return policy. For example: 'Return my AirPods from Amazon'.";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
      return;
    }

    if (intent.intent === 'thanks') {
      const msg = "You're welcome! What would you like to return?";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
      return;
    }

    if (intent.intent === 'goodbye') {
      const msg = "See you next time! Come back whenever you need to make a return.";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      return;
    }

    if (intent.intent === 'help') {
      const msg = "I'm ReturnClaw — I help you return items from 20+ retailers. Just tell me what you want to return and from where. I'll check the policy, generate a shipping label, find drop-off locations, and track your refund. Try saying 'Return my AirPods from Amazon'.";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
      return;
    }

    // Fallback
    const msg = "I'm here to help with returns! Tell me what you'd like to return and from which retailer. For example: \"Return my headphones from Amazon\".";
    this._addAgentMessage(msg);
    await this.speech.speak(msg);
    this._startListeningAfterDelay();
  }

  async _handleItemClarify(intent, text) {
    if (intent.intent === 'return' && intent.item) {
      this.context.item = capitalizeItem(intent.item);
      this.context.emoji = getItemEmoji(intent.item);
      if (intent.retailer) this.context.retailer = intent.retailer;
      await this._showPolicyCheck();
    } else if (intent.intent !== 'yes' && intent.intent !== 'no' && text.length > 1) {
      this.context.item = capitalizeItem(text);
      this.context.emoji = getItemEmoji(text);
      await this._showPolicyCheck();
    } else {
      const msg = "What item would you like to return?";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    }
  }

  async _handleRetailerInput(intent, text) {
    const retailerKey = intent.retailer || findRetailer(text);
    if (retailerKey) {
      // Contextual memory: switching retailers gracefully
      if (this.context.retailer && retailerKey !== this.context.retailer) {
        const oldName = RETAILERS[this.context.retailer]?.name || '';
        if (oldName) {
          const msg = `Switching from ${oldName} to ${RETAILERS[retailerKey].name}. Let me check their policy.`;
          this._addAgentMessage(msg);
        }
      }
      this.context.retailer = retailerKey;
      await this._showPolicyCheck();
    } else {
      const msg = "I didn't recognize that retailer. Try Amazon, Walmart, Target, Nike, Apple, or another major retailer.";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    }
  }

  // ============================================================
  // POLICY CHECK
  // ============================================================
  async _showPolicyCheck() {
    const r = RETAILERS[this.context.retailer];
    if (!r) return;

    this._setPipelineStep('triage', 'done');
    this._setPipelineStep('policy', 'active');
    this.pipeline.classList.add('visible');

    await this._showTyping(1200);

    this.context.daysRemaining = getDaysRemaining(this.context.retailer);
    const policyCard = this._createPolicyCard(r, true);

    let msg;
    if (this.context.item) {
      msg = `${r.name} has a ${r.window}-day return window. ${r.shipping}. You have about ${this.context.daysRemaining} days left. Would you like me to start the return for your ${this.context.item}?`;
    } else {
      msg = `${r.name} has a ${r.window}-day return window. ${r.shipping}. What item would you like to return?`;
    }

    this._addAgentMessageWithCard(msg, policyCard);
    await this.speech.speak(msg);
    this._setPipelineStep('policy', 'done');

    if (this.context.item) {
      this.state = 'confirm_return';
    } else {
      this.state = 'awaiting_item_clarify';
    }
    this._startListeningAfterDelay();
  }

  async _showPolicyOnly(retailerKey) {
    const r = RETAILERS[retailerKey];
    if (!r) {
      const msg = "I don't have policy data for that retailer yet. Try Amazon, Walmart, Target, Nike, or another major retailer.";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      return;
    }
    const policyCard = this._createPolicyCard(r, true);
    const msg = `${r.name}: ${r.window}-day return window. ${r.shipping}. ${r.conditions.join('. ')}. Would you like to start a return?`;
    this._addAgentMessageWithCard(msg, policyCard);
    await this.speech.speak(msg);
    this.state = 'awaiting_item';
    this._startListeningAfterDelay();
  }

  _createPolicyCard(retailer, eligible) {
    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot ${eligible ? 'green' : 'red'}"></div>
        <div class="card-title">${retailer.icon} ${retailer.name} Return Policy</div>
      </div>
      <div class="card-body">
        <div class="card-row"><span class="card-row-label">Return Window</span><span class="card-row-value">${retailer.window > 0 ? retailer.window + ' days' : 'Flexible'}</span></div>
        <div class="card-row"><span class="card-row-label">Free Returns</span><span class="card-row-value">${retailer.shipping}</span></div>
        <div class="card-row"><span class="card-row-label">Refund</span><span class="card-row-value">${retailer.refund}</span></div>
        ${this.context.daysRemaining ? `<div class="card-row"><span class="card-row-label">Days Left</span><span class="card-row-value" style="color: ${this.context.daysRemaining > 7 ? 'var(--accent)' : 'var(--red)'}">${this.context.daysRemaining} days</span></div>` : ''}
        <div class="card-divider"></div>
        <div class="card-conditions">
          <div class="card-conditions-title">Conditions</div>
          <ul>
            ${retailer.conditions.map(c => `<li>${c}</li>`).join('')}
          </ul>
        </div>
      </div>
    `;
    return card;
  }

  // ============================================================
  // AGENTIC ORDER SEARCH (when user says "return my shoes" without retailer)
  // ============================================================
  async _showAgenticSearch(matches, searchTerm) {
    await this._showTyping(800);

    // In demo mode, show banner
    const demoNote = !isLiveMode && !this.session.connectedOrders ? '<div class="demo-banner">⚡ Demo orders shown — connect your email for real order data</div>' : '';

    const card = document.createElement('div');
    card.className = 'action-card';
    let html = `
      <div class="card-header">
        <div class="card-status-dot green"></div>
        <div class="card-title">🔍 I found matching orders</div>
      </div>
      <div class="card-body">
        ${demoNote}
        <div class="order-select-list">
    `;
    matches.forEach((order, idx) => {
      const r = RETAILERS[order.retailer];
      const dateStr = formatDate(getRecentDate(order.daysAgo));
      html += `
        <div class="order-select-item" data-idx="${idx}">
          <div class="order-thumb">${order.emoji}</div>
          <div class="order-info">
            <div class="order-item-name">${order.item}</div>
            <div class="order-meta">${r.name} · $${order.price.toFixed(2)} · ${dateStr}</div>
          </div>
          <div class="select-indicator"></div>
        </div>
      `;
    });
    html += `</div></div>`;
    card.innerHTML = html;

    const msg = `I found ${matches.length} recent order${matches.length > 1 ? 's' : ''} matching "${searchTerm}". Which one?`;
    this._addAgentMessageWithCard(msg, card);
    await this.speech.speak(msg);

    this._searchMatches = matches;
    this.state = 'select_order';

    setTimeout(() => {
      card.querySelectorAll('.order-select-item').forEach(item => {
        item.addEventListener('click', () => {
          const idx = parseInt(item.dataset.idx);
          this._selectSearchMatch(idx);
        });
      });
    }, 100);
  }

  async _selectSearchMatch(idx) {
    const match = this._searchMatches[idx];
    if (!match) return;
    this.context.retailer = match.retailer;
    this.context.item = match.item;
    this.context.emoji = match.emoji;
    this.context.orderId = match.orderId;
    this.context.price = match.price;
    this.context.orderDate = getRecentDate(match.daysAgo);
    await this._showPolicyCheck();
  }

  async _showFoundOrders() {
    if (this._realOrders && this._realOrders.length > 0) {
      await this._displayRealOrders(this._realOrders);
    }
  }

  // ============================================================
  // RETURN CONFIRM
  // ============================================================
  async _handleReturnConfirm(intent, text) {
    if (intent.intent === 'yes' || /yes|yeah|sure|ok|go|start|do it|let's|please|go for it|proceed|make it happen|sounds good|perfect|let's do this|you bet|alright/i.test(text.toLowerCase())) {
      await this._showReasonSelector();
    } else if (intent.intent === 'no') {
      const msg = "No problem! Is there anything else I can help you with?";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this.state = 'awaiting_item';
      this._resetContext();
      this._startListeningAfterDelay();
    } else {
      // Could be a date or additional info
      const msg = "Would you like me to start the return process? Just say yes or no.";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    }
  }

  // ---- Return Reason Selection ----
  async _showReasonSelector() {
    const msg = "What's the reason for the return? This helps me find the best option for you.";

    const card = document.createElement('div');
    card.className = 'action-card';
    let html = `
      <div class="card-header">
        <div class="card-status-dot blue"></div>
        <div class="card-title">Why are you returning?</div>
      </div>
      <div class="reason-grid">
    `;
    RETURN_REASONS.forEach(reason => {
      html += `<button class="reason-btn" data-reason="${reason.id}" aria-label="Return reason: ${reason.label}">
        <span class="reason-icon">${reason.icon}</span>
        ${reason.label}
      </button>`;
    });
    html += '</div>';
    card.innerHTML = html;

    this._addAgentMessageWithCard(msg, card);
    await this.speech.speak(msg);
    this.state = 'selecting_reason';

    this._setPipelineStep('execution', 'active');

    setTimeout(() => {
      card.querySelectorAll('.reason-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const reasonId = btn.dataset.reason;
          const reason = RETURN_REASONS.find(r => r.id === reasonId);
          if (reason) {
            btn.classList.add('selected');
            this.context.returnReason = reason;
            this._handleReasonSelected(reason);
          }
        });
      });
    }, 100);
  }

  async _handleReasonSelected(reason) {
    await this._delay(200);
    await this._showRefundOptions(reason);
  }

  async _handleReasonSelection(intent, text) {
    // Try to match text to a reason
    const lower = text.toLowerCase();
    const match = RETURN_REASONS.find(r =>
      lower.includes(r.label.toLowerCase()) ||
      lower.includes(r.id.replace(/_/g, ' '))
    );
    if (match) {
      this.context.returnReason = match;
      await this._showRefundOptions(match);
    } else if (/defective|broken|doesn't work/i.test(lower)) {
      this.context.returnReason = RETURN_REASONS.find(r => r.id === 'defective');
      await this._showRefundOptions(this.context.returnReason);
    } else if (/changed.*mind|don't want/i.test(lower)) {
      this.context.returnReason = RETURN_REASONS.find(r => r.id === 'changed_mind');
      await this._showRefundOptions(this.context.returnReason);
    } else if (/wrong/i.test(lower)) {
      this.context.returnReason = RETURN_REASONS.find(r => r.id === 'wrong_item');
      await this._showRefundOptions(this.context.returnReason);
    } else {
      const msg = "Please select a reason from the options above, or describe why you're returning the item.";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    }
  }

  // ---- Refund Options ----
  async _showRefundOptions(reason) {
    const r = RETAILERS[this.context.retailer];

    const msg = `Got it — "${reason.label}". How would you like your refund?`;

    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot blue"></div>
        <div class="card-title">💰 Refund Method</div>
      </div>
      <div class="card-body">
        <div class="refund-option" data-refund="original" role="button" tabindex="0" aria-label="Refund to original payment method">
          <div class="refund-option-title"><span>Original Payment</span><span>💳</span></div>
          <div class="refund-option-desc">Refund to the card or method you used to pay</div>
          <div class="refund-option-time">3–5 business days</div>
        </div>
        <div class="refund-option" data-refund="store_credit" role="button" tabindex="0" aria-label="Refund as store credit">
          <div class="refund-option-title"><span>${r.name} Store Credit</span><span>🏷️</span></div>
          <div class="refund-option-desc">Instant credit to your ${r.name} account</div>
          <div class="refund-option-time">Instant</div>
        </div>
        <div class="refund-option" data-refund="exchange" role="button" tabindex="0" aria-label="Exchange for a different item">
          <div class="refund-option-title"><span>Exchange</span><span>🔄</span></div>
          <div class="refund-option-desc">Get a different size, color, or replacement</div>
          <div class="refund-option-time">Ships when item is received</div>
        </div>
      </div>
    `;

    this._addAgentMessageWithCard(msg, card);
    await this.speech.speak(msg);
    this.state = 'selecting_refund';

    setTimeout(() => {
      card.querySelectorAll('.refund-option').forEach(opt => {
        opt.addEventListener('click', () => {
          this.context.refundMethod = opt.dataset.refund;
          this.session.preferredRefundMethod = opt.dataset.refund;
          this._handleRefundSelected();
        });
      });
    }, 100);
  }

  async _handleRefundSelected() {
    await this._delay(200);
    // Set up order details if not already set
    if (!this.context.orderId) {
      this.context.orderId = generateOrderId(this.context.retailer);
    }
    if (!this.context.price) {
      const match = MOCK_ORDERS.find(o => o.retailer === this.context.retailer);
      this.context.price = match ? match.price : 49.99;
    }
    if (!this.context.orderDate) {
      this.context.orderDate = getRecentDate();
    }
    await this._showReturnLink();
  }

  async _handleRefundSelection(intent, text) {
    const lower = text.toLowerCase();
    if (/original|card|payment|credit card|debit/i.test(lower)) {
      this.context.refundMethod = 'original';
      this.session.preferredRefundMethod = 'original';
      await this._handleRefundSelected();
    } else if (/store.*credit|credit.*store|instant/i.test(lower)) {
      this.context.refundMethod = 'store_credit';
      this.session.preferredRefundMethod = 'store_credit';
      await this._handleRefundSelected();
    } else if (/exchange|swap|replace/i.test(lower)) {
      this.context.refundMethod = 'exchange';
      this.session.preferredRefundMethod = 'exchange';
      await this._handleRefundSelected();
    } else {
      const msg = "Please select a refund method: original payment, store credit, or exchange.";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    }
  }

  // ---- Return Link & Shipping ----
  async _showReturnLink() {
    await this._showTyping(1500);

    const r = RETAILERS[this.context.retailer];
    const returnUrl = await this._generateRealReturnLink() || r.returnUrl;

    this._setPipelineStep('execution', 'done');

    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot green"></div>
        <div class="card-title">📋 Return Initiated</div>
      </div>
      <div class="card-body">
        <div class="order-detail">
          <div class="order-thumb">${this.context.emoji}</div>
          <div class="order-info">
            <div class="order-item-name">${this.context.item || 'Your Item'}</div>
            <div class="order-meta">${r.name} · Order #${this.context.orderId} · $${this.context.price.toFixed(2)}</div>
          </div>
        </div>
        <div class="card-divider"></div>
        <ol class="steps-list">
          ${r.conditions ? `<li><span class="step-num">1</span> Verify: ${r.conditions[0]}</li>` : ''}
          <li><span class="step-num">2</span> Click the return link below</li>
          <li><span class="step-num">3</span> Select return reason and refund method</li>
          <li><span class="step-num">4</span> Print or save your shipping label</li>
        </ol>
        <div class="card-divider"></div>
        <a href="${returnUrl}" target="_blank" rel="noopener noreferrer" class="card-btn primary" style="text-decoration: none;">
          Open ${r.name} Returns →
        </a>
      </div>
    `;

    const msg = `Your return is set up. Click the link to complete it on ${r.name}'s website. Now, how would you like to ship the item back?`;
    this._addAgentMessageWithCard(msg, card);
    await this.speech.speak(msg);

    await this._delay(400);
    await this._showCarrierOptions();
  }

  // ---- Carrier Options ----
  async _showCarrierOptions() {
    this._setPipelineStep('carrier', 'active');

    const r = RETAILERS[this.context.retailer];
    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot blue"></div>
        <div class="card-title">📦 Shipping Method</div>
      </div>
      <div class="card-body">
        <div class="card-btn-group">
          <button class="card-btn secondary" id="carrierPickup" aria-label="Schedule a carrier pickup">
            🚚 Schedule Pickup (Free)
          </button>
          <button class="card-btn secondary" id="carrierDropoff" aria-label="Find a drop-off location">
            📍 Drop-off Location
          </button>
          <button class="card-btn outline" id="carrierSelf" aria-label="Ship it yourself">
            ✉️ I'll ship it myself
          </button>
        </div>
        <div class="card-hint">
          Available drop-offs: ${r.dropoffs.join(', ')}
        </div>
      </div>
    `;

    this._addAgentMessageWithCard("How would you like to ship the item back?", card);
    this.state = 'awaiting_carrier_choice';

    setTimeout(() => {
      document.getElementById('carrierPickup')?.addEventListener('click', () => {
        this.context.carrierChoice = 'pickup';
        this.session.preferredCarrier = 'pickup';
        this._askForAddress();
      });
      document.getElementById('carrierDropoff')?.addEventListener('click', () => {
        this.context.carrierChoice = 'dropoff';
        this.session.preferredCarrier = 'dropoff';
        this._askForZip();
      });
      document.getElementById('carrierSelf')?.addEventListener('click', () => {
        this.context.carrierChoice = 'self';
        this._showSelfShipInfo();
      });
    }, 100);
  }

  async _handleCarrierChoice(intent, text) {
    const lower = text.toLowerCase();
    if (/pickup|pick up|come get|schedule/i.test(lower) || intent.intent === 'schedule_pickup') {
      this.context.carrierChoice = 'pickup';
      this.session.preferredCarrier = 'pickup';
      await this._askForAddress();
    } else if (/drop.*off|drop off|bring|location|nearest/i.test(lower) || intent.intent === 'drop_off') {
      this.context.carrierChoice = 'dropoff';
      this.session.preferredCarrier = 'dropoff';
      await this._askForZip();
    } else if (/self|myself|own|mail/i.test(lower)) {
      this.context.carrierChoice = 'self';
      await this._showSelfShipInfo();
    } else {
      const msg = "Would you like to schedule a pickup, find a drop-off location, or ship it yourself?";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    }
  }

  async _showSelfShipInfo() {
    this.context.trackingNumber = generateTrackingNumber();
    const r = RETAILERS[this.context.retailer];

    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot green"></div>
        <div class="card-title">✉️ Self-Ship Instructions</div>
      </div>
      <div class="card-body">
        <ol class="steps-list">
          <li><span class="step-num">1</span> Pack the item securely in its original packaging</li>
          <li><span class="step-num">2</span> Print and attach the return label</li>
          <li><span class="step-num">3</span> Drop off at any ${r.dropoffs[0] || 'carrier'} location</li>
          <li><span class="step-num">4</span> Keep your receipt as proof of shipment</li>
        </ol>
      </div>
    `;

    const msg = "Pack the item securely, attach the return label, and drop it off at any carrier location. Keep your receipt as proof of shipment.";
    this._addAgentMessageWithCard(msg, card);
    await this.speech.speak(msg);

    this._setPipelineStep('carrier', 'done');
    await this._delay(500);
    await this._offerSmsTracking('self');
  }

  // ---- Address Collection ----
  async _askForAddress() {
    if (this.session.address) {
      const addr = this.session.address;
      const msg = `I have your address on file: ${addr.street}, ${addr.city}, ${addr.state} ${addr.zip}. Should I use this for the pickup?`;
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this.state = 'confirm_address';
      this._startListeningAfterDelay();
      return;
    }

    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot blue"></div>
        <div class="card-title">📍 Pickup Address</div>
      </div>
      <div class="card-body">
        <div class="address-form">
          <div class="address-row">
            <input type="text" class="card-input" id="addrStreet" placeholder="Street address" autocomplete="street-address" aria-label="Street address">
          </div>
          <div class="address-row">
            <input type="text" class="card-input" id="addrCity" placeholder="City" autocomplete="address-level2" aria-label="City">
            <input type="text" class="card-input sm" id="addrState" placeholder="State" maxlength="2" autocomplete="address-level1" aria-label="State">
            <input type="text" class="card-input md" id="addrZip" placeholder="ZIP" maxlength="10" autocomplete="postal-code" aria-label="ZIP code">
          </div>
          <button class="card-btn primary" id="addrSubmit">Use This Address</button>
        </div>
      </div>
    `;

    this._addAgentMessageWithCard("What's the pickup address?", card);
    await this.speech.speak("What's the pickup address?");
    this.state = 'awaiting_address';

    setTimeout(() => {
      document.getElementById('addrSubmit')?.addEventListener('click', () => {
        const street = document.getElementById('addrStreet')?.value.trim();
        const city = document.getElementById('addrCity')?.value.trim();
        const state = document.getElementById('addrState')?.value.trim();
        const zip = document.getElementById('addrZip')?.value.trim();
        if (street && city && state && zip) {
          this.session.address = { street, city, state, zip };
          this._schedulePickup();
        } else {
          this._addAgentMessage("Please fill in all address fields.");
        }
      });
    }, 100);
  }

  async _handleAddressInput(intent, text) {
    if (intent.intent === 'address') {
      // Try to parse the address
      this.session.address = { street: intent.value, city: '', state: '', zip: '' };
      const msg = `I got "${intent.value}". Can you also give me the city, state, and ZIP code?`;
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    } else if (intent.intent === 'zipcode') {
      this.session.address = this.session.address || { street: '', city: '', state: '', zip: '' };
      this.session.address.zip = intent.value;
      await this._schedulePickup();
    } else {
      const msg = "Please enter your full pickup address using the form above.";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    }
  }

  async _handleAddressConfirm(intent, text) {
    if (intent.intent === 'yes' || /yes|yeah|sure|ok|correct|right|that's right|sounds good/i.test(text.toLowerCase())) {
      await this._schedulePickup();
    } else {
      await this._askForAddress();
    }
  }

  async _schedulePickup() {
    const tomorrow = getTomorrowDate();
    const msg = `Would ${formatShortDate(tomorrow)} between 12:00 PM and 4:00 PM work for the pickup?`;
    this._addAgentMessage(msg);
    await this.speech.speak(msg);
    this.state = 'awaiting_pickup_date';
    this._startListeningAfterDelay();
  }

  async _askForZip() {
    if (this.session.address?.zip) {
      await this._showDropoffLocations(this.session.address.zip);
      return;
    }

    const msg = "What's your ZIP code? I'll find the nearest drop-off locations.";
    this._addAgentMessage(msg);
    await this.speech.speak(msg);
    this.state = 'awaiting_zip';
    this._startListeningAfterDelay();
  }

  async _handleZipcode(intent, text) {
    const zipMatch = text.match(/\d{5}/);
    if (zipMatch) {
      const zip = zipMatch[0];
      this.session.address = this.session.address || {};
      this.session.address.zip = zip;
      await this._showDropoffLocations(zip);
    } else {
      const msg = "Please enter a 5-digit ZIP code so I can find locations near you.";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    }
  }

  async _handleOrderSelection(intent, text) {
    const numMatch = text.match(/(\d+)/);
    if (numMatch) {
      const idx = parseInt(numMatch[1]) - 1;
      if (this.state === 'select_real_order' && this._realOrders && this._realOrders[idx]) {
        await this._selectRealOrder(idx);
        return;
      }
      if (this._searchMatches && this._searchMatches[idx]) {
        await this._selectSearchMatch(idx);
        return;
      }
    }
    if (intent.intent === 'yes' || /first|top|that one/i.test(text.toLowerCase())) {
      if (this.state === 'select_real_order' && this._realOrders?.length > 0) {
        await this._selectRealOrder(0);
      } else if (this._searchMatches?.length > 0) {
        await this._selectSearchMatch(0);
      }
    } else {
      const msg = "Please select one of the orders above by clicking on it.";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
    }
  }

  async _handleOrderId(intent, text) {
    if (intent.intent === 'order_id' || text.trim().length >= 5) {
      this.context.orderId = text.trim();
      const msg = `Got it — order ${this.context.orderId}. Let me look that up.`;
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this.state = 'confirm_return';
      await this._delay(300);
      await this._showPolicyCheck();
    } else {
      const msg = "Please enter your order ID. It's usually in your confirmation email — looks like 114-1234567-1234567 for Amazon.";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    }
  }

  async _handleOrderConfirm(intent, text) {
    await this._handleReturnConfirm(intent, text);
  }

  async _handleEmailIdentification(intent, text) {
    const lower = text.toLowerCase();
    if (/gmail/i.test(lower)) {
      this._showDemoEmailPrompt('gmail');
    } else if (/outlook|hotmail|live/i.test(lower)) {
      this._showDemoEmailPrompt('outlook');
    } else if (text.includes('@')) {
      this.session.email = text.trim();
      this.session.connectedOrders = true;
      this.session.connectionType = 'demo';
      await this._handleDemoConnect(text.trim());
    } else if (/manual|type|enter|skip/i.test(lower)) {
      await this._startManualFlow();
    } else {
      const msg = "Which email provider do you use? Gmail, Outlook, or another? You can also type 'skip' to enter details manually.";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    }
  }

  async _handleEmailChoice(intent, text) {
    await this._handleEmailIdentification(intent, text);
  }

  async _showDropoffLocations(zip) {
    await this._showTyping(1200);

    const r = RETAILERS[this.context.retailer];
    const locations = [
      {
        name: 'The UPS Store',
        distance: '0.3 mi',
        address: `123 Main St, ${zip}`,
        hours: 'Mon–Fri 8am–7pm, Sat 9am–5pm',
        mapsQuery: `The+UPS+Store+${zip}`
      },
      {
        name: r.dropoffs.includes('Whole Foods') ? 'Whole Foods (Amazon Returns)' :
              r.dropoffs.includes("Kohl's") ? "Kohl's (Amazon Returns)" :
              r.name + ' Store',
        distance: '0.8 mi',
        address: `456 Market St, ${zip}`,
        hours: 'Daily 8am–10pm',
        mapsQuery: `${r.dropoffs[0] || 'UPS'}+${zip}`
      },
      {
        name: r.dropoffs.length > 2 ? r.dropoffs[2] + ' (Amazon Returns)' : 'FedEx Office',
        distance: '1.2 mi',
        address: `789 Colorado Blvd, ${zip}`,
        hours: 'Mon–Sat 9am–9pm, Sun 10am–7pm',
        mapsQuery: `FedEx+Office+${zip}`
      }
    ];

    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot green"></div>
        <div class="card-title">Nearby Drop-off Locations</div>
      </div>
      <div class="card-body">
        ${locations.map((loc, i) => `
          <div class="location-item">
            <div class="location-name">
              <span>${i + 1}. ${loc.name}</span>
              <span class="location-distance">${loc.distance}</span>
            </div>
            <div class="location-address">${loc.address}</div>
            <div class="location-hours">${loc.hours}</div>
            <a href="https://www.google.com/maps/search/${loc.mapsQuery}" target="_blank" rel="noopener noreferrer" class="location-link">
              Get Directions →
            </a>
          </div>
        `).join('')}
      </div>
    `;

    const msg = `I found 3 drop-off locations near ${zip}. The closest is The UPS Store, just 0.3 miles away.`;
    this._addAgentMessageWithCard(msg, card);
    await this.speech.speak(msg);

    this._setPipelineStep('carrier', 'done');
    await this._delay(500);
    await this._offerSmsTracking('dropoff');
  }

  async _handlePickupDate(intent, text) {
    if (intent.intent === 'yes' || /yes|yeah|sure|ok|tomorrow|works|sounds good|perfect/i.test(text.toLowerCase())) {
      await this._showPickupConfirmation();
    } else if (intent.intent === 'no') {
      const msg = "No problem — would you prefer to find a drop-off location instead?";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this.state = 'awaiting_carrier_choice';
      this._startListeningAfterDelay();
    } else {
      await this._showPickupConfirmation();
    }
  }

  async _showPickupConfirmation() {
    await this._showTyping(1500);

    const tomorrow = getTomorrowDate();
    this.context.trackingNumber = generateTrackingNumber();
    const addr = this.session.address;
    const addrStr = addr ? `${addr.street}, ${addr.city}, ${addr.state} ${addr.zip}` : 'Your address';

    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot green"></div>
        <div class="card-title">Pickup Scheduled</div>
      </div>
      <div class="card-body">
        <div class="pickup-detail">
          <div class="pickup-line"><strong>UPS Pickup</strong></div>
          <div class="pickup-line">${formatShortDate(tomorrow)}</div>
          <div class="pickup-line">12:00 PM – 4:00 PM</div>
          <div class="pickup-line" style="color: var(--text-muted)">Address: ${addrStr}</div>
          <div class="pickup-line" style="color: var(--text-muted)">Confirmation: ${this.context.trackingNumber}</div>
        </div>
        <div class="card-divider"></div>
        <div class="card-conditions">
          <div class="card-conditions-title">Preparation</div>
          <ul>
            <li>Pack item securely</li>
            <li>Attach return label</li>
            <li>Leave package at door by noon</li>
          </ul>
        </div>
      </div>
    `;

    const msg = `Your UPS pickup is scheduled for ${formatShortDate(tomorrow)} between 12 and 4 PM. Just pack the item, attach the label, and leave it at your door.`;
    this._addAgentMessageWithCard(msg, card);
    await this.speech.speak(msg);

    this._setPipelineStep('carrier', 'done');
    await this._delay(500);
    await this._offerSmsTracking('pickup');
  }

  // ---- SMS Tracking ----
  async _offerSmsTracking(shippingMethod) {
    // If we already have a phone, skip the ask
    if (this.session.phone) {
      await this._showSmsEnabled(shippingMethod);
      return;
    }

    const msg = "Would you like SMS updates on your return? I'll text you when it's picked up, in transit, and when your refund is processed.";

    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot blue"></div>
        <div class="card-title">📱 SMS Return Tracking</div>
      </div>
      <div class="card-body">
        <div class="card-input-row">
          <input type="tel" class="card-input" id="phoneInput" placeholder="(555) 123-4567" autocomplete="tel" aria-label="Phone number for SMS tracking">
          <button class="card-input-btn" id="phoneSubmit">Enable</button>
        </div>
        <ul class="sms-benefits">
          <li>Pickup confirmation</li>
          <li>Package scanned by carrier</li>
          <li>Delivered to return center</li>
          <li>Refund processed</li>
        </ul>
        <div class="card-divider"></div>
        <button class="card-btn outline" id="skipSmsBtn" aria-label="Skip SMS tracking">Skip — continue without SMS</button>
      </div>
    `;

    this._addAgentMessageWithCard(msg, card);
    await this.speech.speak(msg);
    this.state = 'enabling_sms';
    this._shippingMethodForComplete = shippingMethod;

    setTimeout(() => {
      document.getElementById('phoneSubmit')?.addEventListener('click', () => {
        const val = document.getElementById('phoneInput')?.value.trim();
        if (val) {
          this.session.phone = val.replace(/\D/g, '');
          this._showSmsEnabled(shippingMethod);
        }
      });
      document.getElementById('phoneInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = document.getElementById('phoneInput')?.value.trim();
          if (val) {
            this.session.phone = val.replace(/\D/g, '');
            this._showSmsEnabled(shippingMethod);
          }
        }
      });
      document.getElementById('skipSmsBtn')?.addEventListener('click', () => {
        this._showTrackingDashboard(shippingMethod);
      });
    }, 100);
  }

  async _handleSmsInput(intent, text) {
    if (intent.intent === 'no' || /skip|no thanks|nah/i.test(text.toLowerCase())) {
      await this._showTrackingDashboard(this._shippingMethodForComplete);
    } else if (intent.intent === 'phone' || /\d{7,}/.test(text.replace(/\D/g, ''))) {
      this.session.phone = text.replace(/\D/g, '');
      await this._showSmsEnabled(this._shippingMethodForComplete);
    } else if (intent.intent === 'yes') {
      const msg = "Great! What's the best phone number to text?";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    } else {
      const msg = "Would you like SMS tracking? Enter a phone number or say 'skip'.";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    }
  }

  async _showSmsEnabled(shippingMethod) {
    if (!this.context.trackingNumber) {
      this.context.trackingNumber = generateTrackingNumber();
    }

    const r = RETAILERS[this.context.retailer];
    const deliveryDate = formatMonthDay(getFutureDate(3));

    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot green"></div>
        <div class="card-title">📱 SMS Tracking Enabled</div>
      </div>
      <div class="card-body">
        <div style="font-size:0.8125rem; color:var(--text-secondary); margin-bottom:0.5rem;">Preview of updates you'll receive:</div>
        <div class="sms-preview">
          <div class="sms-msg">
            <div class="sms-dot green"></div>
            <div class="sms-text">"ReturnClaw: UPS picked up your ${this.context.item} return. Tracking: ${this.context.trackingNumber}"</div>
          </div>
          <div class="sms-msg">
            <div class="sms-dot yellow"></div>
            <div class="sms-text">"ReturnClaw: Your return is in transit to ${r.name}. ETA: ${deliveryDate}"</div>
          </div>
          <div class="sms-msg">
            <div class="sms-dot green"></div>
            <div class="sms-text">"ReturnClaw: ${r.name} received your return. Refund of $${this.context.price.toFixed(2)} initiated — 3–5 business days."</div>
          </div>
        </div>
      </div>
    `;

    const msg = 'SMS tracking enabled! You\'ll get text updates at each stage.';
    this._addAgentMessageWithCard(msg, card);
    await this.speech.speak(msg);

    await this._delay(600);
    await this._showTrackingDashboard(shippingMethod);
  }

  // ---- Tracking Dashboard ----
  async _showTrackingDashboard(shippingMethod) {
    if (!this.context.trackingNumber) {
      this.context.trackingNumber = generateTrackingNumber();
    }

    const r = RETAILERS[this.context.retailer];
    const deliveryDate = formatMonthDay(getFutureDate(3));
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const todayStr = formatMonthDay(now);
    const addr = this.session.address;
    const cityStr = addr ? `${addr.city}, ${addr.state}` : 'Your area';

    const refundMethodLabel = this.context.refundMethod === 'store_credit' ? 'Store Credit (Instant)' :
                               this.context.refundMethod === 'exchange' ? 'Replacement Exchange' :
                               'Original Payment Method';

    const card = document.createElement('div');
    card.className = 'action-card';
    card.id = 'trackingDashboard';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot green"></div>
        <div class="card-title">📊 Return Tracking</div>
      </div>
      <div class="card-body">
        <div class="tracking-timeline">
          <div class="tracking-progress" id="trackingProgress" style="width: 0%"></div>
          <div class="tracking-node">
            <div class="tracking-dot" id="trackDot0"></div>
            <div class="tracking-label">Label Created</div>
          </div>
          <div class="tracking-node">
            <div class="tracking-dot" id="trackDot1"></div>
            <div class="tracking-label">Picked Up</div>
          </div>
          <div class="tracking-node">
            <div class="tracking-dot" id="trackDot2"></div>
            <div class="tracking-label">In Transit</div>
          </div>
          <div class="tracking-node">
            <div class="tracking-dot" id="trackDot3"></div>
            <div class="tracking-label">Delivered to ${r.name}</div>
          </div>
        </div>
        <div class="card-divider"></div>
        <div class="tracking-detail-grid">
          <span class="td-label">Tracking</span>
          <span class="td-value">${this.context.trackingNumber}</span>
          <span class="td-label">Carrier</span>
          <span class="td-value">UPS Ground</span>
          <span class="td-label">Est. Delivery</span>
          <span class="td-value">${deliveryDate}</span>
        </div>
        <div class="tracking-update">
          <div class="tracking-update-title">Latest Update</div>
          <div class="tracking-update-text" id="trackingUpdateText">${todayStr}, ${timeStr} — Label created</div>
          <div class="tracking-update-loc" id="trackingUpdateLoc">${cityStr}</div>
        </div>
        <div class="card-divider"></div>
        <div class="refund-status">
          <span class="refund-status-label">Refund Status</span>
          <span class="refund-status-value">Pending</span>
        </div>
        <div class="refund-expected">Expected: $${this.context.price.toFixed(2)} via ${refundMethodLabel}</div>
        <div class="card-divider"></div>
        <a href="https://www.ups.com/track?tracknum=${this.context.trackingNumber.replace(/-/g, '')}" target="_blank" rel="noopener noreferrer" class="card-btn secondary" style="text-decoration:none; margin-top:0.375rem;">
          View on UPS.com →
        </a>
      </div>
    `;

    const msg = `Here's your tracking dashboard. Your return label has been created and you can track progress in real time.`;
    this._addAgentMessageWithCard(msg, card);
    await this.speech.speak(msg);

    // Animate tracking dots
    this._animateTrackingDots(cityStr, todayStr, timeStr);

    await this._delay(800);
    await this._showComplete(shippingMethod);
  }

  _animateTrackingDots(cityStr, todayStr, timeStr) {
    const steps = [
      { delay: 600, dot: 0, progress: '0%' },
      { delay: 1800, dot: 1, progress: '33%', text: `${todayStr}, ${timeStr} — Picked up by UPS`, loc: cityStr },
      { delay: 3200, dot: 2, progress: '66%', text: `${todayStr}, ${timeStr} — In transit`, loc: 'UPS Distribution Center' },
    ];

    steps.forEach(step => {
      setTimeout(() => {
        const dot = document.getElementById(`trackDot${step.dot}`);
        const progress = document.getElementById('trackingProgress');
        if (dot) {
          dot.classList.add(step.dot < steps.length - 1 ? 'filled' : 'active');
        }
        if (progress) progress.style.width = step.progress;
        if (step.text) {
          const updateText = document.getElementById('trackingUpdateText');
          const updateLoc = document.getElementById('trackingUpdateLoc');
          if (updateText) updateText.textContent = step.text;
          if (updateLoc) updateLoc.textContent = step.loc;
        }
      }, step.delay);
    });
  }

  async _handleTracking(intent, text) {
    await this._handleComplete(intent, text);
  }

  // ---- Multi-Item Return ----
  async _showMultiItemSelect() {
    const orders = this.context.retailer
      ? MOCK_ORDERS.filter(o => o.retailer === this.context.retailer)
      : MOCK_ORDERS.slice(0, 5);

    if (orders.length === 0) {
      const msg = "I didn't find any recent orders to return from that retailer. Try a different one?";
      this._addAgentMessage(msg);
      this.state = 'awaiting_item';
      this._startListeningAfterDelay();
      return;
    }

    // Generate multi-item data with some non-returnable
    this.multiItems = orders.map((order, idx) => ({
      ...order,
      checked: true,
      eligible: idx !== 2 || !this.context.retailer, // third item is non-returnable as demo
      nonReturnableReason: idx === 2 && this.context.retailer ? 'Non-returnable (digital service)' : null
    }));

    // Make at least one non-returnable for demo if we have 3+
    if (this.multiItems.length >= 3) {
      this.multiItems[this.multiItems.length - 1].eligible = false;
      this.multiItems[this.multiItems.length - 1].nonReturnableReason = 'Non-returnable item';
      this.multiItems[this.multiItems.length - 1].checked = false;
    }

    const r = this.context.retailer ? RETAILERS[this.context.retailer] : null;
    const msg = r
      ? `I found ${orders.length} items from ${r.name}. Select the items you'd like to return:`
      : `Here are your recent orders. Select items to return:`;

    // Demo note
    const demoNote = !isLiveMode ? '<div class="demo-banner">⚡ Demo orders shown — connect your email for real order data</div>' : '';

    const card = this._createMultiItemCard(demoNote);
    this._addAgentMessageWithCard(msg, card);
    await this.speech.speak(msg);

    this.state = 'multi_item_select';
  }

  _createMultiItemCard(demoNote) {
    const card = document.createElement('div');
    card.className = 'action-card';
    card.id = 'multiItemCard';

    const eligibleItems = this.multiItems.filter(i => i.eligible && i.checked);
    const totalRefund = eligibleItems.reduce((sum, i) => sum + i.price, 0);

    let html = `
      <div class="card-header">
        <div class="card-status-dot blue"></div>
        <div class="card-title">📦 Multi-Item Return</div>
      </div>
      <div class="card-body">
        ${demoNote || ''}
        <div class="multi-item-list">
    `;

    this.multiItems.forEach((item, idx) => {
      if (item.eligible) {
        html += `
          <div class="multi-item-row">
            <div class="multi-item-check ${item.checked ? 'checked' : ''}" data-multi-idx="${idx}" role="checkbox" aria-checked="${item.checked}" aria-label="Select ${item.item}">✓</div>
            <span class="multi-item-name">${item.emoji} ${item.item}</span>
            <span class="multi-item-price">$${item.price.toFixed(2)}</span>
            <span class="multi-item-badge eligible">Eligible</span>
          </div>
        `;
      } else {
        html += `
          <div class="multi-item-row" style="opacity: 0.6;">
            <div class="multi-item-check non-returnable">✗</div>
            <span class="multi-item-name">${item.emoji} ${item.item}</span>
            <span class="multi-item-price">$${item.price.toFixed(2)}</span>
            <span class="multi-item-badge non-returnable">Non-rtn</span>
          </div>
        `;
      }
    });

    html += `
        </div>
        <div class="multi-item-total">
          <span class="total-label">Total Refund</span>
          <span class="total-value" id="multiTotal">$${totalRefund.toFixed(2)}</span>
        </div>
        <button class="card-btn primary" id="returnSelectedBtn" style="margin-top:0.5rem;" aria-label="Return selected items">Return Selected Items</button>
      </div>
    `;

    card.innerHTML = html;

    setTimeout(() => {
      // Toggle checkboxes
      card.querySelectorAll('.multi-item-check:not(.non-returnable)').forEach(el => {
        el.addEventListener('click', () => {
          const idx = parseInt(el.dataset.multiIdx);
          this.multiItems[idx].checked = !this.multiItems[idx].checked;
          el.classList.toggle('checked');
          el.setAttribute('aria-checked', this.multiItems[idx].checked);
          // Update total
          const eligible = this.multiItems.filter(i => i.eligible && i.checked);
          const total = eligible.reduce((sum, i) => sum + i.price, 0);
          const totalEl = document.getElementById('multiTotal');
          if (totalEl) totalEl.textContent = `$${total.toFixed(2)}`;
        });
      });

      document.getElementById('returnSelectedBtn')?.addEventListener('click', () => {
        this._processMultiReturn();
      });
    }, 100);

    return card;
  }

  async _processMultiReturn() {
    const selected = this.multiItems.filter(i => i.eligible && i.checked);
    if (selected.length === 0) {
      const msg = "Please select at least one item to return.";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      return;
    }

    const totalRefund = selected.reduce((sum, i) => sum + i.price, 0);
    const itemNames = selected.map(i => i.item).join(', ');

    // Use first item as primary context
    const primary = selected[0];
    this.context.retailer = primary.retailer;
    this.context.item = itemNames;
    this.context.emoji = primary.emoji;
    this.context.orderId = primary.orderId;
    this.context.price = totalRefund;
    this.context.orderDate = getRecentDate(primary.daysAgo);

    const msg = `Returning ${selected.length} item${selected.length > 1 ? 's' : ''} for a total refund of $${totalRefund.toFixed(2)}. Let me process these.`;
    this._addAgentMessage(msg);
    await this.speech.speak(msg);

    await this._delay(400);
    await this._showReasonSelector();
  }

  async _handleMultiItemInput(intent, text) {
    if (intent.intent === 'yes' || /return|go|submit|process/i.test(text.toLowerCase())) {
      await this._processMultiReturn();
    } else {
      const msg = "Select the items you'd like to return above, then click 'Return Selected Items'.";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
    }
  }

  // ---- Completion ----
  async _showComplete(shippingMethod) {
    const r = RETAILERS[this.context.retailer];

    const shippingLabel = shippingMethod === 'pickup' ? 'UPS Pickup' :
                          shippingMethod === 'dropoff' ? 'Drop-off' : 'Self-Ship';

    const refundLabel = this.context.refundMethod === 'store_credit' ? `${r.name} Store Credit (Instant)` :
                        this.context.refundMethod === 'exchange' ? 'Replacement Exchange' :
                        'Original Payment (3–5 days)';

    const reasonLabel = this.context.returnReason ? this.context.returnReason.label : 'N/A';

    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot green"></div>
        <div class="card-title">Return Complete</div>
      </div>
      <div class="card-body">
        <div class="summary-grid">
          <span class="summary-label">Item</span>
          <span class="summary-value">${this.context.emoji} ${this.context.item}</span>
          <span class="summary-label">Retailer</span>
          <span class="summary-value">${r.name}</span>
          <span class="summary-label">Order</span>
          <span class="summary-value">#${this.context.orderId}</span>
          <span class="summary-label">Reason</span>
          <span class="summary-value">${reasonLabel}</span>
          <span class="summary-label">Expected Refund</span>
          <span class="summary-value" style="color: var(--accent)">$${this.context.price.toFixed(2)}</span>
          <span class="summary-label">Refund Method</span>
          <span class="summary-value">${refundLabel}</span>
          <span class="summary-label">Shipping</span>
          <span class="summary-value">${shippingLabel}</span>
          ${this.context.trackingNumber ? `
            <span class="summary-label">Tracking</span>
            <span class="summary-value">${this.context.trackingNumber}</span>
          ` : ''}
        </div>
        <div class="card-divider"></div>
        <button class="card-btn primary" id="startAnotherBtn" aria-label="Start another return">
          Start Another Return
        </button>
      </div>
    `;

    const msg = `All set! Your return is in progress. You can expect a refund of $${this.context.price.toFixed(2)} ${this.context.refundMethod === 'store_credit' ? 'as instant store credit' : 'in 3 to 5 business days'} after ${r.name} receives the item. Is there anything else I can help with?`;
    this._addAgentMessageWithCard(msg, card);
    await this.speech.speak(msg);

    // Store in session
    this.session.completedReturns.push({
      item: this.context.item,
      retailer: this.context.retailer,
      price: this.context.price,
      tracking: this.context.trackingNumber,
      emoji: this.context.emoji,
      timestamp: new Date().toISOString()
    });

    // Update history panel
    this._updateHistoryPanel();

    this.state = 'complete';

    setTimeout(() => {
      document.getElementById('startAnotherBtn')?.addEventListener('click', () => this._resetAndStart());
    }, 50);
  }

  async _handleComplete(intent, text) {
    if (intent.intent === 'return' || intent.intent === 'multi_return') {
      await this._resetAndStart(text);
    } else if (intent.intent === 'yes' || /another|new|different|start over/i.test(text.toLowerCase())) {
      await this._resetAndStart();
    } else if (intent.intent === 'no' || intent.intent === 'goodbye') {
      const msg = "Great! Have a wonderful day. Come back anytime you need to make a return.";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
    } else if (intent.intent === 'thanks') {
      const msg = "You're welcome! Is there anything else I can help with, or would you like to start another return?";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    } else if (intent.intent === 'policy_inquiry' && intent.retailer) {
      await this._showPolicyOnly(intent.retailer);
    } else if (this._getDomainIntentResponse(intent)) {
      await this._handleDomainQuestion(intent);
    } else {
      await this._handleAwaitingItem(intent, text);
    }
  }

  async _handleDefault(intent, text) {
    // Never silently drop input — always acknowledge and redirect
    // Try domain intent handling first
    if (this._getDomainIntentResponse(intent)) {
      await this._handleDomainQuestion(intent);
      return;
    }
    // Try to detect if it's a return-related query we missed
    const retailerKey = findRetailer(text);
    if (retailerKey) {
      this.context.retailer = retailerKey;
      const r = RETAILERS[retailerKey];
      this.state = 'awaiting_item_clarify';
      const msg = `I can help with a return at ${r.name}. What item would you like to return?`;
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
      return;
    }
    const msg = "I'm here to help with returns. You can tell me what you'd like to return, or ask me anything about the return process.";
    this._addAgentMessage(msg);
    await this.speech.speak(msg);
    this.state = 'awaiting_item';
    this._startListeningAfterDelay();
  }

  async _resetAndStart(initialText) {
    this._resetContext();
    this._resetPipeline();
    this.state = 'awaiting_item';

    // Memory: reference previous session data and preferences
    let msg = "Sure! What would you like to return?";
    if (this.session.connectedOrders && this.session.email) {
      const extras = [];
      if (this.session.address) extras.push('your address');
      if (this.session.preferredCarrier) extras.push('your carrier preference');
      const memoryNote = extras.length > 0 ? ` I still have ${extras.join(' and ')} on file — I'll use the same details unless you tell me otherwise.` : '';
      msg = `Sure! I still have ${this.session.email} connected.${memoryNote} What would you like to return?`;
    }

    this._addAgentMessage(msg);
    await this.speech.speak(msg);

    if (initialText) {
      await this._delay(200);
      await this._handleUserInput(initialText);
    } else {
      this._startListeningAfterDelay();
    }
  }

  // --- UI Helpers ---

  _addAgentMessage(text) {
    const container = document.createElement('div');
    container.className = 'message agent';
    container.innerHTML = `
      <span class="message-label">ReturnClaw</span>
      <div class="message-bubble">${text}</div>
    `;
    this.chatArea.appendChild(container);
    this._scrollToBottom();
  }

  _addAgentMessageWithCard(text, card) {
    const container = document.createElement('div');
    container.className = 'message agent';

    let html = `<span class="message-label">ReturnClaw</span>`;
    if (text) {
      html += `<div class="message-bubble">${text}</div>`;
    }
    container.innerHTML = html;

    container.appendChild(card);
    this.chatArea.appendChild(container);
    this._scrollToBottom();
  }

  _addUserMessage(text) {
    const container = document.createElement('div');
    container.className = 'message user';
    container.innerHTML = `
      <span class="message-label">You</span>
      <div class="message-bubble">${text}</div>
    `;
    this.chatArea.appendChild(container);
    this._scrollToBottom();
  }

  async _showTyping(duration) {
    const container = document.createElement('div');
    container.className = 'message agent';
    container.innerHTML = `
      <span class="message-label">ReturnClaw</span>
      <div class="message-bubble">
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    this.chatArea.appendChild(container);
    this._scrollToBottom();

    await this._delay(duration);
    container.remove();
  }

  _scrollToBottom() {
    requestAnimationFrame(() => {
      const main = document.querySelector('.main');
      main.scrollTo({ top: main.scrollHeight, behavior: 'smooth' });
      this.chatArea.scrollTo({ top: this.chatArea.scrollHeight, behavior: 'smooth' });
    });
    setTimeout(() => {
      const main = document.querySelector('.main');
      main.scrollTo({ top: main.scrollHeight, behavior: 'smooth' });
    }, 450);
  }

  _setPipelineStep(step, status) {
    const el = document.getElementById('step' + step.charAt(0).toUpperCase() + step.slice(1));
    if (!el) return;
    el.classList.remove('active', 'done');
    if (status) el.classList.add(status);

    // Animate connector fills
    if (status === 'done') {
      const connector = el.nextElementSibling;
      if (connector && connector.classList.contains('pipeline-connector')) {
        const fill = connector.querySelector('.pipeline-connector-fill');
        if (fill) fill.style.transform = 'scaleX(1)';
      }
    }
  }

  _resetPipeline() {
    ['triage', 'policy', 'execution', 'carrier'].forEach(s => this._setPipelineStep(s, null));
    this.pipeline.classList.remove('visible');
    // Reset connector fills
    document.querySelectorAll('.pipeline-connector-fill').forEach(f => f.style.transform = 'scaleX(0)');
  }

  _resetContext() {
    this.context = {
      retailer: null, item: null, orderId: null,
      orderDate: null, price: null, daysRemaining: null,
      carrierChoice: null, emoji: '📦',
      returnReason: null, refundMethod: null, trackingNumber: null
    };
    this.multiItems = [];
    this._realOrders = null;
    this._searchMatches = null;
    this._foundOrders = null;
  }

  _startListeningAfterDelay() {
    if (!this.speech.hasRecognition) return;
    // 800ms delay to prevent agent's own speech from being picked up by the microphone
    setTimeout(() => {
      if (!this.speech.isListening && !this.speech.isSpeaking) {
        this.speech.startListening();
      }
    }, 800);
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  window.agent = new ReturnClawAgent();

  // Make landing page orb clickable — scrolls to demo and starts conversation
  const landingOrbContainer = document.getElementById('landingOrbContainer');
  if (landingOrbContainer) {
    const triggerDemo = () => {
      const demoSection = document.getElementById('demo');
      if (demoSection) {
        demoSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      // Start the conversation after scroll completes
      setTimeout(() => {
        if (window.agent && window.agent.state === 'idle') {
          window.agent._handleOrbClick();
        }
      }, 600);
    };
    landingOrbContainer.addEventListener('click', triggerDemo);
    landingOrbContainer.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        triggerDemo();
      }
    });
  }

  // Also make "Try It Now" and "Launch Demo" buttons trigger the agent
  document.querySelectorAll('a[href="#demo"]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const demoSection = document.getElementById('demo');
      if (demoSection) {
        demoSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      setTimeout(() => {
        if (window.agent && window.agent.state === 'idle') {
          window.agent._handleOrbClick();
        }
      }, 800);
    });
  });
});
