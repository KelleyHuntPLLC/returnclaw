/**
 * ReturnClaw — Backend Server
 * Copyright (c) 2026 Kelley Hunt, PLLC. All rights reserved.
 *
 * Handles: Gmail OAuth, email search, order extraction, return policy lookup
 */

const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const { ImapFlow } = require('imapflow');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// Google OAuth Configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/auth/google/callback`
);

// In-memory session store (use Redis in production)
const sessions = new Map();

// ============================================
// IMAP EMAIL CONNECTION (No Google Cloud needed)
// ============================================

// IMAP server configs for major providers
const IMAP_CONFIGS = {
  'gmail.com': { host: 'imap.gmail.com', port: 993, secure: true },
  'googlemail.com': { host: 'imap.gmail.com', port: 993, secure: true },
  'outlook.com': { host: 'outlook.office365.com', port: 993, secure: true },
  'hotmail.com': { host: 'outlook.office365.com', port: 993, secure: true },
  'live.com': { host: 'outlook.office365.com', port: 993, secure: true },
  'yahoo.com': { host: 'imap.mail.yahoo.com', port: 993, secure: true },
  'yahoo.co.uk': { host: 'imap.mail.yahoo.com', port: 993, secure: true },
  'aol.com': { host: 'imap.aol.com', port: 993, secure: true },
  'icloud.com': { host: 'imap.mail.me.com', port: 993, secure: true },
  'me.com': { host: 'imap.mail.me.com', port: 993, secure: true },
  'mac.com': { host: 'imap.mail.me.com', port: 993, secure: true },
  'protonmail.com': { host: '127.0.0.1', port: 1143, secure: false, note: 'Requires ProtonMail Bridge' },
  'proton.me': { host: '127.0.0.1', port: 1143, secure: false, note: 'Requires ProtonMail Bridge' },
};

function getImapConfig(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  return IMAP_CONFIGS[domain] || null;
}

// ============================================
// HEALTH CHECK
// ============================================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mode: 'live', version: '0.7.0' });
});

// ============================================
// AUTH ROUTES
// ============================================

// Generate OAuth URL for Gmail
app.get('/auth/google', (req, res) => {
  const sessionId = req.query.session || crypto.randomUUID();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state: sessionId,
    prompt: 'consent',
  });
  res.json({ url, sessionId });
});

// OAuth callback
app.get('/auth/google/callback', async (req, res) => {
  try {
    const { code, state: sessionId } = req.query;
    const { tokens } = await oauth2Client.getToken(code);

    // Get user email
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    // Store session
    sessions.set(sessionId, {
      tokens,
      email: userInfo.email,
      connectedAt: new Date(),
    });

    // Close popup and notify parent window
    res.send(`
      <html><body>
        <script>
          window.opener.postMessage({
            type: 'oauth_complete',
            sessionId: '${sessionId}',
            email: '${userInfo.email}'
          }, window.location.origin);
          window.close();
        </script>
        <p>Connected! You can close this window.</p>
      </body></html>
    `);
  } catch (error) {
    console.error('OAuth error:', error);
    res.status(500).send('Authentication failed. Please try again.');
  }
});

// Check connection status
app.get('/auth/status/:sessionId', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (session) {
    res.json({ connected: true, email: session.email });
  } else {
    res.json({ connected: false });
  }
});

// ============================================
// IMAP ROUTES
// ============================================

// Connect via IMAP
app.post('/auth/imap/connect', async (req, res) => {
  try {
    const { email, password, sessionId } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and app password are required.' });
    }

    const config = getImapConfig(email);
    if (!config) {
      const domain = email.split('@')[1];
      return res.status(400).json({
        error: `I don't have IMAP settings for ${domain} yet. Try Gmail, Outlook, Yahoo, or iCloud.`,
        supportedProviders: Object.keys(IMAP_CONFIGS)
      });
    }

    // Test the connection
    const client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: email, pass: password },
      logger: false,
    });

    await client.connect();

    // Connection successful — store session
    const sid = sessionId || crypto.randomUUID();
    sessions.set(sid, {
      type: 'imap',
      email,
      password, // stored in memory only, never persisted
      imapConfig: config,
      connectedAt: new Date(),
    });

    await client.logout();

    res.json({
      success: true,
      sessionId: sid,
      email,
      message: `Connected to ${email} successfully.`
    });
  } catch (error) {
    console.error('IMAP connection error:', error.message);

    let userMessage = 'Connection failed.';
    if (error.message.includes('Invalid credentials') || error.authenticationFailed) {
      userMessage = 'Invalid email or app password. Make sure you\'re using an app-specific password, not your regular password. For Gmail: myaccount.google.com/apppasswords';
    } else if (error.message.includes('AUTHENTICATIONFAILED')) {
      userMessage = 'Authentication failed. Please generate an app-specific password for ReturnClaw.';
    } else if (error.message.includes('ETIMEDOUT') || error.message.includes('ECONNREFUSED')) {
      userMessage = 'Could not reach the email server. Please check your internet connection.';
    }

    res.status(401).json({ error: userMessage });
  }
});

// Shared IMAP search logic (used by both /api/imap/search and /api/email/search)
async function searchViaImap(session, retailer, maxResults = 10) {
  const client = new ImapFlow({
    host: session.imapConfig.host,
    port: session.imapConfig.port,
    secure: session.imapConfig.secure,
    auth: { user: session.email, pass: session.password },
    logger: false,
  });

  await client.connect();

  const lock = await client.getMailboxLock('INBOX');

  try {
    const searchCriteria = {
      since: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
    };

    const orKeywords = ['order confirmation', 'your order', 'order shipped', 'shipping confirmation'];

    const retailerFromMap = {
      amazon: 'amazon.com',
      walmart: 'walmart.com',
      target: 'target.com',
      bestbuy: 'bestbuy.com',
      apple: 'apple.com',
      nike: 'nike.com',
      costco: 'costco.com',
      nordstrom: 'nordstrom.com',
    };

    let messages = [];

    for (const keyword of orKeywords) {
      const found = await client.search({
        ...searchCriteria,
        subject: keyword,
        ...(retailer && retailerFromMap[retailer.toLowerCase()] ? { from: retailerFromMap[retailer.toLowerCase()] } : {}),
      });

      for (const uid of found.slice(0, maxResults)) {
        if (!messages.find(m => m.uid === uid)) {
          messages.push({ uid });
        }
      }

      if (messages.length >= maxResults) break;
    }

    const orders = [];
    for (const msg of messages.slice(0, maxResults)) {
      const fetched = await client.fetchOne(msg.uid, {
        envelope: true,
        bodyStructure: true,
        source: { maxBytes: 50000 },
      });

      if (fetched) {
        const subject = fetched.envelope?.subject || '';
        const from = fetched.envelope?.from?.[0]?.address || '';
        const date = fetched.envelope?.date?.toISOString() || '';
        const bodyText = fetched.source?.toString('utf-8') || '';

        const order = extractOrderFromEmail(subject, from, bodyText, date);
        if (order) {
          orders.push(order);
        }
      }
    }

    return orders;
  } finally {
    lock.release();
    await client.logout();
  }
}

// Search emails via IMAP
app.post('/api/imap/search', async (req, res) => {
  try {
    const { sessionId, query, retailer, maxResults = 10 } = req.body;
    const session = sessions.get(sessionId);

    if (!session || session.type !== 'imap') {
      return res.status(401).json({ error: 'Not connected. Please connect your email first.' });
    }

    const orders = await searchViaImap(session, retailer, maxResults);
    res.json({ orders, count: orders.length });
  } catch (error) {
    console.error('IMAP search error:', error.message);
    res.status(500).json({ error: 'Failed to search emails. Please try reconnecting.' });
  }
});

// Get app password instructions for a provider
app.get('/auth/imap/instructions/:provider', (req, res) => {
  const instructions = {
    gmail: {
      provider: 'Gmail',
      steps: [
        'Go to myaccount.google.com/apppasswords',
        'Sign in if prompted',
        'Select "Other (Custom name)" and type "ReturnClaw"',
        'Click "Generate"',
        'Copy the 16-character password shown',
        'Paste it here — you won\'t need to remember it'
      ],
      url: 'https://myaccount.google.com/apppasswords',
      note: 'Requires 2-Step Verification to be enabled on your Google account.'
    },
    outlook: {
      provider: 'Outlook / Hotmail',
      steps: [
        'Go to account.microsoft.com/security',
        'Click "Advanced security options"',
        'Under "App passwords", click "Create a new app password"',
        'Copy the generated password',
        'Paste it here'
      ],
      url: 'https://account.microsoft.com/security',
      note: 'Requires 2-Step Verification to be enabled.'
    },
    yahoo: {
      provider: 'Yahoo Mail',
      steps: [
        'Go to login.yahoo.com/account/security',
        'Click "Generate app password"',
        'Select "Other App" and type "ReturnClaw"',
        'Click "Generate"',
        'Copy the password shown'
      ],
      url: 'https://login.yahoo.com/account/security',
      note: 'Requires Account Key or 2-Step Verification.'
    },
    icloud: {
      provider: 'iCloud / Apple Mail',
      steps: [
        'Go to appleid.apple.com',
        'Sign in and go to "Sign-In and Security"',
        'Click "App-Specific Passwords"',
        'Click "+" to generate a new password',
        'Name it "ReturnClaw" and click "Create"',
        'Copy the generated password'
      ],
      url: 'https://appleid.apple.com',
      note: 'Requires Two-Factor Authentication to be enabled.'
    },
    aol: {
      provider: 'AOL Mail',
      steps: [
        'Go to login.aol.com/account/security',
        'Click "Generate app password"',
        'Select "Other App" and type "ReturnClaw"',
        'Copy the generated password'
      ],
      url: 'https://login.aol.com/account/security',
      note: 'Requires 2-Step Verification.'
    },
  };

  const provider = req.params.provider.toLowerCase();
  res.json(instructions[provider] || {
    provider: req.params.provider,
    steps: ['Check your email provider\'s security settings for "App Passwords"'],
    note: 'Most providers require 2-Step Verification to be enabled first.'
  });
});

// Disconnect IMAP session
app.post('/auth/imap/disconnect', (req, res) => {
  const { sessionId } = req.body;
  if (sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    // Clear password from memory
    if (session.password) session.password = null;
    sessions.delete(sessionId);
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// ============================================
// EMAIL SEARCH ROUTES
// ============================================

// Search emails for orders (supports both OAuth and IMAP sessions)
app.post('/api/email/search', async (req, res) => {
  try {
    const { sessionId, query, retailer } = req.body;
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(401).json({ error: 'Not connected. Please authorize email access first.' });
    }

    // If session is IMAP type, use IMAP search logic
    if (session.type === 'imap') {
      try {
        const orders = await searchViaImap(session, retailer, 10);
        return res.json({ orders });
      } catch (imapErr) {
        console.error('IMAP search via /api/email/search:', imapErr.message);
        return res.status(500).json({ error: 'Failed to search emails. Please try reconnecting.' });
      }
    }

    // OAuth session — use Gmail API
    // Create a fresh auth client for this request
    const authClient = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/auth/google/callback`
    );
    authClient.setCredentials(session.tokens);
    const gmail = google.gmail({ version: 'v1', auth: authClient });

    // Build search query for order confirmation emails
    let searchQuery = 'subject:(order confirmation OR your order OR order shipped)';
    if (retailer) {
      const retailerDomains = {
        amazon: 'from:amazon.com',
        walmart: 'from:walmart.com',
        target: 'from:target.com',
        bestbuy: 'from:bestbuy.com',
        apple: 'from:apple.com',
        nike: 'from:nike.com',
        costco: 'from:costco.com',
        nordstrom: 'from:nordstrom.com',
        macys: 'from:macys.com',
        homedepot: 'from:homedepot.com',
      };
      const domain = retailerDomains[retailer.toLowerCase()];
      if (domain) searchQuery = `${domain} ${searchQuery}`;
    }
    if (query) {
      searchQuery += ` ${query}`;
    }
    searchQuery += ' newer_than:90d';

    // Search Gmail
    const { data: searchResults } = await gmail.users.messages.list({
      userId: 'me',
      q: searchQuery,
      maxResults: 10,
    });

    if (!searchResults.messages || searchResults.messages.length === 0) {
      return res.json({ orders: [], message: 'No order emails found matching your search.' });
    }

    // Fetch and parse each email
    const orders = [];
    for (const msg of searchResults.messages.slice(0, 5)) {
      const { data: email } = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      });

      const headers = email.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from = headers.find(h => h.name === 'From')?.value || '';
      const date = headers.find(h => h.name === 'Date')?.value || '';

      // Extract body text
      let body = '';
      if (email.payload.body?.data) {
        body = Buffer.from(email.payload.body.data, 'base64').toString('utf-8');
      } else if (email.payload.parts) {
        for (const part of email.payload.parts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            body = Buffer.from(part.body.data, 'base64').toString('utf-8');
            break;
          }
          if (part.mimeType === 'text/html' && part.body?.data) {
            body = Buffer.from(part.body.data, 'base64').toString('utf-8');
          }
        }
      }

      // Extract order details using patterns
      const order = extractOrderFromEmail(subject, from, body, date);
      if (order) {
        orders.push(order);
      }
    }

    res.json({ orders });
  } catch (error) {
    console.error('Email search error:', error);
    res.status(500).json({ error: 'Failed to search emails. Please try again.' });
  }
});

// ============================================
// ORDER EXTRACTION
// ============================================

function extractOrderFromEmail(subject, from, body, date) {
  const order = {
    subject,
    from,
    date: new Date(date).toISOString(),
    retailer: null,
    orderId: null,
    items: [],
    total: null,
  };

  // Detect retailer from sender
  const fromLower = from.toLowerCase();
  if (fromLower.includes('amazon')) order.retailer = 'Amazon';
  else if (fromLower.includes('walmart')) order.retailer = 'Walmart';
  else if (fromLower.includes('target')) order.retailer = 'Target';
  else if (fromLower.includes('bestbuy') || fromLower.includes('best buy')) order.retailer = 'Best Buy';
  else if (fromLower.includes('apple')) order.retailer = 'Apple';
  else if (fromLower.includes('nike')) order.retailer = 'Nike';
  else if (fromLower.includes('costco')) order.retailer = 'Costco';
  else if (fromLower.includes('nordstrom')) order.retailer = 'Nordstrom';
  else if (fromLower.includes('macys') || fromLower.includes("macy's")) order.retailer = "Macy's";
  else if (fromLower.includes('homedepot') || fromLower.includes('home depot')) order.retailer = 'Home Depot';
  else {
    // Try to extract from domain
    const domainMatch = from.match(/@([^>]+)/);
    if (domainMatch) order.retailer = domainMatch[1].split('.')[0];
  }

  // Extract Amazon order ID
  const amazonOrderMatch = body.match(/(\d{3}-\d{7}-\d{7})/);
  if (amazonOrderMatch) order.orderId = amazonOrderMatch[1];

  // Extract Walmart order ID
  const walmartOrderMatch = body.match(/order\s*#?\s*(\d{13,15})/i);
  if (!order.orderId && walmartOrderMatch) order.orderId = walmartOrderMatch[1];

  // Generic order ID pattern
  if (!order.orderId) {
    const genericOrderMatch = body.match(/order\s*(?:#|number|id)?\s*:?\s*([A-Z0-9-]{6,20})/i);
    if (genericOrderMatch) order.orderId = genericOrderMatch[1];
  }

  // Extract prices
  const priceMatches = body.match(/\$[\d,]+\.\d{2}/g);
  if (priceMatches) {
    // Last large price is usually the total
    const prices = priceMatches.map(p => parseFloat(p.replace(/[$,]/g, '')));
    order.total = Math.max(...prices);
  }

  // Extract item names from subject
  const subjectLower = subject.toLowerCase();
  if (subjectLower.includes('shipped') || subjectLower.includes('confirmation') || subjectLower.includes('your order')) {
    order.items.push(subject.replace(/order.*confirmation|your.*order|has shipped|shipping/gi, '').trim());
  }

  return order.retailer ? order : null;
}

// ============================================
// POLICY & RETURN ROUTES
// ============================================

// Get return policy for a retailer
app.get('/api/policy/:retailer', (req, res) => {
  const policies = {
    amazon: {
      retailer: 'Amazon', window: 30, freeReturn: true,
      methods: ['UPS Drop-off', 'Whole Foods Drop-off', "Kohl's Drop-off", 'UPS Pickup'],
      deepLinkTemplate: 'https://www.amazon.com/gp/orc/returns/homepage.html?orderID={orderId}',
      fallbackUrl: 'https://www.amazon.com/gp/css/returns/homepage.html',
      instructions: [
        'Click the return link below', 'Sign in to your Amazon account',
        'Select the item to return', 'Choose your return reason',
        'Select refund method', 'Choose return shipping method',
        'Print or save your label'
      ]
    },
    walmart: {
      retailer: 'Walmart', window: 90, freeReturn: true,
      methods: ['FedEx Drop-off', 'Walmart Store Return', 'FedEx Pickup'],
      deepLinkTemplate: 'https://www.walmart.com/orders/{orderId}',
      fallbackUrl: 'https://www.walmart.com/account/orders',
      instructions: [
        'Click the return link below', 'Sign in to Walmart',
        'Click "Start a return"', 'Select return reason',
        'Choose return method', 'Print return label'
      ]
    },
    target: {
      retailer: 'Target', window: 90, freeReturn: true,
      methods: ['Target Store Return', 'UPS Drop-off'],
      deepLinkTemplate: 'https://www.target.com/account/orders/details/{orderId}',
      fallbackUrl: 'https://www.target.com/account/orders',
      instructions: [
        'Click the return link', 'Sign in to Target',
        'Click "Return or exchange"', 'Select reason and refund method',
        'Choose mail or in-store return'
      ]
    },
    bestbuy: {
      retailer: 'Best Buy', window: 15, freeReturn: true,
      methods: ['Best Buy Store Return', 'UPS Shipping'],
      deepLinkTemplate: 'https://www.bestbuy.com/profile/ss/orders',
      fallbackUrl: 'https://www.bestbuy.com/profile/ss/orders',
      instructions: [
        'Click the link to your orders', 'Sign in to Best Buy',
        'Find your order', 'Click "Return or Exchange"',
        'Follow the prompts'
      ]
    },
    apple: {
      retailer: 'Apple', window: 14, freeReturn: true,
      methods: ['Apple Store Return', 'Mail Return'],
      deepLinkTemplate: 'https://secure.apple.com/shop/order/list',
      fallbackUrl: 'https://www.apple.com/shop/browse/open/salespolicies/returns_refunds',
      instructions: [
        'Click the link', 'Sign in with Apple ID',
        'Find order and click "Return Items"',
        'Follow guided process', 'Print prepaid label'
      ]
    },
    nike: {
      retailer: 'Nike', window: 30, freeReturn: true,
      methods: ['Nike Store Return', 'UPS Shipping'],
      deepLinkTemplate: 'https://www.nike.com/orders',
      fallbackUrl: 'https://www.nike.com/orders',
      instructions: [
        'Click the link', 'Sign in to Nike',
        'Click "Start Return"', 'Select reason',
        'Print prepaid UPS label'
      ]
    },
    costco: {
      retailer: 'Costco', window: 90, freeReturn: true,
      methods: ['Costco Store Return', 'Mail Return'],
      deepLinkTemplate: 'https://www.costco.com/my-account',
      fallbackUrl: 'https://www.costco.com/my-account',
      instructions: [
        'Sign in to Costco', 'Go to Orders & Returns',
        'Select item to return',
        'Or return in-store with membership card'
      ]
    },
    nordstrom: {
      retailer: 'Nordstrom', window: -1, freeReturn: true,
      methods: ['Nordstrom Store Return', 'USPS Shipping'],
      deepLinkTemplate: 'https://www.nordstrom.com/account/orders',
      fallbackUrl: 'https://www.nordstrom.com/account/orders',
      note: 'Flexible return policy — no strict deadline',
      instructions: [
        'Click the link', 'Sign in to Nordstrom',
        'Click "Start a Return"', 'Select items and reason',
        'Print prepaid USPS label'
      ]
    },
  };

  const key = req.params.retailer.toLowerCase().replace(/[^a-z]/g, '');
  const policy = policies[key];

  if (policy) {
    // Calculate days remaining if order date provided
    if (req.query.orderDate && policy.window > 0) {
      const orderDate = new Date(req.query.orderDate);
      const now = new Date();
      const daysSince = Math.floor((now - orderDate) / (1000 * 60 * 60 * 24));
      policy.daysRemaining = Math.max(0, policy.window - daysSince);
      policy.eligible = policy.daysRemaining > 0;
    } else {
      policy.eligible = true;
      policy.daysRemaining = policy.window;
    }

    res.json(policy);
  } else {
    res.json({
      retailer: req.params.retailer,
      window: 30,
      eligible: true,
      daysRemaining: 30,
      freeReturn: false,
      methods: ['Contact retailer directly'],
      fallbackUrl: `https://www.google.com/search?q=${encodeURIComponent(req.params.retailer)}+return+policy`,
      instructions: ['Visit the retailer\'s website', 'Navigate to their returns page', 'Follow their return process'],
      note: 'Policy not in our database yet — showing estimated defaults',
    });
  }
});

// Generate deep link for return
app.post('/api/return/link', (req, res) => {
  const { retailer, orderId } = req.body;
  const key = retailer.toLowerCase().replace(/[^a-z]/g, '');
  const templates = {
    amazon: 'https://www.amazon.com/gp/orc/returns/homepage.html?orderID={orderId}',
    walmart: 'https://www.walmart.com/orders/{orderId}',
    target: 'https://www.target.com/account/orders/details/{orderId}',
    bestbuy: 'https://www.bestbuy.com/profile/ss/orders',
    apple: 'https://secure.apple.com/shop/order/list',
    nike: 'https://www.nike.com/orders',
    costco: 'https://www.costco.com/my-account',
    nordstrom: 'https://www.nordstrom.com/account/orders',
  };

  const template = templates[key];
  let url;
  if (template && orderId) {
    url = template.replace('{orderId}', orderId);
  } else if (template) {
    url = template;
  } else {
    url = `https://www.google.com/search?q=${encodeURIComponent(retailer)}+returns`;
  }

  res.json({ url, retailer, orderId });
});

// ============================================
// SERVE FRONTEND
// ============================================

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🦞 ReturnClaw running at http://localhost:${PORT}`);
  console.log(`   OAuth callback: http://localhost:${PORT}/auth/google/callback`);
  console.log(`   IMAP connect:   POST /auth/imap/connect`);
  console.log(`   Supported IMAP: ${Object.keys(IMAP_CONFIGS).join(', ')}`);
});
