/**
 * ReturnClaw — Frontend Application
 * Copyright (c) 2026 Kelley Hunt, PLLC. All rights reserved.
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
  'h&m': 'hm', 'hm': 'hm', 'h and m': 'hm', 'h & m': 'hm'
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
  'pants': '👖', 'jeans': '👖', 'shorts': '🩳', '501': '👖',
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

  // Normalize affirmative variations to simplify downstream matching
  // (we don't replace — just note that "yeah"/"yep"/"sure"/"ok"/"go ahead" are handled below)

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

  // Yes/no/affirmative
  if (/^(yes|yeah|yep|sure|ok|okay|absolutely|definitely|go ahead|do it|let's do it|please|yea|ya|yup)/i.test(lower)) {
    return { intent: 'yes' };
  }

  if (/^(no|nah|nope|not now|never mind|cancel|skip|i'm good|no thanks)/i.test(lower)) {
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

  if (RETAILER_ALIASES[lower]) return RETAILER_ALIASES[lower];

  for (const [alias, key] of Object.entries(RETAILER_ALIASES)) {
    if (lower.includes(alias) || alias.includes(lower)) return key;
  }

  for (const [key, r] of Object.entries(RETAILERS)) {
    if (lower.includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(lower)) return key;
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
    this.pipeline = document.getElementById('pipeline');
    this.modalOverlay = document.getElementById('modalOverlay');
    this.modalClose = document.getElementById('modalClose');
    this.howItWorksBtn = document.getElementById('howItWorksBtn');

    this._bindEvents();
    this._setupSpeechCallbacks();
    this._setupOAuthListener();
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
      } else {
        this.orb.classList.remove('listening');
        if (!this.speech.isSpeaking) {
          this.orbLabel.textContent = 'Click to speak';
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

      await this._showTyping(1800);

      // In live mode, search real emails
      if (isLiveMode) {
        await this._searchRealOrders();
      } else {
        await this._showFoundOrders();
      }
    }
  }

  // ============================================================
  // LIVE MODE: Real Email Search (supports OAuth and IMAP)
  // ============================================================
  async _searchRealOrders() {
    try {
      // Choose endpoint based on connection type
      const isImap = this.session.connectionType === 'imap';
      const endpoint = isImap ? '/api/imap/search' : '/api/email/search';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.sessionId,
          retailer: this.context.retailer,
          query: this.context.item,
        }),
      });
      const data = await res.json();

      if (data.orders && data.orders.length > 0) {
        await this._displayRealOrders(data.orders);
      } else {
        // No real orders found — guide user with helpful context
        const msg = "I searched your email but couldn't find orders matching that. Try telling me the retailer name and approximate date, and I'll narrow it down.";
        this._addAgentMessage(msg);
        await this.speech.speak(msg);
        // Fall back to mock orders for demo continuity
        await this._delay(500);
        await this._showFoundOrders();
      }
    } catch (error) {
      console.error('Email search error:', error);
      const msg = "Hmm, the connection didn't go through. You can try again or enter your order details manually.";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      await this._delay(500);
      await this._showFoundOrders();
    }
  }

  async _displayRealOrders(orders) {
    const msg = `Found ${orders.length} order${orders.length > 1 ? 's' : ''} in your email. Which one are you returning?`;

    const card = document.createElement('div');
    card.className = 'action-card';
    let html = `
      <div class="card-header">
        <div class="card-status-dot green"></div>
        <div class="card-title">Found ${orders.length} Orders From Email</div>
      </div>
      <div class="order-select-list">
    `;

    orders.forEach((order, idx) => {
      const dateStr = order.date ? formatMonthDay(new Date(order.date)) : 'Recent';
      const priceStr = order.total ? `$${order.total.toFixed(2)}` : '';
      const retailerStr = order.retailer || 'Unknown';
      const itemStr = order.items && order.items.length > 0 ? order.items[0] : order.subject;
      const orderIdStr = order.orderId || '';
      const emoji = getItemEmoji(itemStr);

      html += `
        <div class="order-select-item" data-real-idx="${idx}">
          <div class="order-thumb">${emoji}</div>
          <div class="order-info">
            <div class="order-item-name">${itemStr}</div>
            <div class="order-meta">${retailerStr} — ${dateStr}${priceStr ? ' · ' + priceStr : ''}${orderIdStr ? '<br>Order #' + orderIdStr : ''}</div>
          </div>
          <span class="select-indicator">Select →</span>
        </div>
      `;
    });

    html += '</div>';
    card.innerHTML = html;
    this._addAgentMessageWithCard(msg, card);
    await this.speech.speak(msg);

    this._realOrders = orders;
    this.state = 'selecting_order';

    setTimeout(() => {
      card.querySelectorAll('.order-select-item').forEach(el => {
        el.addEventListener('click', () => {
          const idx = parseInt(el.dataset.realIdx);
          this._selectRealOrder(idx);
        });
      });
    }, 50);
  }

  async _selectRealOrder(idx) {
    const order = this._realOrders[idx];
    // Map real order data to context
    const retailerKey = order.retailer ? findRetailer(order.retailer) : this.context.retailer;
    this.context.retailer = retailerKey || 'amazon';
    this.context.item = (order.items && order.items.length > 0) ? order.items[0] : order.subject;
    this.context.emoji = getItemEmoji(this.context.item);
    this.context.orderId = order.orderId || generateOrderId(this.context.retailer);
    this.context.price = order.total || 0;
    this.context.orderDate = order.date ? new Date(order.date) : getRecentDate();

    const r = RETAILERS[this.context.retailer];
    if (!r) {
      // Fallback if retailer not in our database
      this.context.retailer = 'amazon';
    }

    await this._showPolicyCheckForReal();
  }

  // ============================================================
  // LIVE MODE: Real Policy Check
  // ============================================================
  async _showPolicyCheckForReal() {
    const r = RETAILERS[this.context.retailer];

    this.pipeline.classList.add('visible');
    this._setPipelineStep('triage', 'done');
    this._setPipelineStep('policy', 'active');

    const triageMsg = `Got it — you want to return ${this.context.item} from ${r.name}. Let me check the return policy.`;
    this._addAgentMessage(triageMsg);
    await this.speech.speak(triageMsg);

    await this._showTyping(1500);

    // In live mode, fetch policy from API
    if (isLiveMode) {
      try {
        const orderDateParam = this.context.orderDate ? `?orderDate=${this.context.orderDate.toISOString()}` : '';
        const res = await fetch(`/api/policy/${this.context.retailer}${orderDateParam}`);
        const policy = await res.json();

        this._setPipelineStep('policy', 'done');
        this._setPipelineStep('execution', 'active');

        this.context.daysRemaining = policy.daysRemaining;

        const policyCard = this._createPolicyCard(r, policy.eligible);
        const policyMsg = policy.eligible
          ? `Good news — your ${this.context.item} is eligible for return. ${r.name} gives you ${policy.window} days, and you have ${policy.daysRemaining} days left. ${r.shipping}. Would you like me to start the return?`
          : `Unfortunately, the return window for this order has passed. ${r.name}'s policy is ${policy.window} days.`;

        this._addAgentMessageWithCard(policyMsg, policyCard);
        await this.speech.speak(policyMsg);

        if (policy.eligible) {
          this.state = 'awaiting_return_confirm';
          this._startListeningAfterDelay();
        } else {
          this.state = 'awaiting_item';
          this._startListeningAfterDelay();
        }
        return;
      } catch (e) {
        console.error('Policy fetch error:', e);
        // Fall through to local policy data
      }
    }

    // Fallback to local policy logic
    this.context.daysRemaining = getDaysRemaining(this.context.retailer);
    this._setPipelineStep('policy', 'done');
    this._setPipelineStep('execution', 'active');

    const policyCard = this._createPolicyCard(r, true);
    const policyMsg = `Good news — your ${this.context.item} is eligible for return. ${r.name} gives you ${r.window} days, and you have ${this.context.daysRemaining} days left. ${r.shipping}. Would you like me to start the return?`;

    this._addAgentMessageWithCard(policyMsg, policyCard);
    await this.speech.speak(policyMsg);

    this.state = 'awaiting_return_confirm';
    this._startListeningAfterDelay();
  }

  // ============================================================
  // LIVE MODE: Real Return Deep Link
  // ============================================================
  async _generateRealReturnLink() {
    if (!isLiveMode) return null;
    try {
      const res = await fetch('/api/return/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          retailer: RETAILERS[this.context.retailer]?.name || this.context.retailer,
          orderId: this.context.orderId,
        }),
      });
      const data = await res.json();
      return data.url;
    } catch (e) {
      console.error('Return link error:', e);
      return null;
    }
  }

  // ============================================================
  // CORE AGENT LOGIC (preserved from original)
  // ============================================================

  _handleOrbClick() {
    if (this.state === 'idle') {
      this._startConversation();
      return;
    }
    if (this.speech.isSpeaking) {
      this.speech.stopSpeaking();
      return;
    }
    if (this.speech.isListening) {
      this.speech.stopListening();
      return;
    }
    this.speech.startListening();
  }

  _handleSend() {
    const text = this.textInput.value.trim();
    if (!text) return;
    this.textInput.value = '';
    // BUG 6 FIX: Stop speech when user types during agent speaking
    if (this.speech.isSpeaking) {
      this.speech.stopSpeaking();
    }
    if (this.state === 'idle') {
      this._startConversation(text);
    } else {
      this._handleUserInput(text);
    }
  }

  async _startConversation(initialText) {
    this.state = 'greeting';
    this.orbArea.classList.add('minimized');

    // If already connected from a previous interaction, skip the gating flow
    if (this.session.connectedOrders && this.session.email) {
      const greeting = `Welcome back! I still have ${this.session.email} connected. What would you like to return?`;
      this._addAgentMessage(greeting);
      await this.speech.speak(greeting);
      this.state = 'awaiting_item';
      if (initialText) {
        this._handleUserInput(initialText);
      } else if (this.speech.hasRecognition) {
        this.speech.startListening();
      }
      return;
    }

    // Proactive email gating: greet and immediately offer connection
    const greeting = "Hi, I'm ReturnClaw. I help you return items from Amazon, Walmart, Target, and hundreds of other retailers. To get started, I'll need to connect to your email so I can find your orders.";
    this._addAgentMessage(greeting);
    await this.speech.speak(greeting);

    // If the user sent text with their orb click, check if it's a return intent first
    if (initialText) {
      const intent = parseIntent(initialText);
      if (intent.intent === 'return' || intent.intent === 'policy_inquiry' || intent.intent === 'multi_return') {
        // They know what they want — store intent context and still offer email
        if (intent.retailer) this.context.retailer = intent.retailer;
        if (intent.item) {
          this.context.item = capitalizeItem(intent.item);
          this.context.emoji = getItemEmoji(intent.item);
        }
      }
    }

    // Show the email connection card proactively
    await this._delay(400);
    await this._showProactiveEmailConnect();
  }

  // Proactive email connection gating — shown immediately after greeting
  async _showProactiveEmailConnect() {
    const msg = "Would you like to connect your email?";

    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot blue"></div>
        <div class="card-title">Connect Your Email</div>
      </div>
      <div class="card-btn-group">
        <button class="gmail-btn" id="proactiveGmailBtn">
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Connect Gmail
        </button>
        <button class="outlook-btn" id="proactiveOutlookBtn">
          <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="4" fill="white" fill-opacity="0"/>
            <path d="M28 6v14h14V8c0-1.1-.9-2-2-2H28z" fill="#1490DF"/>
            <path d="M28 28v14h12c1.1 0 2-.9 2-2V28H28z" fill="#1F6BF1"/>
            <path d="M6 20h22v8H6z" fill="#28A8EA"/>
            <path d="M6 28v10c0 1.1.9 2 2 2h20V28H6z" fill="#0078D4"/>
            <path d="M6 8c0-1.1.9-2 2-2h20v14H6V8z" fill="#50D9FF"/>
            <path d="M28 20h14v8H28z" fill="#0364B8"/>
          </svg>
          Connect Outlook
        </button>
        <button class="yahoo-btn" id="proactiveYahooBtn">
          <span style="font-size:18px;">\u{1F4E7}</span>
          Connect Yahoo
        </button>
        <button class="icloud-btn" id="proactiveIcloudBtn">
          <span style="font-size:18px;">\u{1F4E7}</span>
          Connect iCloud
        </button>
        <button class="other-btn" id="proactiveOtherBtn">
          <span style="font-size:18px;">\u{1F4E7}</span>
          Other Email
        </button>
        <button class="card-btn secondary" id="proactiveManualBtn">
          <span class="card-btn-icon">\u270f\ufe0f</span>
          Enter details manually
        </button>
      </div>
      <div class="privacy-note">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
        Your credentials are secured with app-specific passwords \u2014 never stored by ReturnClaw.
      </div>
    `;

    this._addAgentMessageWithCard(msg, card);
    await this.speech.speak(msg);

    this.state = 'awaiting_email_choice';

    // BUG 2 FIX: Activate listening after email card is shown
    this._startListeningAfterDelay();

    setTimeout(() => {
      document.getElementById('proactiveGmailBtn')?.addEventListener('click', () => this._connectEmail('Gmail'));
      document.getElementById('proactiveOutlookBtn')?.addEventListener('click', () => this._connectEmail('Outlook'));
      document.getElementById('proactiveYahooBtn')?.addEventListener('click', () => this._connectEmail('Yahoo'));
      document.getElementById('proactiveIcloudBtn')?.addEventListener('click', () => this._connectEmail('iCloud'));
      document.getElementById('proactiveOtherBtn')?.addEventListener('click', () => this._connectEmail('Other'));
      document.getElementById('proactiveManualBtn')?.addEventListener('click', () => this._startManualFlow());
    }, 50);
  }

  // Manual flow: user doesn't want to connect email
  async _startManualFlow() {
    const msg = "No problem! I can still help. What would you like to return? Tell me the retailer and item — for example, \"return my AirPods from Amazon.\"";
    this._addAgentMessage(msg);
    await this.speech.speak(msg);
    this.state = 'awaiting_item';
    this._startListeningAfterDelay();
  }

  // Demo mode: prompt user for their actual email before simulating connection
  _showDemoEmailPrompt(provider) {
    const domainMap = {
      'Gmail': 'gmail.com', 'Outlook': 'outlook.com', 'Yahoo': 'yahoo.com',
      'iCloud': 'icloud.com', 'ProtonMail': 'protonmail.com', 'AOL': 'aol.com', 'Other': 'email.com'
    };
    const domain = domainMap[provider] || 'email.com';

    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot blue"></div>
        <div class="card-title">Connect ${provider}</div>
      </div>
      <div style="padding: 12px 16px; font-size: 13px; color: var(--text-secondary, #888);">
        Enter your ${provider} email to get started.
      </div>
      <div style="padding: 0 16px 12px;">
        <input type="email" class="card-input" id="demoEmailInput" placeholder="you@${domain}" autocomplete="email" style="width: 100%; box-sizing: border-box; margin-bottom: 8px; padding: 10px 12px; border: 1px solid var(--border, #333); border-radius: 8px; background: var(--bg-secondary, #1a1a1a); color: var(--text-primary, #fff); font-size: 14px;">
      </div>
      <div style="padding: 0 16px 12px; display: flex; gap: 8px;">
        <button class="card-input-btn" id="demoEmailSubmit" style="padding: 10px 20px; border-radius: 8px; background: var(--accent, #10b981); color: #fff; border: none; font-weight: 600; cursor: pointer; font-size: 14px;">Connect</button>
      </div>
      <div style="padding: 0 16px 12px; font-size: 11px; color: var(--text-tertiary, #666);">
        🔒 Demo mode — no actual email access. In the live version, we use secure IMAP with app-specific passwords.
      </div>
    `;
    this._addAgentMessageWithCard(`Connect your ${provider} account:`, card);

    setTimeout(() => {
      const input = document.getElementById('demoEmailInput');
      const submit = document.getElementById('demoEmailSubmit');
      if (input) input.focus();
      const handleSubmit = () => {
        const val = input?.value.trim();
        if (val && val.includes('@')) {
          this._simulateEmailConnect(provider, val);
        } else if (val) {
          // If they just typed a name, append the domain
          this._simulateEmailConnect(provider, val + '@' + domain);
        }
      };
      submit?.addEventListener('click', handleSubmit);
      input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSubmit(); });
    }, 100);
  }

  async _handleUserInput(text) {
    this.speech.stopSpeaking();
    this.speech.stopListening();
    this._addUserMessage(text);

    const intent = parseIntent(text);

    switch (this.state) {
      case 'greeting':
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
      case 'awaiting_return_confirm':
        await this._handleReturnConfirm(intent, text);
        break;
      case 'identifying_email':
        await this._handleEmailIdentification(intent, text);
        break;
      case 'awaiting_email_choice':
        await this._handleEmailChoice(intent, text);
        break;
      case 'scanning_orders':
        break; // auto-driven
      case 'selecting_order':
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
      case 'confirming_address':
        await this._handleAddressInput(intent, text);
        break;
      case 'awaiting_address_confirm':
        await this._handleAddressConfirm(intent, text);
        break;
      case 'awaiting_zipcode':
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

  // --- Domain Intent Response Handler (30+ intents) ---

  _getDomainIntentResponse(intent) {
    const retailerName = intent.retailer ? (RETAILERS[intent.retailer]?.name || 'that retailer') : null;
    const retailerContext = retailerName ? ` for ${retailerName}` : '';

    const responses = {
      // PRE-RETURN
      'return_eligibility': `I can check that for you! Which retailer was this from? Most retailers offer 30–90 day return windows, but it depends on the item category and your purchase date.${retailerName ? ` ${retailerName} typically offers a ${RETAILERS[intent.retailer]?.window || 30}-day window.` : ''}`,

      'return_window': retailerName
        ? `${retailerName} has a ${RETAILERS[intent.retailer]?.window || 30}-day return window for most items. Some categories like electronics may have shorter windows. When did you buy the item? I can calculate your exact deadline.`
        : `Return windows vary by retailer — Amazon gives you 30 days, Walmart and Target give 90 days, and Costco is essentially unlimited. Which retailer did you buy from? I'll tell you exactly how many days you have left.`,

      'restocking_fee': `Good question. Most major retailers like Amazon, Walmart, and Target don't charge restocking fees for standard returns. However, Best Buy charges up to 15% on opened electronics (unless you're a Totaltech member), and some third-party sellers on Amazon may charge restocking fees. What retailer and item are we talking about?`,

      'packaging_requirements': `Requirements vary by retailer: Amazon generally doesn't require original packaging for most items. Target and Walmart prefer it but don't always require it. For electronics, most retailers want the original box with all accessories. What retailer and item are you returning?`,

      'receipt_requirements': `Most online retailers don't need a physical receipt since your order is in their system. For in-store returns without a receipt: Walmart can look up purchases with the card you used, Target can find it with your phone number or RedCard, and Amazon has everything in your order history. Which retailer is this for?`,

      'shipping_cost': retailerName
        ? `${retailerName}: ${RETAILERS[intent.retailer]?.shipping || 'Return shipping policies vary'}. For defective items, most retailers cover shipping regardless.`
        : `Amazon offers free returns on most items. Target gives free shipping with RedCard. Walmart offers free in-store returns. H&M charges $5.99 for mail returns. Which retailer are you returning to?`,

      'exchange_policy': `Most retailers offer exchanges either online or in-store. If you want a different size or color, an exchange is often faster than a return + repurchase. Amazon, Target, and Walmart all support exchanges. Would you like me to walk you through an exchange?`,

      'refund_options': `Typically you have three options: 1) Refund to your original payment method (3–5 business days after the return is received). 2) Store credit or gift card (often instant). 3) Exchange for a different item. Some retailers also offer promotional credit that's worth more than the refund. Which retailer is this for?`,

      'gift_return': `Yes, you can return gifts! Most retailers will issue a store credit or gift card instead of refunding the original purchaser. You'll typically need either a gift receipt, the order number, or the packing slip. Amazon offers a specific "gift return" option. Which retailer was the gift from?`,

      'open_item_return': `It depends on the retailer and category. Amazon accepts most opened items within 30 days. Target accepts gently used items within 90 days. For clothing that's been worn and washed, most retailers won't accept it. Cosmetics vary — Sephora accepts gently used products within 30 days. What item and retailer?`,

      'non_returnable': `Common non-returnable items include: underwear/swimwear at most retailers, personalized/custom items, hazardous materials, digital content, grocery/perishables, and final-sale clearance items. Some electronics become non-returnable after activation. What item are you trying to return?`,

      'in_store_return': `Many online orders can be returned in-store! Amazon returns are accepted at Whole Foods, Kohl's, and Amazon Hub locations. Target and Walmart accept online returns at any store. In-store returns are usually faster — you get your refund immediately. Which retailer?`,

      'defective_item': `For defective items, you typically have extra protections: 1) Most retailers cover return shipping for defective products. 2) The return window may be extended or waived. 3) Manufacturer warranty may apply even after the return window closes. 4) Your credit card may offer purchase protection. What's defective and where did you buy it?`,

      'late_return': `Even if you're past the return window, you may still have options: 1) Your credit card may offer purchase protection — most Visa, Mastercard, and Amex cards extend returns by 90 days. 2) You can try a goodwill request — I can draft an email to customer service for you. 3) If the item is defective, manufacturer warranty may apply regardless of the return window. Which would you like to explore?`,

      // DURING RETURN
      'how_to_start': `Here's how to start a return: 1) Tell me the item and retailer. 2) I'll check the return policy. 3) I'll generate your return link or label. 4) Choose drop-off or pickup. 5) Ship it and track your refund. Ready to start? Just tell me what you're returning!`,

      'drop_off': `I can find drop-off locations near you! Common options include: The UPS Store, FedEx Office, Walgreens, Whole Foods (Amazon returns), and Kohl's (Amazon returns). What's your zip code? I'll find the closest locations.`,

      'schedule_pickup': `I can schedule a home pickup! UPS, FedEx, and USPS all offer residential pickup services. UPS typically picks up next-day between 12–4 PM. Would you like me to set that up? I'll just need your address.`,

      'label_help': `If you don't have a printer, no problem. Many carriers now offer QR code returns — just show the code on your phone at any UPS Store, FedEx Office, or Walgreens and they'll print it for you. Amazon also offers label-free, box-free returns at Whole Foods, Kohl's, and Amazon Hub locations. Which carrier are you using?`,

      'packaging_help': `Here are packaging tips: 1) Use the original box if you have it. 2) If not, any sturdy box works — remove old labels. 3) Wrap items in bubble wrap or packing paper. 4) Fill empty space with crumpled paper. 5) Seal with packing tape (not duct tape). 6) Attach the return label on a flat surface. Need a label?`,

      'carrier_recommendation': `Here's a quick comparison: UPS Ground is the most common for returns (reliable, many drop-off locations). FedEx is similar in speed and cost. USPS is often cheapest for smaller, lighter packages. For Amazon returns specifically, UPS is usually the default. What are you returning?`,

      'multi_item': `Absolutely, you can return multiple items! If they're from the same retailer, you can often combine them in one box to save on shipping. If they're from different retailers, I'll create separate return labels for each. Ready to start? Tell me which items you'd like to return.`,

      // POST-RETURN
      'track_return': `I can help you track your return! If you have a tracking number, I can check the status. If you started the return through me, I should have it on file. Do you have a tracking number, or would you like me to look it up?`,

      'refund_timeline': `Refund timing depends on the retailer and method: Amazon processes refunds within 3–5 days of receiving the item. Walmart takes 3–10 days. Store credit is usually instant once the return is scanned. Credit card refunds may take an additional billing cycle to appear. Which retailer are you waiting on?`,

      'refund_missing': `I understand the frustration. Here's what to check: 1) Verify the return was delivered (check tracking). 2) Most retailers take 3–5 business days after receiving the item. 3) Credit card refunds may take an additional billing cycle. 4) Check if it was issued as store credit instead. If it's been more than 14 days, I'd recommend contacting the retailer directly. Would you like me to help draft a follow-up message?`,

      'refund_discrepancy': `A partial refund could happen for a few reasons: 1) Restocking fee was applied. 2) Return shipping was deducted. 3) Item was received in different condition than expected. 4) Promotional discount was removed. I'd suggest contacting the retailer's customer service with your order number. Would you like me to help?`,

      'return_rejected': `If your return was rejected, here are your options: 1) Review the rejection reason — sometimes it's a fixable issue. 2) Contact customer service to appeal. 3) Check if the item can be returned through a different method. 4) File a dispute with your credit card company if you believe the rejection is unfair. What happened?`,
    };

    return responses[intent.intent] || null;
  }

  // Handle domain-specific questions that don't require a return flow
  async _handleDomainQuestion(intent) {
    const response = this._getDomainIntentResponse(intent);
    if (response) {
      this._addAgentMessage(response);
      await this.speech.speak(response);
      this._startListeningAfterDelay();
      return true;
    }
    return false;
  }

  // --- State Handlers ---

  // BUG 1 FIX: Handle user input during greeting (before email card is shown)
  async _handleGreetingInterrupt(intent, text) {
    const lower = text.toLowerCase();
    // If user mentions an email provider, treat as email choice
    if (/gmail|google/i.test(lower)) {
      // Stop greeting speech, jump to connecting Gmail
      this.speech.stopSpeaking();
      this.state = 'awaiting_email_choice';
      await this._connectEmail('Gmail');
      return;
    }
    if (/outlook|microsoft|hotmail|live\.com/i.test(lower)) {
      this.speech.stopSpeaking();
      this.state = 'awaiting_email_choice';
      await this._connectEmail('Outlook');
      return;
    }
    if (/yahoo/i.test(lower)) {
      this.speech.stopSpeaking();
      this.state = 'awaiting_email_choice';
      await this._connectEmail('Yahoo');
      return;
    }
    if (/icloud|apple mail/i.test(lower)) {
      this.speech.stopSpeaking();
      this.state = 'awaiting_email_choice';
      await this._connectEmail('iCloud');
      return;
    }
    if (/email|connect/i.test(lower)) {
      // Generic email mention — let greeting finish and show card
      return;
    }
    // If user states a return intent, store it and let greeting continue
    if (intent.intent === 'return' || intent.intent === 'policy_inquiry' || intent.intent === 'multi_return') {
      if (intent.retailer) this.context.retailer = intent.retailer;
      if (intent.item) {
        this.context.item = capitalizeItem(intent.item);
        this.context.emoji = getItemEmoji(intent.item);
      }
      // Queue a note — the greeting will finish and show the email card
      const ack = "Got it — I'll help with that right after we connect your email.";
      this._addAgentMessage(ack);
      return;
    }
    // For anything else, queue it and let greeting complete
    const ack = "I heard you! Let me finish getting set up and I'll help you right away.";
    this._addAgentMessage(ack);
  }

  async _handleAwaitingItem(intent, text) {
    if (intent.intent === 'multi_return') {
      if (intent.retailer) {
        this.context.retailer = intent.retailer;
        await this._showMultiItemSelect();
      } else {
        // Need to identify retailer first
        this.state = 'awaiting_retailer';
        const msg = 'Which retailer do you want to return items from?';
        this._addAgentMessage(msg);
        await this.speech.speak(msg);
        this._startListeningAfterDelay();
      }
      return;
    }

    if (intent.intent === 'return' && intent.retailer && intent.item) {
      this.context.retailer = intent.retailer;
      this.context.item = capitalizeItem(intent.item);
      this.context.emoji = getItemEmoji(intent.item);
      await this._showPolicyCheck();
    } else if (intent.intent === 'return' && intent.retailer && !intent.item) {
      this.context.retailer = intent.retailer;
      const r = RETAILERS[intent.retailer];
      this.state = 'awaiting_item_clarify';
      const msg = `I can help with a return from ${r.name}. What item would you like to return?`;
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    } else if (intent.intent === 'return' && !intent.retailer && intent.item) {
      // Vague item — try agentic search
      const matches = searchOrders(intent.item);
      if (matches.length > 1) {
        // Disambiguation
        this.context.item = capitalizeItem(intent.item);
        this.context.emoji = getItemEmoji(intent.item);
        await this._showAgenticSearch(matches, intent.item);
      } else if (matches.length === 1) {
        const match = matches[0];
        this.context.retailer = match.retailer;
        this.context.item = match.item;
        this.context.emoji = match.emoji;
        this.context.orderId = match.orderId;
        this.context.price = match.price;
        this.context.orderDate = getRecentDate(match.daysAgo);
        await this._showPolicyCheck();
      } else {
        this.context.item = capitalizeItem(intent.item);
        this.context.emoji = getItemEmoji(intent.item);
        this.state = 'awaiting_retailer';
        const msg = `Got it — you want to return ${this.context.item}. Which retailer did you purchase it from?`;
        this._addAgentMessage(msg);
        await this.speech.speak(msg);
        this._startListeningAfterDelay();
      }
    } else if (intent.intent === 'policy_inquiry' && intent.retailer) {
      await this._showPolicyOnly(intent.retailer);
    } else if (intent.intent === 'retailer_mention' && intent.retailer) {
      this.context.retailer = intent.retailer;
      const r = RETAILERS[intent.retailer];
      this.state = 'awaiting_item_clarify';
      const msg = `Sure, I can help with a return at ${r.name}. What item are you returning?`;
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    } else if (intent.intent === 'greeting') {
      const msg = "Hey! I'm here to help with returns. Just tell me what you'd like to return and where you bought it — for example, \"return my AirPods from Amazon.\"";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    } else if (intent.intent === 'help') {
      const msg = "I can help you with anything related to returning an online purchase. Here's what I do: check return policies for any retailer, find your orders from your email, generate your return link, create shipping labels, find nearby drop-off locations, schedule carrier pickups, and track your return and refund. What would you like to do?";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    } else if (intent.intent === 'thanks') {
      const msg = "You're welcome! Is there anything else I can help you with?";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    } else if (intent.intent === 'goodbye') {
      const msg = "No problem! Come back anytime you need to make a return. Have a great day!";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
    } else if (this._getDomainIntentResponse(intent)) {
      // Handle any of the 30+ domain-specific questions
      await this._handleDomainQuestion(intent);
    } else {
      const retailerKey = findRetailer(text);
      if (retailerKey) {
        this.context.retailer = retailerKey;
        const r = RETAILERS[retailerKey];
        this.state = 'awaiting_item_clarify';
        const msg = `I can help with a return at ${r.name}. What item would you like to return?`;
        this._addAgentMessage(msg);
        await this.speech.speak(msg);
      } else {
        // Try agentic search on the full text
        const matches = searchOrders(text);
        if (matches.length > 0) {
          await this._showAgenticSearch(matches, text);
        } else {
          const msg = "I specialize in retail returns. You can say something like \"return my AirPods from Amazon\" or \"what's Walmart's return policy?\" — what would you like to do?";
          this._addAgentMessage(msg);
          await this.speech.speak(msg);
        }
      }
      this._startListeningAfterDelay();
    }
  }

  // ---- Agentic Search ----
  async _showAgenticSearch(matches, query) {
    const msg = `I found ${matches.length > 1 ? 'a few items' : 'an item'} matching "${query}" in your recent orders. Which one?`;
    this._addAgentMessage(msg);

    const card = document.createElement('div');
    card.className = 'action-card';
    let html = `
      <div class="card-header">
        <div class="card-status-dot blue"></div>
        <div class="card-title">Matching Orders</div>
      </div>
      <div class="order-select-list">
    `;

    matches.forEach((order, idx) => {
      const r = RETAILERS[order.retailer];
      const dateStr = formatMonthDay(getRecentDate(order.daysAgo));
      html += `
        <div class="order-select-item" data-order-idx="${idx}">
          <div class="order-thumb">${order.emoji}</div>
          <div class="order-info">
            <div class="order-item-name">${order.item}</div>
            <div class="order-meta">${r.name} — ${dateStr} · $${order.price.toFixed(2)}</div>
          </div>
          <span class="select-indicator">Select →</span>
        </div>
      `;
    });

    html += '</div>';
    card.innerHTML = html;
    this._addAgentMessageWithCard('', card);
    await this.speech.speak(msg);

    this._searchMatches = matches;
    this.state = 'selecting_order';

    setTimeout(() => {
      card.querySelectorAll('.order-select-item').forEach(el => {
        el.addEventListener('click', () => {
          const idx = parseInt(el.dataset.orderIdx);
          this._selectSearchResult(idx);
        });
      });
    }, 50);
  }

  async _selectSearchResult(idx) {
    const order = this._searchMatches[idx];
    this.context.retailer = order.retailer;
    this.context.item = order.item;
    this.context.emoji = order.emoji;
    this.context.orderId = order.orderId;
    this.context.price = order.price;
    this.context.orderDate = getRecentDate(order.daysAgo);
    await this._showPolicyCheck();
  }

  async _handleOrderSelection(intent, text) {
    // Try to match by number or name — check real orders first
    if (this._realOrders) {
      const lower = text.toLowerCase();
      for (let i = 0; i < this._realOrders.length; i++) {
        const order = this._realOrders[i];
        const itemName = (order.items && order.items[0]) || order.subject || '';
        if (lower.includes(itemName.toLowerCase()) ||
            (order.retailer && lower.includes(order.retailer.toLowerCase())) ||
            lower === String(i + 1) ||
            (lower.includes('first') && i === 0) ||
            (lower.includes('second') && i === 1) ||
            (lower.includes('last') && i === this._realOrders.length - 1)) {
          await this._selectRealOrder(i);
          return;
        }
      }
    }

    // Then check mock search matches
    if (this._searchMatches) {
      const lower = text.toLowerCase();
      for (let i = 0; i < this._searchMatches.length; i++) {
        const order = this._searchMatches[i];
        if (lower.includes(order.item.toLowerCase()) ||
            lower.includes(RETAILERS[order.retailer].name.toLowerCase()) ||
            lower === String(i + 1) ||
            lower.includes('first') && i === 0 ||
            lower.includes('second') && i === 1 ||
            lower.includes('last') && i === this._searchMatches.length - 1) {
          await this._selectSearchResult(i);
          return;
        }
      }
    }

    // Then check found orders (mock)
    if (this._foundOrders) {
      const lower = text.toLowerCase();
      for (let i = 0; i < this._foundOrders.length; i++) {
        const order = this._foundOrders[i];
        if (lower.includes(order.item.toLowerCase()) ||
            lower.includes(RETAILERS[order.retailer].name.toLowerCase()) ||
            lower === String(i + 1) ||
            (lower.includes('first') && i === 0) ||
            (lower.includes('second') && i === 1) ||
            (lower.includes('last') && i === this._foundOrders.length - 1)) {
          await this._selectFoundOrder(i);
          return;
        }
      }
    }

    const msg = "Please select one of the orders shown above, or describe it more specifically.";
    this._addAgentMessage(msg);
    await this.speech.speak(msg);
    this._startListeningAfterDelay();
  }

  async _handleItemClarify(intent, text) {
    const item = cleanItem(text.replace(/^(my |the |a |an )/i, ''));
    this.context.item = capitalizeItem(item);
    this.context.emoji = getItemEmoji(item);
    await this._showPolicyCheck();
  }

  async _handleRetailerInput(intent, text) {
    const retailerKey = findRetailer(text);
    if (retailerKey) {
      this.context.retailer = retailerKey;
      if (intent.intent === 'multi_return' || this.multiItems.length > 0) {
        await this._showMultiItemSelect();
      } else {
        await this._showPolicyCheck();
      }
    } else {
      const retailerText = text.trim();
      const msg = `I don't have ${retailerText} in my database yet, but here's what I'd suggest: most retailers have a return page on their website — search for "${retailerText} returns" and look for a link in your order confirmation email. I'm adding new retailers every week! In the meantime, I can help with Amazon, Walmart, Target, Best Buy, Apple, Nike, Costco, Nordstrom, Zara, Home Depot, Sephora, Macy's, Gap, and H&M.`;
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    }
  }

  // ---- Policy Check ----
  async _showPolicyCheck() {
    const r = RETAILERS[this.context.retailer];
    this.context.daysRemaining = getDaysRemaining(this.context.retailer);

    this.pipeline.classList.add('visible');
    this._setPipelineStep('triage', 'done');
    this._setPipelineStep('policy', 'active');

    const triageMsg = `Got it — you want to return ${this.context.item} from ${r.name}. Let me check the return policy.`;
    this._addAgentMessage(triageMsg);
    await this.speech.speak(triageMsg);

    await this._showTyping(1500);

    this._setPipelineStep('policy', 'done');
    this._setPipelineStep('execution', 'active');

    const policyCard = this._createPolicyCard(r, true);
    const policyMsg = `Good news — your ${this.context.item} is eligible for return. ${r.name} gives you ${r.window} days, and you have ${this.context.daysRemaining} days left. ${r.shipping}. Would you like me to start the return?`;

    this._addAgentMessageWithCard(policyMsg, policyCard);
    await this.speech.speak(policyMsg);

    this.state = 'awaiting_return_confirm';
    this._startListeningAfterDelay();
  }

  async _showPolicyOnly(retailerKey) {
    const r = RETAILERS[retailerKey];
    const card = this._createPolicyCard(r, false);
    const msg = `Here's ${r.name}'s return policy: You have ${r.window} days to return items. ${r.shipping}. ${r.refund}. Would you like to start a return from ${r.name}?`;
    this._addAgentMessageWithCard(msg, card);
    await this.speech.speak(msg);
    this.state = 'awaiting_item';
    this._startListeningAfterDelay();
  }

  _createPolicyCard(retailer, eligible) {
    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot ${eligible ? 'green' : 'yellow'}"></div>
        <div class="card-title">${eligible ? 'Eligible for Return' : 'Return Policy'}</div>
      </div>
      <div class="card-body">
        <div class="card-row">
          <span class="card-row-label">Retailer</span>
          <span class="card-row-value">${retailer.name}</span>
        </div>
        <div class="card-row">
          <span class="card-row-label">Return Window</span>
          <span class="card-row-value">${retailer.window} days</span>
        </div>
        ${eligible && this.context.daysRemaining ? `<div class="card-row">
          <span class="card-row-label">Days Remaining</span>
          <span class="card-row-value" style="color: var(--accent)">${this.context.daysRemaining} days</span>
        </div>` : ''}
        <div class="card-row">
          <span class="card-row-label">Shipping</span>
          <span class="card-row-value">${retailer.shipping}</span>
        </div>
        <div class="card-row">
          <span class="card-row-label">Refund</span>
          <span class="card-row-value">${retailer.refund}</span>
        </div>
        <div class="card-divider"></div>
        <div class="card-conditions">
          <div class="card-conditions-title">Conditions</div>
          <ul>${retailer.conditions.map(c => `<li>${c}</li>`).join('')}</ul>
        </div>
      </div>
    `;
    return card;
  }

  async _handleReturnConfirm(intent, text) {
    if (intent.intent === 'yes' || /yes|yeah|sure|ok|go|start|do it|let's|please/i.test(text.toLowerCase())) {
      await this._showReasonSelector();
    } else if (intent.intent === 'no') {
      const msg = "No problem! Is there anything else I can help you with?";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this.state = 'awaiting_item';
      this._resetContext();
      this._startListeningAfterDelay();
    } else {
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
      html += `<button class="reason-btn" data-reason="${reason.id}">
        <span class="reason-icon">${reason.icon}</span>
        ${reason.label}
      </button>`;
    });
    html += '</div>';
    card.innerHTML = html;

    this._addAgentMessageWithCard(msg, card);
    await this.speech.speak(msg);
    this.state = 'selecting_reason';

    setTimeout(() => {
      card.querySelectorAll('.reason-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this._selectReason(btn.dataset.reason);
        });
      });
    }, 50);
  }

  async _selectReason(reasonId) {
    const reason = RETURN_REASONS.find(r => r.id === reasonId);
    this.context.returnReason = reason;

    // Highlight selected
    document.querySelectorAll('.reason-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.reason === reasonId);
    });

    const r = RETAILERS[this.context.retailer];

    if (reasonId === 'defective') {
      const msg = `Noted — item is defective. ${r.defectiveNote}. This may also qualify for an exchange or replacement. Let me find your order.`;
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
    } else {
      const reasonLabel = reason.label.toLowerCase();
      const msg = `Got it — ${reasonLabel}. Let me find your order so we can process this return.`;
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
    }

    await this._delay(400);

    // Check if we already have order info (from agentic search)
    if (this.context.orderId && this.context.price) {
      await this._showRefundOptions();
    } else {
      await this._showEmailIdentification();
    }
  }

  async _handleReasonSelection(intent, text) {
    const lower = text.toLowerCase();
    // Try to match reason by text
    const reasonMap = {
      'changed': 'changed_mind', 'mind': 'changed_mind',
      'defective': 'defective', 'broken': 'defective', 'doesn\'t work': 'defective', 'not working': 'defective',
      'wrong': 'wrong_item', 'wrong item': 'wrong_item',
      'description': 'not_as_described', 'doesn\'t match': 'not_as_described', 'not as described': 'not_as_described',
      'late': 'arrived_late', 'too late': 'arrived_late',
      'price': 'better_price', 'cheaper': 'better_price',
      'other': 'other'
    };

    for (const [keyword, reasonId] of Object.entries(reasonMap)) {
      if (lower.includes(keyword)) {
        await this._selectReason(reasonId);
        return;
      }
    }

    // Default to "changed my mind"
    await this._selectReason('changed_mind');
  }

  // ---- Email Identification (UPGRADED with real OAuth) ----
  async _showEmailIdentification() {
    // If already connected, skip
    if (this.session.connectedOrders) {
      await this._showFoundOrders();
      return;
    }

    const msg = "Which email should I scan for your orders?";

    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot blue"></div>
        <div class="card-title">Connect Your Email</div>
      </div>
      <div class="card-btn-group">
        <button class="gmail-btn" id="connectGmailBtn2">
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Connect Gmail
        </button>
        <button class="outlook-btn" id="connectOutlookBtn">
          <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
            <rect width="48" height="48" rx="4" fill="white" fill-opacity="0"/>
            <path d="M28 6v14h14V8c0-1.1-.9-2-2-2H28z" fill="#1490DF"/>
            <path d="M28 28v14h12c1.1 0 2-.9 2-2V28H28z" fill="#1F6BF1"/>
            <path d="M6 20h22v8H6z" fill="#28A8EA"/>
            <path d="M6 28v10c0 1.1.9 2 2 2h20V28H6z" fill="#0078D4"/>
            <path d="M6 8c0-1.1.9-2 2-2h20v14H6V8z" fill="#50D9FF"/>
            <path d="M28 20h14v8H28z" fill="#0364B8"/>
          </svg>
          Connect Outlook
        </button>
        <button class="card-btn secondary" id="enterEmailManually">
          <span class="card-btn-icon">✏️</span>
          Enter email manually
        </button>
        <button class="card-btn outline" id="enterOrderIdBtn2">
          <span class="card-btn-icon">🔢</span>
          Enter Order ID instead
        </button>
      </div>
      <div class="privacy-note">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
        Your credentials are secured with app-specific passwords — never stored by ReturnClaw.
      </div>
    `;

    this._addAgentMessageWithCard(msg, card);
    await this.speech.speak(msg);

    this.state = 'identifying_email';

    setTimeout(() => {
      document.getElementById('connectGmailBtn2')?.addEventListener('click', () => this._connectEmail('Gmail'));
      document.getElementById('connectOutlookBtn')?.addEventListener('click', () => this._connectEmail('Outlook'));
      document.getElementById('enterEmailManually')?.addEventListener('click', () => this._showManualEmailInput());
      document.getElementById('enterOrderIdBtn2')?.addEventListener('click', () => this._showOrderIdInput());
    }, 50);
  }

  // ---- Email Connection (DUAL MODE) ----
  async _connectEmail(provider) {
    if (isLiveMode) {
      // Show IMAP email + app password form for all providers
      this._showImapConnectForm(provider);
      return;
    }

    // DEMO MODE: Ask user for their email before simulating connect
    this._showDemoEmailPrompt(provider);
  }

  // ---- IMAP Connect Form ----
  _showImapConnectForm(provider) {
    const providerKey = {
      'Gmail': 'gmail', 'Outlook': 'outlook', 'Yahoo': 'yahoo',
      'iCloud': 'icloud', 'ProtonMail': 'protonmail', 'AOL': 'aol'
    }[provider] || 'gmail';

    const providerDomains = {
      'Gmail': 'gmail.com', 'Outlook': 'outlook.com', 'Yahoo': 'yahoo.com',
      'iCloud': 'icloud.com', 'ProtonMail': 'protonmail.com', 'AOL': 'aol.com'
    };
    const defaultDomain = providerDomains[provider] || '';

    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot blue"></div>
        <div class="card-title">Connect ${provider}</div>
      </div>
      <div style="padding: 12px 16px; font-size: 13px; color: var(--text-secondary, #888);">
        Enter your email and an <strong>app-specific password</strong> (not your regular password).
      </div>
      <div style="padding: 0 16px 8px;">
        <input type="email" class="card-input" id="imapEmailInput" placeholder="you@${defaultDomain || 'email.com'}" autocomplete="email" style="width: 100%; box-sizing: border-box; margin-bottom: 8px; padding: 10px 12px; border: 1px solid var(--border, #333); border-radius: 8px; background: var(--bg-secondary, #1a1a1a); color: var(--text-primary, #fff); font-size: 14px;">
        <input type="password" class="card-input" id="imapPasswordInput" placeholder="App password" autocomplete="current-password" style="width: 100%; box-sizing: border-box; margin-bottom: 8px; padding: 10px 12px; border: 1px solid var(--border, #333); border-radius: 8px; background: var(--bg-secondary, #1a1a1a); color: var(--text-primary, #fff); font-size: 14px;">
      </div>
      <div style="padding: 0 16px 12px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
        <button class="card-input-btn" id="imapConnectBtn" style="padding: 10px 20px; border-radius: 8px; background: var(--accent, #ff6b35); color: #fff; border: none; font-weight: 600; cursor: pointer; font-size: 14px;">Connect</button>
        <a href="#" id="imapHelpLink" style="font-size: 12px; color: var(--accent, #ff6b35); text-decoration: none;">How to get an app password</a>
      </div>
      <div id="imapHelpPanel" style="display: none; padding: 0 16px 12px;">
        <div style="background: var(--bg-secondary, #1a1a1a); border-radius: 8px; padding: 12px; font-size: 12px; color: var(--text-secondary, #aaa);">
          <div id="imapHelpContent">Loading instructions...</div>
        </div>
      </div>
      <div id="imapError" style="display: none; padding: 0 16px 12px; color: #ff4444; font-size: 13px;"></div>
      <div id="imapSpinner" style="display: none; padding: 0 16px 12px; font-size: 13px; color: var(--text-secondary, #aaa);">
        <div class="spinner" style="display: inline-block; width: 14px; height: 14px; border: 2px solid #555; border-top-color: var(--accent, #ff6b35); border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 8px;"></div>
        Connecting securely...
      </div>
      <div style="padding: 0 16px 12px; font-size: 11px; color: var(--text-tertiary, #666);">
        🔒 Your app password is encrypted in transit and stored only in memory for this session.
      </div>
    `;

    this._addAgentMessageWithCard(`Connect your ${provider} account:`, card);

    setTimeout(() => {
      const emailInput = document.getElementById('imapEmailInput');
      const passwordInput = document.getElementById('imapPasswordInput');
      const connectBtn = document.getElementById('imapConnectBtn');
      const helpLink = document.getElementById('imapHelpLink');
      const helpPanel = document.getElementById('imapHelpPanel');
      const helpContent = document.getElementById('imapHelpContent');
      const errorDiv = document.getElementById('imapError');
      const spinnerDiv = document.getElementById('imapSpinner');

      if (emailInput) emailInput.focus();

      // Load instructions on help link click
      helpLink?.addEventListener('click', async (e) => {
        e.preventDefault();
        helpPanel.style.display = helpPanel.style.display === 'none' ? 'block' : 'none';
        if (helpPanel.style.display === 'block' && helpContent.textContent === 'Loading instructions...') {
          try {
            const res = await fetch(`/auth/imap/instructions/${providerKey}`);
            const data = await res.json();
            let html = `<strong>${data.provider} App Password</strong><ol style="margin: 8px 0; padding-left: 20px;">`;
            data.steps.forEach(step => { html += `<li style="margin: 4px 0;">${step}</li>`; });
            html += '</ol>';
            if (data.url) html += `<a href="${data.url}" target="_blank" rel="noopener" style="color: var(--accent, #ff6b35);">${data.url}</a><br>`;
            if (data.note) html += `<em style="font-size: 11px;">${data.note}</em>`;
            helpContent.innerHTML = html;
          } catch (err) {
            helpContent.textContent = 'Check your email provider settings for "App Passwords".';
          }
        }
      });

      // Connect button handler
      const handleConnect = async () => {
        const email = emailInput?.value.trim();
        const password = passwordInput?.value.trim();

        if (!email || !email.includes('@')) {
          errorDiv.style.display = 'block';
          errorDiv.textContent = 'Please enter a valid email address.';
          return;
        }
        if (!password) {
          errorDiv.style.display = 'block';
          errorDiv.textContent = 'Please enter your app password.';
          return;
        }

        errorDiv.style.display = 'none';
        spinnerDiv.style.display = 'block';
        connectBtn.disabled = true;
        connectBtn.textContent = 'Connecting...';

        try {
          const res = await fetch('/auth/imap/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, sessionId: this.sessionId || undefined }),
          });
          const data = await res.json();

          if (data.success) {
            spinnerDiv.style.display = 'none';
            this.sessionId = data.sessionId;
            this.session.email = data.email;
            this.session.emailProvider = provider;
            this.session.connectedOrders = true;
            this.session.connectionType = 'imap';

            const msg = `Connected to ${data.email}! Scanning for recent orders...`;
            this._addAgentMessage(msg);
            await this.speech.speak(msg);

            await this._showTyping(1800);
            await this._searchRealOrders();
          } else {
            spinnerDiv.style.display = 'none';
            connectBtn.disabled = false;
            connectBtn.textContent = 'Connect';
            errorDiv.style.display = 'block';
            errorDiv.textContent = data.error || 'Connection failed. Please check your credentials.';
          }
        } catch (err) {
          spinnerDiv.style.display = 'none';
          connectBtn.disabled = false;
          connectBtn.textContent = 'Connect';
          errorDiv.style.display = 'block';
          errorDiv.textContent = 'Connection failed. Please check your internet connection and try again.';
        }
      };

      connectBtn?.addEventListener('click', handleConnect);
      passwordInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleConnect(); });
    }, 100);
  }

  async _showManualEmailInput() {
    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot blue"></div>
        <div class="card-title">Enter Your Email</div>
      </div>
      <div class="card-input-row">
        <input type="email" class="card-input" id="manualEmailInput" placeholder="your@email.com" autocomplete="email">
        <button class="card-input-btn" id="manualEmailSubmit">Connect</button>
      </div>
    `;
    this._addAgentMessageWithCard('Enter the email associated with your orders:', card);

    setTimeout(() => {
      const input = document.getElementById('manualEmailInput');
      const submit = document.getElementById('manualEmailSubmit');
      if (input) input.focus();
      const handleSubmit = () => {
        const val = input.value.trim();
        if (val && val.includes('@')) {
          this._simulateEmailConnect('Email', val);
        }
      };
      submit?.addEventListener('click', handleSubmit);
      input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSubmit(); });
    }, 100);
  }

  async _handleEmailIdentification(intent, text) {
    const lower = text.toLowerCase();
    // Check provider keywords first (same fix as _handleEmailChoice)
    if (lower.includes('gmail') || lower.includes('google') || /g\s*mail/i.test(lower)) {
      await this._connectEmail('Gmail');
    } else if (lower.includes('outlook') || lower.includes('microsoft') || lower.includes('hotmail') || lower.includes('live.com')) {
      await this._connectEmail('Outlook');
    } else if (lower.includes('yahoo')) {
      await this._connectEmail('Yahoo');
    } else if (lower.includes('icloud') || lower.includes('apple mail')) {
      await this._connectEmail('iCloud');
    } else if (lower.includes('proton') || lower.includes('protonmail')) {
      await this._connectEmail('ProtonMail');
    } else if (lower.includes('aol')) {
      await this._connectEmail('AOL');
    } else if (lower.includes('order') || lower.includes('manual') || lower.includes('id')) {
      this._showOrderIdInput();
    } else if (text.includes('@')) {
      await this._simulateEmailConnect('Email', text.trim());
    } else if (intent.intent === 'yes') {
      const msg = "Great! Which email would you like to connect \u2014 Gmail, Outlook, Yahoo, iCloud, or another provider?";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    } else {
      const msg = "Would you like to connect Gmail, Outlook, Yahoo, iCloud, or enter an email/order ID manually?";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    }
  }

  async _simulateEmailConnect(provider, email) {
    this.state = 'scanning_orders';
    this.session.emailProvider = provider;
    this.session.email = email;

    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="gmail-sim">
        <div class="gmail-sim-logo">${provider === 'Gmail' ? 'Google' : provider === 'Outlook' ? 'Microsoft' : provider === 'Yahoo' ? 'Yahoo' : provider === 'iCloud' ? 'Apple' : provider === 'ProtonMail' ? 'ProtonMail' : provider === 'AOL' ? 'AOL' : 'Email'}</div>
        <div class="gmail-sim-text">ReturnClaw wants to access your ${provider} account to find order confirmations</div>
        <div class="gmail-sim-perms">
          <div><span class="check">✓</span> Read order confirmation emails</div>
          <div><span class="check">✓</span> Search for shipping receipts</div>
        </div>
        <div class="gmail-sim-spinner">
          <div class="spinner"></div>
          Connecting securely...
        </div>
      </div>
    `;

    this._addAgentMessageWithCard(`Connecting to ${provider}...`, card);
    await this._delay(2200);

    this.session.connectedOrders = true;

    const connectedMsg = `Connected to ${email} — scanning for recent orders...`;
    this._addAgentMessage(connectedMsg);
    await this.speech.speak(connectedMsg);

    await this._showTyping(1800);
    await this._showFoundOrders();
  }

  async _showFoundOrders() {
    // Filter orders for current retailer if we have one
    let orders = MOCK_ORDERS;
    if (this.context.retailer) {
      orders = MOCK_ORDERS.filter(o => o.retailer === this.context.retailer);
      if (orders.length === 0) orders = MOCK_ORDERS.slice(0, 3); // fallback
    } else {
      orders = MOCK_ORDERS.slice(0, 5);
    }

    const msg = `Found ${orders.length} recent order${orders.length > 1 ? 's' : ''}. Which one are you returning?`;

    const card = document.createElement('div');
    card.className = 'action-card';
    let html = `
      <div class="card-header">
        <div class="card-status-dot green"></div>
        <div class="card-title">Found ${orders.length} Recent Orders</div>
      </div>
      <div class="order-select-list">
    `;

    orders.forEach((order, idx) => {
      const r = RETAILERS[order.retailer];
      const dateStr = formatMonthDay(getRecentDate(order.daysAgo));
      html += `
        <div class="order-select-item" data-found-idx="${idx}">
          <div class="order-thumb">${order.emoji}</div>
          <div class="order-info">
            <div class="order-item-name">${order.item}</div>
            <div class="order-meta">${r.name} — ${dateStr} · $${order.price.toFixed(2)}<br>Order #${order.orderId}</div>
          </div>
          <span class="select-indicator">Select →</span>
        </div>
      `;
    });

    html += '</div>';
    card.innerHTML = html;
    this._addAgentMessageWithCard(msg, card);
    await this.speech.speak(msg);

    this._foundOrders = orders;
    this.state = 'selecting_order';

    setTimeout(() => {
      card.querySelectorAll('.order-select-item').forEach(el => {
        el.addEventListener('click', () => {
          const idx = parseInt(el.dataset.foundIdx);
          this._selectFoundOrder(idx);
        });
      });
    }, 50);
  }

  async _selectFoundOrder(idx) {
    const order = this._foundOrders[idx];
    this.context.retailer = order.retailer;
    this.context.item = order.item;
    this.context.emoji = order.emoji;
    this.context.orderId = order.orderId;
    this.context.price = order.price;
    this.context.orderDate = getRecentDate(order.daysAgo);
    this.context.daysRemaining = getDaysRemaining(order.retailer);

    const r = RETAILERS[order.retailer];
    const confirmMsg = `Selected: ${order.item} from ${r.name}, $${order.price.toFixed(2)}. Order #${order.orderId}.`;

    const orderCard = this._createOrderCard();
    this._addAgentMessageWithCard(confirmMsg, orderCard);
    await this.speech.speak(confirmMsg);

    await this._delay(300);

    // If we haven't picked a reason yet, ask now
    if (!this.context.returnReason) {
      await this._showReasonSelector();
    } else {
      await this._showRefundOptions();
    }
  }

  _showOrderIdInput() {
    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot blue"></div>
        <div class="card-title">Enter Order ID</div>
      </div>
      <div class="card-input-row">
        <input type="text" class="card-input" id="orderIdInput" placeholder="e.g., 114-1234567-1234567" autocomplete="off">
        <button class="card-input-btn" id="orderIdSubmit">Find</button>
      </div>
    `;

    this._addAgentMessageWithCard("Enter your order ID below:", card);
    this.state = 'awaiting_order_id';

    setTimeout(() => {
      const input = document.getElementById('orderIdInput');
      const submit = document.getElementById('orderIdSubmit');
      if (input) input.focus();
      const handleSubmit = () => {
        const val = input.value.trim();
        if (val) this._handleUserInput(val);
      };
      submit?.addEventListener('click', handleSubmit);
      input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSubmit(); });
    }, 100);
  }

  async _handleEmailChoice(intent, text) {
    const lower = text.toLowerCase();

    // BUG 3 FIX: Check for email provider keywords FIRST before intent type
    // This ensures "yes gmail" or "yes, gmail please" matches Gmail, not just "yes"
    if (lower.includes('gmail') || lower.includes('google') || /g\s*mail/i.test(lower) || /jean\s*mail/i.test(lower)) {
      await this._connectEmail('Gmail');
    } else if (lower.includes('outlook') || lower.includes('microsoft') || lower.includes('hotmail') || lower.includes('live.com') || /out\s*look/i.test(lower)) {
      await this._connectEmail('Outlook');
    } else if (lower.includes('yahoo')) {
      await this._connectEmail('Yahoo');
    } else if (lower.includes('icloud') || lower.includes('apple mail') || lower.includes('apple')) {
      await this._connectEmail('iCloud');
    } else if (lower.includes('proton') || lower.includes('protonmail')) {
      await this._connectEmail('ProtonMail');
    } else if (lower.includes('aol')) {
      await this._connectEmail('AOL');
    } else if (lower.includes('manual') || lower.includes('myself') || lower.includes('enter') || lower.includes('skip') || lower.includes('type')) {
      await this._startManualFlow();
    } else if (lower.includes('order') || lower.includes('id')) {
      this._showOrderIdInput();
    } else if (text.includes('@')) {
      await this._simulateEmailConnect('Email', text.trim());
    } else if (intent.intent === 'yes') {
      // BUG 4 FIX: "yes" alone should ask which provider, not default to Gmail
      const msg = "Great! Which email would you like to connect \u2014 Gmail, Outlook, Yahoo, iCloud, or another provider?";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    } else if (intent.intent === 'no') {
      await this._startManualFlow();
    } else if (intent.intent === 'return' || intent.intent === 'policy_inquiry') {
      // User jumped ahead — go to manual flow and process their intent
      this.state = 'awaiting_item';
      await this._handleAwaitingItem(intent, text);
    } else if (this._getDomainIntentResponse(intent)) {
      // User asked a domain question instead of connecting — answer it
      await this._handleDomainQuestion(intent);
    } else {
      const msg = "Would you like to connect Gmail, Outlook, Yahoo, iCloud, or enter your details manually?";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    }
  }

  async _handleOrderId(intent, text) {
    this.context.orderId = text.replace(/^#/, '').trim().toUpperCase() || generateOrderId(this.context.retailer);
    this.context.orderDate = getRecentDate();

    await this._showTyping(1000);

    const priceStr = this.context.price ? `, $${this.context.price.toFixed(2)}` : '';
    const foundMsg = `Found it — order #${this.context.orderId}. ${this.context.item}${priceStr}, ordered ${formatDate(this.context.orderDate)}. Is this correct?`;
    const orderCard = this._createOrderCard();
    this._addAgentMessageWithCard(foundMsg, orderCard);
    await this.speech.speak(foundMsg);

    this.state = 'awaiting_order_confirm';
    this._startListeningAfterDelay();
  }

  _createOrderCard() {
    const r = RETAILERS[this.context.retailer];
    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot green"></div>
        <div class="card-title">Order Found</div>
      </div>
      <div class="card-body">
        <div class="order-detail">
          <div class="order-thumb">${this.context.emoji}</div>
          <div class="order-info">
            <div class="order-item-name">${this.context.item}</div>
            <div class="order-meta">${r.name}${this.context.price ? ' · $' + this.context.price.toFixed(2) : ''}</div>
          </div>
        </div>
        <div class="card-divider"></div>
        <div class="card-row">
          <span class="card-row-label">Order ID</span>
          <span class="card-row-value">#${this.context.orderId}</span>
        </div>
        <div class="card-row">
          <span class="card-row-label">Order Date</span>
          <span class="card-row-value">${formatDate(this.context.orderDate)}</span>
        </div>
      </div>
    `;
    return card;
  }

  async _handleOrderConfirm(intent, text) {
    if (intent.intent === 'yes' || /yes|yeah|sure|correct|that's (it|the one|right)|right|yep/i.test(text.toLowerCase())) {
      if (!this.context.returnReason) {
        await this._showReasonSelector();
      } else {
        await this._showRefundOptions();
      }
    } else if (intent.intent === 'no') {
      this._showOrderIdInput();
    } else {
      const msg = "Is this the correct order? Say yes or no.";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    }
  }

  // ---- Refund Method Selection ----
  async _showRefundOptions() {
    const r = RETAILERS[this.context.retailer];
    const isDefective = this.context.returnReason?.id === 'defective';

    const msg = "How would you like your refund?";

    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot blue"></div>
        <div class="card-title">How would you like your refund?</div>
      </div>
      <div class="card-btn-group">
        <button class="refund-option" data-refund="original">
          <div class="refund-option-title">💳 Original payment method</div>
          <div class="refund-option-desc">Back to your original payment method</div>
          <div class="refund-option-time">3–5 business days</div>
        </button>
        <button class="refund-option" data-refund="store_credit">
          <div class="refund-option-title">🏷️ Store credit</div>
          <div class="refund-option-desc">${r.name} Gift Card balance</div>
          <div class="refund-option-time">Instant — available immediately</div>
        </button>
        ${isDefective ? `<button class="refund-option" data-refund="exchange">
          <div class="refund-option-title">🔄 Exchange for replacement</div>
          <div class="refund-option-desc">Same item, ships in 1–2 days</div>
          <div class="refund-option-time">Free expedited shipping</div>
        </button>` : `<button class="refund-option" data-refund="exchange">
          <div class="refund-option-title">🔄 Exchange for replacement</div>
          <div class="refund-option-desc">Same item, ships in 1–2 days</div>
          <div class="refund-option-time">Standard shipping</div>
        </button>`}
      </div>
    `;

    this._addAgentMessageWithCard(msg, card);
    await this.speech.speak(msg);
    this.state = 'selecting_refund';

    setTimeout(() => {
      card.querySelectorAll('.refund-option').forEach(btn => {
        btn.addEventListener('click', () => {
          this._selectRefundMethod(btn.dataset.refund);
        });
      });
    }, 50);
  }

  async _selectRefundMethod(method) {
    this.context.refundMethod = method;
    this.session.preferredRefundMethod = method; // Remember preference for future returns

    const methodNames = {
      'original': 'original payment method',
      'store_credit': 'store credit (instant)',
      'exchange': 'replacement exchange'
    };

    const msg = `Great — ${methodNames[method]}. Let me generate your return.`;
    this._addAgentMessage(msg);
    await this.speech.speak(msg);

    await this._delay(300);
    await this._showReturnLink();
  }

  async _handleRefundSelection(intent, text) {
    const lower = text.toLowerCase();
    if (lower.includes('original') || lower.includes('card') || lower.includes('visa') || lower.includes('payment')) {
      await this._selectRefundMethod('original');
    } else if (lower.includes('credit') || lower.includes('gift') || lower.includes('store') || lower.includes('instant')) {
      await this._selectRefundMethod('store_credit');
    } else if (lower.includes('exchange') || lower.includes('replace') || lower.includes('swap')) {
      await this._selectRefundMethod('exchange');
    } else {
      await this._selectRefundMethod('original');
    }
  }

  // ---- Return Link & Carrier Options ----
  async _showReturnLink() {
    const r = RETAILERS[this.context.retailer];
    this._setPipelineStep('execution', 'done');
    this._setPipelineStep('carrier', 'active');

    if (!this.context.orderId) {
      this.context.orderId = generateOrderId(this.context.retailer);
    }
    if (!this.context.price) {
      this.context.price = [29.99, 49.99, 79.99, 99.99, 149.99, 249.99][Math.floor(Math.random() * 6)];
    }
    if (!this.context.orderDate) {
      this.context.orderDate = getRecentDate();
    }

    // Try to get real deep link in live mode
    let returnUrl = r.returnUrl;
    if (isLiveMode) {
      const realUrl = await this._generateRealReturnLink();
      if (realUrl) returnUrl = realUrl;
    }

    const msg = "I've generated your return link. Click below to open the return page and follow the steps.";

    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot green"></div>
        <div class="card-title">Return Link Ready</div>
      </div>
      <div class="card-body">
        <div class="card-row">
          <span class="card-row-label">Retailer</span>
          <span class="card-row-value">${r.name} Returns Center</span>
        </div>
        <div class="card-row">
          <span class="card-row-label">Order</span>
          <span class="card-row-value">#${this.context.orderId}</span>
        </div>
        <div class="card-divider"></div>
        <a href="${returnUrl}" target="_blank" rel="noopener noreferrer" class="card-btn primary" style="text-decoration:none; margin-top: 0.5rem;">
          Open Return Page →
        </a>
        <div class="card-divider"></div>
        <ul class="steps-list">
          <li><span class="step-num">1</span> Sign in to ${r.name}</li>
          <li><span class="step-num">2</span> Select item to return</li>
          <li><span class="step-num">3</span> Choose return reason</li>
          <li><span class="step-num">4</span> Print or save return label</li>
        </ul>
      </div>
    `;

    this._addAgentMessageWithCard(msg, card);
    await this.speech.speak(msg);

    await this._delay(800);

    const followUp = "After you've submitted the return, would you like help with shipping? I can find a drop-off location or schedule a pickup.";
    this._addAgentMessage(followUp);
    await this.speech.speak(followUp);

    await this._delay(300);
    await this._showCarrierOptions();
  }

  async _showCarrierOptions() {
    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot blue"></div>
        <div class="card-title">How would you like to return it?</div>
      </div>
      <div class="card-btn-group">
        <button class="card-btn secondary" id="dropoffBtn">
          <span class="card-btn-icon">📍</span>
          Find Drop-off Location
        </button>
        <button class="card-btn secondary" id="pickupBtn">
          <span class="card-btn-icon">🏠</span>
          Schedule Home Pickup
        </button>
        <button class="card-btn outline" id="selfShipBtn">
          <span class="card-btn-icon">📋</span>
          I'll Handle Shipping
        </button>
      </div>
    `;

    this._addAgentMessageWithCard('', card);
    this.state = 'awaiting_carrier_choice';

    setTimeout(() => {
      document.getElementById('dropoffBtn')?.addEventListener('click', () => this._handleCarrierSelect('dropoff'));
      document.getElementById('pickupBtn')?.addEventListener('click', () => this._handleCarrierSelect('pickup'));
      document.getElementById('selfShipBtn')?.addEventListener('click', () => this._handleCarrierSelect('self'));
    }, 50);
  }

  async _handleCarrierChoice(intent, text) {
    const lower = text.toLowerCase();
    if (lower.includes('drop') || lower.includes('location') || lower.includes('find')) {
      await this._handleCarrierSelect('dropoff');
    } else if (lower.includes('pickup') || lower.includes('pick up') || lower.includes('home') || lower.includes('schedule')) {
      await this._handleCarrierSelect('pickup');
    } else if (lower.includes('handle') || lower.includes('myself') || lower.includes('self') || lower.includes('skip') || intent.intent === 'no') {
      await this._handleCarrierSelect('self');
    } else {
      const msg = "Would you like me to find a drop-off location, schedule a home pickup, or will you handle shipping yourself?";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    }
  }

  async _handleCarrierSelect(choice) {
    this.context.carrierChoice = choice;
    this.session.preferredCarrier = choice; // Remember preference for future returns

    if (choice === 'dropoff') {
      const msg = "What's your zip code? I'll find nearby drop-off locations.";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this.state = 'awaiting_zipcode';
      this._startListeningAfterDelay();
    } else if (choice === 'pickup') {
      // Need address for pickup
      await this._showAddressForm();
    } else {
      await this._offerSmsTracking();
    }
  }

  // ---- Address Confirmation ----
  async _showAddressForm() {
    // If we already have an address, confirm it
    if (this.session.address) {
      const addr = this.session.address;
      const msg = `You mentioned you're at ${addr.street}${addr.apt ? ' Apt ' + addr.apt : ''}, ${addr.city}, ${addr.state} ${addr.zip} — should I use the same address?`;
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this.state = 'awaiting_address_confirm';
      this._startListeningAfterDelay();
      return;
    }

    const msg = "What address should I use for the pickup?";

    const card = document.createElement('div');
    card.className = 'action-card';
    card.innerHTML = `
      <div class="card-header">
        <div class="card-status-dot blue"></div>
        <div class="card-title">📍 Confirm Your Address</div>
      </div>
      <div class="address-form">
        <div class="address-row">
          <input type="text" class="card-input" id="addrStreet" placeholder="Street address" autocomplete="address-line1">
        </div>
        <div class="address-row">
          <input type="text" class="card-input md" id="addrApt" placeholder="Apt / Suite" autocomplete="address-line2">
          <input type="text" class="card-input" id="addrCity" placeholder="City" autocomplete="address-level2">
        </div>
        <div class="address-row">
          <input type="text" class="card-input sm" id="addrState" placeholder="State" maxlength="2" autocomplete="address-level1">
          <input type="text" class="card-input sm" id="addrZip" placeholder="ZIP" maxlength="10" autocomplete="postal-code">
        </div>
        <button class="card-btn primary" id="addrSubmit" style="margin-top: 0.375rem;">Use This Address</button>
      </div>
      <div class="card-hint">Or say your address and I'll fill it in automatically.</div>
    `;

    this._addAgentMessageWithCard(msg, card);
    await this.speech.speak(msg);
    this.state = 'confirming_address';

    setTimeout(() => {
      document.getElementById('addrStreet')?.focus();
      document.getElementById('addrSubmit')?.addEventListener('click', () => {
        const street = document.getElementById('addrStreet')?.value.trim();
        const apt = document.getElementById('addrApt')?.value.trim();
        const city = document.getElementById('addrCity')?.value.trim();
        const state = document.getElementById('addrState')?.value.trim();
        const zip = document.getElementById('addrZip')?.value.trim();
        if (street && city && state && zip) {
          this._confirmAddress({ street, apt, city, state, zip });
        }
      });
    }, 100);
  }

  async _handleAddressInput(intent, text) {
    // Try to parse a spoken address
    if (intent.intent === 'address' || text.length > 10) {
      // Simple address parsing: assume format "123 Main St, Denver, CO 80202"
      const parts = text.split(',').map(p => p.trim());
      let street = parts[0] || text;
      let city = parts[1] || '';
      let stateZip = (parts[2] || '').trim().split(/\s+/);
      let state = stateZip[0] || '';
      let zip = stateZip[1] || '';

      // If we couldn't parse a full address, ask for clarification
      if (!city || !state || !zip) {
        const msg = "I got the street address. Could you also provide the city, state, and zip code?";
        this._addAgentMessage(msg);
        await this.speech.speak(msg);
        this._startListeningAfterDelay();
        return;
      }

      const address = { street, apt: '', city, state: state.toUpperCase(), zip };
      await this._confirmAddress(address);
    } else {
      const msg = "Please provide your full street address, or fill out the form above.";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    }
  }

  async _confirmAddress(address) {
    this.session.address = address;
    const fullAddr = `${address.street}${address.apt ? ', Apt ' + address.apt : ''}, ${address.city}, ${address.state} ${address.zip}`;
    const msg = `Got it — ${fullAddr}. Is that correct?`;
    this._addAgentMessage(msg);
    await this.speech.speak(msg);
    this.state = 'awaiting_address_confirm';
    this._startListeningAfterDelay();
  }

  async _handleAddressConfirm(intent, text) {
    if (intent.intent === 'yes' || /yes|yeah|sure|correct|right|yep|looks good|good/i.test(text.toLowerCase())) {
      await this._showPickupConfirmation();
    } else if (intent.intent === 'no') {
      this.session.address = null;
      await this._showAddressForm();
    } else {
      const msg = "Is the address correct? Say yes or no.";
      this._addAgentMessage(msg);
      await this.speech.speak(msg);
      this._startListeningAfterDelay();
    }
  }

  async _handleZipcode(intent, text) {
    const zip = text.replace(/\D/g, '').slice(0, 5);
    if (zip.length === 5) {
      await this._showDropoffLocations(zip);
    } else if (intent.intent === 'zipcode') {
      await this._showDropoffLocations(intent.value);
    } else {
      const anyZip = text.replace(/[^0-9]/g, '');
      if (anyZip.length >= 5) {
        await this._showDropoffLocations(anyZip.slice(0, 5));
      } else {
        const msg = "Please enter a 5-digit zip code so I can find nearby locations.";
        this._addAgentMessage(msg);
        await this.speech.speak(msg);
        this._startListeningAfterDelay();
      }
    }
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
          <input type="tel" class="card-input" id="phoneInput" placeholder="(555) 123-4567" autocomplete="tel">
          <button class="card-input-btn" id="phoneSubmit">Enable</button>
        </div>
        <ul class="sms-benefits">
          <li>Pickup confirmation</li>
          <li>Package scanned by carrier</li>
          <li>Delivered to return center</li>
          <li>Refund processed</li>
        </ul>
        <div class="card-divider"></div>
        <button class="card-btn outline" id="skipSmsBtn">Skip — continue without SMS</button>
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

    const card = this._createMultiItemCard();
    this._addAgentMessageWithCard(msg, card);
    await this.speech.speak(msg);

    this.state = 'multi_item_select';
  }

  _createMultiItemCard() {
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
        <div class="multi-item-list">
    `;

    this.multiItems.forEach((item, idx) => {
      if (item.eligible) {
        html += `
          <div class="multi-item-row">
            <div class="multi-item-check ${item.checked ? 'checked' : ''}" data-multi-idx="${idx}">✓</div>
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
        <button class="card-btn primary" id="returnSelectedBtn" style="margin-top:0.5rem;">Return Selected Items</button>
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
        <button class="card-btn primary" id="startAnotherBtn">
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
      tracking: this.context.trackingNumber
    });

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
    // BUG 7 FIX: Never silently drop input — always acknowledge and redirect
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
  }

  _resetPipeline() {
    ['triage', 'policy', 'execution', 'carrier'].forEach(s => this._setPipelineStep(s, null));
    this.pipeline.classList.remove('visible');
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
    landingOrbContainer.addEventListener('click', () => {
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
