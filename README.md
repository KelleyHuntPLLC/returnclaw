<div align="center">

# 🦞 ReturnClaw

### Voice-first AI agent for online returns. Every retailer. One command.

[![License: Source Available](https://img.shields.io/badge/license-source--available-10b981)](LICENSE.md)
[![GitHub Stars](https://img.shields.io/github/stars/returnclaw/returnclaw?style=flat&color=10b981)](https://github.com/returnclaw/returnclaw)
[![Discord](https://img.shields.io/badge/Discord-join-7c3aed)](https://discord.gg/returnclaw)
[![Twitter](https://img.shields.io/badge/Twitter-follow-1DA1F2)](https://twitter.com/returnclaw)

[Website](https://returnclaw.com) · [Documentation](docs/) · [Discord](https://discord.gg/returnclaw) · [Twitter](https://twitter.com/returnclaw)

</div>

---

> **"ReturnClaw, return my AirPods from Amazon."**
> 
> *Label generated. Pickup scheduled for tomorrow. You'll get $249 back in 3–5 days.*

---

## What is ReturnClaw?

ReturnClaw is an open-core, voice-first AI agent that automates online returns across every major retailer. It connects to your email, detects your orders, checks return policies, generates labels, schedules pickups, and tracks your refund — all from a single voice command or text message.

**It's the CUDA of consumer commerce.** Not an app — an infrastructure layer.

## Why ReturnClaw?

- 🎤 **Voice-first**: "Return my Nike shoes" — that's it. Works with Alexa, Google, Siri, or the ReturnClaw voice interface.
- 🏪 **Every retailer**: Amazon, Walmart, Target, Best Buy, Costco, Apple, Nike, Nordstrom, and 500+ more.
- 📧 **Auto-detection**: Connects to your email, finds your orders automatically.
- 🏷️ **Label generation**: Creates return shipping labels instantly.
- 🚚 **Pickup scheduling**: Schedules carrier pickups at your door.
- 📍 **Drop-off finder**: Finds the nearest drop-off location.
- 🔒 **Privacy-first**: Never stores your retailer passwords. Never accesses your accounts. Email access is OAuth-only.
- 🧠 **Multi-agent AI**: Six specialized AI agents (Triage, Policy, Execution, Carrier, Compliance, Escalation) work together.

## Quick Start

```bash
# Clone the repo
git clone https://github.com/returnclaw/returnclaw.git
cd returnclaw

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Add your OpenAI API key and other config

# Start infrastructure
docker compose up -d

# Seed the policy database
pnpm db:seed

# Start the development server
pnpm dev
```

The gateway starts at `http://localhost:3001`, and the web dashboard at `http://localhost:3000`.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     ReturnClaw Stack                         │
├──────────────────────────────────────────────────────────────┤
│  Voice & Intent Layer                                        │
│  ┌─────────┐ ┌──────────┐ ┌───────┐ ┌──────┐ ┌───────────┐│
│  │ OpenAI  │ │  Alexa   │ │ Google│ │ Siri │ │ Web/Mobile││
│  │Realtime │ │  Skill   │ │Action │ │Short │ │  Voice    ││
│  └────┬────┘ └────┬─────┘ └───┬───┘ └──┬───┘ └─────┬─────┘│
│       └──────────┬─┴──────────┘        │            │       │
├──────────────────┼─────────────────────┴────────────┘───────┤
│  Gateway (Control Plane)                                     │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Session Manager → Intent Router → Agent Pipeline       ││
│  └─────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────┤
│  Agent Layer                                                 │
│  ┌────────┐ ┌────────┐ ┌──────────┐ ┌────────┐ ┌─────────┐│
│  │Triage  │→│Policy  │→│Execution │→│Carrier │ │Compliance││
│  │Agent   │ │Agent   │ │Agent     │ │Agent   │ │Agent     ││
│  └────────┘ └────────┘ └──────────┘ └────────┘ └─────────┘│
├──────────────────────────────────────────────────────────────┤
│  Data Layer                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐  │
│  │Policy Engine │ │Email Parser  │ │Carrier Integration │  │
│  │(500+ stores) │ │(Gmail/MSFT)  │ │(UPS/FedEx/USPS)    │  │
│  └──────────────┘ └──────────────┘ └────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a detailed technical breakdown.

## Voice Commands

| Command | What happens |
|---------|-------------|
| "Return my AirPods from Amazon" | Checks policy → generates return link → offers label + pickup |
| "What's Amazon's return policy?" | Returns the policy details for Amazon |
| "Schedule a pickup for my Walmart return" | Schedules UPS/FedEx/USPS pickup |
| "Where can I drop off my FedEx return?" | Finds nearest FedEx drop-off locations |
| "What's the status of my return?" | Checks tracking and refund status |
| "List my recent orders" | Shows all detected orders from your email |

## CLI

ReturnClaw ships with a powerful command-line interface:

```bash
# Initialize configuration
returnclaw init

# Natural language returns
returnclaw return "Nike shoes from last week"

# Check a return policy
returnclaw policy amazon

# List your orders
returnclaw orders

# Check return status
returnclaw status ret_01

# Start a voice session
returnclaw voice

# Configure settings
returnclaw config set defaultCarrier ups
```

See the full [CLI documentation](packages/cli/) for all commands and options.

## Web Dashboard

The web dashboard provides a full-featured UI for managing your returns:

- **Dashboard**: Stats overview, recent returns, quick voice access
- **Returns**: List, filter, and track all your returns
- **Orders**: Auto-detected orders from your email
- **Voice**: Full voice interface with transcript
- **Settings**: Email connections, carrier preferences, notifications

Built with Next.js 15, React 19, and Tailwind CSS 4.

## Supported Retailers

| Retailer | Return Window | Free Returns | Label Gen | Policy Auto-Check |
|----------|:------------:|:------------:|:---------:|:-----------------:|
| Amazon | 30 days | ✅ | ✅ | ✅ |
| Walmart | 90 days | ✅ | ✅ | ✅ |
| Target | 90 days | ✅ | ✅ | ✅ |
| Best Buy | 15 days | ✅ | ✅ | ✅ |
| Costco | 90 days | ✅ | ✅ | ✅ |
| Apple | 14 days | ✅ | ✅ | ✅ |
| Nike | 60 days | ✅ | ✅ | ✅ |
| Nordstrom | No limit | ✅ | ✅ | ✅ |
| Zara | 30 days | ✅ | ✅ | ✅ |
| H&M | 30 days | ✅ | ✅ | ✅ |
| IKEA | 365 days | ✅ | ✅ | ✅ |
| Home Depot | 90 days | ✅ | ✅ | ✅ |

*And 500+ more. The policy engine is continuously updated.*

## Project Structure

```
returnclaw/
├── apps/
│   └── web/                  # Next.js 15 web dashboard
├── packages/
│   ├── core/                 # Core library (policy engine, types)
│   ├── agents/               # AI agent implementations
│   ├── gateway/              # API gateway & session management
│   └── cli/                  # Command-line interface
├── docs/                     # Documentation
│   ├── ARCHITECTURE.md       # System architecture
│   ├── CONTRIBUTING.md       # Contributing guide
│   └── API.md                # API reference
├── docker-compose.yml        # Infrastructure setup
├── LICENSE.md                # Source-available license
└── README.md                 # This file
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Web Dashboard | Next.js 15, React 19, Tailwind CSS 4 |
| API Gateway | Fastify, TypeScript |
| AI Agents | OpenAI GPT-4o, Realtime API |
| Voice | OpenAI Realtime API, WebRTC |
| Database | PostgreSQL, Drizzle ORM |
| Cache | Redis |
| Search | OpenAI Embeddings + pgvector |
| Email Parsing | Gmail API, Microsoft Graph |
| Carriers | UPS, FedEx, USPS, DHL APIs |
| CLI | Commander, Chalk, Inquirer |
| Infra | Docker, Turborepo |

## Environment Variables

```env
# Required
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379

# Email providers
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...

# Carrier APIs
UPS_CLIENT_ID=...
UPS_CLIENT_SECRET=...
FEDEX_API_KEY=...
USPS_USER_ID=...

# Optional
RETURNCLAW_API_URL=http://localhost:3001
JWT_SECRET=your-secret-key
```

## Contributing

We welcome contributions! See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

ReturnClaw is source-available under the [ReturnClaw Source Available License](LICENSE.md).

The core platform is free for personal use. Commercial use requires a license. Contact [licensing@returnclaw.com](mailto:licensing@returnclaw.com) for details.

---

<div align="center">
  <b>Built by <a href="https://kelleyhunt.law">Kelley Hunt, PLLC</a> — Founded by Aisha Hunt</b><br/>
  <sub>The CUDA of consumer commerce.</sub>
</div>
