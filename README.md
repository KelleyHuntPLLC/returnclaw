# ReturnClaw App

Voice-first AI agent for retail returns. Real OAuth. Real email search. Real returns.

## Quick Start

```bash
# Clone
git clone https://github.com/KelleyHuntPLLC/returnclaw.git
cd returnclaw-app

# Install
npm install

# Configure (requires Google OAuth credentials)
cp .env.example .env
# Edit .env with your Google Cloud OAuth credentials

# Run
npm start
# Open http://localhost:3000
```

## Google OAuth Setup

1. Go to https://console.cloud.google.com/apis/credentials
2. Create a project or select existing
3. Create OAuth 2.0 Client ID (Web application)
4. Add authorized redirect URI: `http://localhost:3000/auth/google/callback`
5. Copy Client ID and Client Secret to .env

## Static Mode (No Backend)

The app also works as a static site (e.g., GitHub Pages) with simulated data.
Just open public/index.html — no server needed for the demo experience.

## Architecture

```
returnclaw-app/
├── server.js           # Express backend (OAuth, email search, API)
├── public/
│   ├── index.html      # Landing page + full agent interface
│   ├── style.css       # All styles
│   └── app.js          # Frontend agent engine (dual-mode)
├── package.json
├── .env.example
└── README.md
```

## Dual Mode

The frontend automatically detects whether it's running with the backend:

- **Live Mode** (with `node server.js`): Real Google OAuth, real Gmail search, real policy API
- **Demo Mode** (static HTML): Simulated email connection, mock order data

Detection happens via a health check to `/api/health` on page load.

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Health check & mode detection |
| `/auth/google` | GET | Generate Gmail OAuth URL |
| `/auth/google/callback` | GET | OAuth callback handler |
| `/auth/status/:sessionId` | GET | Check connection status |
| `/api/email/search` | POST | Search Gmail for order emails |
| `/api/policy/:retailer` | GET | Get return policy for retailer |
| `/api/return/link` | POST | Generate return deep link |

## Built by Kelley Hunt, PLLC

Copyright (c) 2026 Kelley Hunt, PLLC. All rights reserved.
