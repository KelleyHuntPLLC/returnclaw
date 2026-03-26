/**
 * ReturnClaw — Backend Server v1.0.0
 * Copyright (c) 2026 Kelley Hunt, PLLC. All rights reserved.
 * Created with Perplexity Computer
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

// ============================================
// CORS CONFIGURATION — Configurable for production
// ============================================
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['*'];

app.use(cors({
  origin: ALLOWED_ORIGINS.includes('*') ? true : ALLOWED_ORIGINS,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

// ============================================
// REQUEST LOGGING — Timestamp every API request
// ============================================
app.use((req, res, next) => {
  const ts = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl;
  if (url.startsWith('/api/') || url.startsWith('/auth/')) {
    console.log(`[${ts}] ${method} ${url}`);
  }
  next();
});

// ============================================
// RATE LIMITING PLACEHOLDER
// In production, integrate express-rate-limit or a Redis-backed limiter:
//
// const rateLimit = require('express-rate-limit');
// const apiLimiter = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100,                  // limit each IP to 100 requests per window
//   standardHeaders: true,
//   legacyHeaders: false,
//   message: { error: 'Too many requests, please try again later.' }
// });
// app.use('/api/', apiLimiter);
// app.use('/auth/', apiLimiter);
// ============================================

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
  res.json({
    status: 'ok',
    mode: 'live',
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
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
    const errMsg = error.message || '';

    if (error.authenticationFailed || errMsg.includes('Invalid credentials') || errMsg.includes('AUTHENTICATIONFAILED')) {
      const domain = (req.body.email || '').split('@')[1]?.toLowerCase();
      if (domain && (domain === 'gmail.com' || domain === 'googlemail.com')) {
        userMessage = 'Authentication failed for Gmail. Make sure you\'re using a 16-character app password (not your regular password). Generate one at myaccount.google.com/apppasswords — you need 2-Step Verification enabled.';
      } else if (domain && (domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com')) {
        userMessage = 'Authentication failed for Outlook/Hotmail. Use an app password from account.microsoft.com/security under "Advanced security options". Requires 2-Step Verification.';
      } else if (domain && (domain === 'yahoo.com' || domain === 'yahoo.co.uk')) {
        userMessage = 'Authentication failed for Yahoo. Generate an app password at login.yahoo.com/account/security. You may need to enable "Allow apps that use less secure sign-in."';
      } else if (domain && (domain === 'icloud.com' || domain === 'me.com' || domain === 'mac.com')) {
        userMessage = 'Authentication failed for iCloud. Generate an app-specific password at appleid.apple.com → Sign-In and Security → App-Specific Passwords. Two-factor authentication is required.';
      } else {
        userMessage = 'Invalid email or app password. Make sure you\'re using an app-specific password, not your regular password.';
      }
    } else if (errMsg.includes('ETIMEDOUT')) {
      userMessage = 'Connection timed out trying to reach the email server. Please check your internet connection and try again. If you\'re behind a firewall, IMAP port 993 may be blocked.';
    } else if (errMsg.includes('ECONNREFUSED')) {
      userMessage = 'Connection refused by the email server. The server may be temporarily down, or the port may be blocked by your network. Try again in a few minutes.';
    } else if (errMsg.includes('ENOTFOUND') || errMsg.includes('getaddrinfo')) {
      userMessage = 'Could not resolve the email server address. Please check your internet connection and make sure the email address is correct.';
    } else if (errMsg.includes('certificate') || errMsg.includes('SSL') || errMsg.includes('TLS')) {
      userMessage = 'SSL/TLS certificate error when connecting to the email server. This may be a network issue — try from a different network or disable VPN if active.';
    } else if (errMsg.includes('ECONNRESET')) {
      userMessage = 'The connection was reset by the email server. This is usually temporary — please try again in a moment.';
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
      adidas: 'adidas.com',
      lululemon: 'lululemon.com',
      rei: 'rei.com',
      potterybarn: 'potterybarn.com',
      'williams-sonoma': 'williams-sonoma.com',
      wayfair: 'wayfair.com',
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
    const errMsg = error.message || '';
    let userMessage = 'Failed to search emails. Please try reconnecting.';
    if (errMsg.includes('ETIMEDOUT')) {
      userMessage = 'The search timed out. Your mailbox may have a lot of emails — try specifying a retailer to narrow the search.';
    } else if (errMsg.includes('AUTHENTICATIONFAILED')) {
      userMessage = 'Your session expired. Please reconnect your email.';
    } else if (errMsg.includes('ECONNRESET')) {
      userMessage = 'The connection was interrupted. Please try your search again.';
    }
    res.status(500).json({ error: userMessage });
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
        adidas: 'from:adidas.com',
        lululemon: 'from:lululemon.com',
        rei: 'from:rei.com',
        potterybarn: 'from:potterybarn.com',
        'williams-sonoma': 'from:williams-sonoma.com',
        wayfair: 'from:wayfair.com',
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
  else if (fromLower.includes('adidas')) order.retailer = 'Adidas';
  else if (fromLower.includes('lululemon')) order.retailer = 'Lululemon';
  else if (fromLower.includes('rei.com') || fromLower.includes('rei ')) order.retailer = 'REI';
  else if (fromLower.includes('potterybarn') || fromLower.includes('pottery barn')) order.retailer = 'Pottery Barn';
  else if (fromLower.includes('williams-sonoma') || fromLower.includes('williams sonoma')) order.retailer = 'Williams-Sonoma';
  else if (fromLower.includes('wayfair')) order.retailer = 'Wayfair';
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
    // --- 6 NEW RETAILERS ---
    adidas: {
      retailer: 'Adidas', window: 30, freeReturn: true,
      methods: ['Adidas Store Return', 'UPS Drop-off', 'USPS Shipping'],
      deepLinkTemplate: 'https://www.adidas.com/us/order-tracker',
      fallbackUrl: 'https://www.adidas.com/us/help-topics-returns_refunds.html',
      instructions: [
        'Click the link', 'Sign in to your Adidas account',
        'Go to order history', 'Select the item to return',
        'Choose return reason', 'Print prepaid label',
        'Drop off at UPS or USPS'
      ],
      note: 'adiClub members may get extended return windows. Personalized items are final sale.'
    },
    lululemon: {
      retailer: 'Lululemon', window: 30, freeReturn: true,
      methods: ['Lululemon Store Return', 'Mail Return'],
      deepLinkTemplate: 'https://shop.lululemon.com/account/order-history',
      fallbackUrl: 'https://info.lululemon.com/help/our-policies/return-policy',
      instructions: [
        'Click the link', 'Sign in to Lululemon',
        'Select order and click "Start Return"',
        'Choose in-store or mail return',
        'Print prepaid label if mailing'
      ],
      note: 'Items must be unworn with tags. Like New program accepts gently used items for store credit.'
    },
    rei: {
      retailer: 'REI', window: 365, freeReturn: true,
      methods: ['REI Store Return', 'Mail Return'],
      deepLinkTemplate: 'https://www.rei.com/account/orders',
      fallbackUrl: 'https://www.rei.com/help/return-policy.html',
      instructions: [
        'Click the link', 'Sign in to REI',
        'Select order and start return',
        'Choose in-store or mail',
        'Co-op members get full year satisfaction guarantee'
      ],
      note: 'REI Co-op members get 1-year satisfaction guarantee. Electronics and outdoor electronics have 90-day window.'
    },
    potterybarn: {
      retailer: 'Pottery Barn', window: 30, freeReturn: false,
      methods: ['Pottery Barn Store Return', 'UPS Shipping'],
      deepLinkTemplate: 'https://www.potterybarn.com/customer-service/order-status.html',
      fallbackUrl: 'https://www.potterybarn.com/customer-service/return-policy.html',
      instructions: [
        'Click the link', 'Sign in to Pottery Barn',
        'Locate your order', 'Request a return',
        'Print return label (shipping fee deducted)',
        'Drop off at UPS'
      ],
      note: 'Furniture returns subject to pickup fee. Monogrammed items are final sale. Return shipping fee applies for mail returns.'
    },
    'williams-sonoma': {
      retailer: 'Williams-Sonoma', window: 30, freeReturn: false,
      methods: ['Williams-Sonoma Store Return', 'UPS Shipping'],
      deepLinkTemplate: 'https://www.williams-sonoma.com/customer-service/order-status.html',
      fallbackUrl: 'https://www.williams-sonoma.com/customer-service/return-policy.html',
      instructions: [
        'Click the link', 'Sign in to Williams-Sonoma',
        'Locate your order', 'Request a return',
        'Print return label', 'Drop off at UPS'
      ],
      note: 'Electrics must be returned unused in original packaging. Personalized items and perishables are final sale. Return shipping fee may apply.'
    },
    wayfair: {
      retailer: 'Wayfair', window: 30, freeReturn: true,
      methods: ['Mail Return', 'Large Item Pickup'],
      deepLinkTemplate: 'https://www.wayfair.com/v/account/orders',
      fallbackUrl: 'https://www.wayfair.com/help/article/return_policy',
      instructions: [
        'Click the link', 'Sign in to Wayfair',
        'Find order and click "Return Item"',
        'Select reason and refund method',
        'Print prepaid label',
        'Large items will be picked up — Wayfair arranges it'
      ],
      note: 'Items must be unassembled and in original packaging for full refund. Large/heavy items get free pickup. Clearance and open box items are final sale.'
    },
  };

  const key = req.params.retailer.toLowerCase().replace(/[^a-z-]/g, '');
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
  const key = retailer.toLowerCase().replace(/[^a-z-]/g, '');
  const templates = {
    amazon: 'https://www.amazon.com/gp/orc/returns/homepage.html?orderID={orderId}',
    walmart: 'https://www.walmart.com/orders/{orderId}',
    target: 'https://www.target.com/account/orders/details/{orderId}',
    bestbuy: 'https://www.bestbuy.com/profile/ss/orders',
    apple: 'https://secure.apple.com/shop/order/list',
    nike: 'https://www.nike.com/orders',
    costco: 'https://www.costco.com/my-account',
    nordstrom: 'https://www.nordstrom.com/account/orders',
    adidas: 'https://www.adidas.com/us/order-tracker',
    lululemon: 'https://shop.lululemon.com/account/order-history',
    rei: 'https://www.rei.com/account/orders',
    potterybarn: 'https://www.potterybarn.com/customer-service/order-status.html',
    'williams-sonoma': 'https://www.williams-sonoma.com/customer-service/order-status.html',
    wayfair: 'https://www.wayfair.com/v/account/orders',
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
  console.log(`🦞 ReturnClaw v1.0.0 running at http://localhost:${PORT}`);
  console.log(`   OAuth callback: http://localhost:${PORT}/auth/google/callback`);
  console.log(`   IMAP connect:   POST /auth/imap/connect`);
  console.log(`   Supported IMAP: ${Object.keys(IMAP_CONFIGS).join(', ')}`);
  console.log(`   CORS origins:   ${ALLOWED_ORIGINS.join(', ')}`);
});
