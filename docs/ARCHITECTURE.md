# ReturnClaw Architecture

## Overview

ReturnClaw is built as a five-layer stack designed for voice-first consumer returns automation. Each layer is independently deployable and communicates via well-defined interfaces.

```
┌─────────────────────────────────────────────┐
│  Layer 1: Interface Layer                    │
│  (Voice, Web, CLI, Smart Home, SMS)          │
├─────────────────────────────────────────────┤
│  Layer 2: Gateway / Control Plane            │
│  (Session, Auth, Intent Routing, Rate Limit) │
├─────────────────────────────────────────────┤
│  Layer 3: Agent Layer                        │
│  (Triage, Policy, Execution, Carrier, etc.)  │
├─────────────────────────────────────────────┤
│  Layer 4: Data & Integration Layer           │
│  (Policy Engine, Email Parser, Carriers)     │
├─────────────────────────────────────────────┤
│  Layer 5: Infrastructure                     │
│  (PostgreSQL, Redis, Vector Store, S3)       │
└─────────────────────────────────────────────┘
```

---

## Layer 1: Interface Layer

The interface layer accepts user input from multiple channels and normalizes it into intent objects.

### Voice Interface

The primary interface. Powered by OpenAI's Realtime API, the voice interface provides:

- **Real-time speech-to-text** via WebSocket connection
- **Server-side VAD** (Voice Activity Detection) for natural turn-taking
- **Streaming responses** so the user hears the agent respond as it thinks
- **Ephemeral tokens** generated per-session (60-second TTL) for security

The web dashboard connects via WebRTC. The CLI connects via the Realtime API directly. Alexa, Google Assistant, and Siri Shortcuts use their respective SDKs to forward intents.

### Web Dashboard

A Next.js 15 application providing:

- Full return lifecycle management
- Order detection and browsing
- Voice interface with animated orb UI
- Settings and email connection management
- Real-time status updates via Server-Sent Events

### CLI

The `@returnclaw/cli` package provides terminal-based access to all return operations, including a text-mode voice session.

### Smart Home Integrations

- **Alexa Skill**: Custom skill that forwards voice intents
- **Google Action**: Conversational action for Google Assistant
- **Siri Shortcuts**: Pre-built shortcuts for common return actions

---

## Layer 2: Gateway (Control Plane)

The gateway is the single entry point for all requests. Built with Fastify for maximum throughput.

### Components

| Component | Purpose |
|-----------|---------|
| **Session Manager** | Creates, tracks, and expires user sessions. Maps ephemeral voice tokens to authenticated sessions. |
| **Auth Middleware** | JWT validation, API key authentication, OAuth token refresh. |
| **Intent Router** | Classifies user input into structured intents (e.g., `return.initiate`, `policy.lookup`, `status.check`). Uses OpenAI function calling for classification. |
| **Agent Pipeline** | Orchestrates the multi-agent workflow. Determines which agents to invoke and in what order based on the intent. |
| **Rate Limiter** | Token-bucket rate limiting per user. Separate limits for voice sessions (higher) and API calls. |
| **WebSocket Hub** | Manages persistent connections for real-time voice streaming and SSE for dashboard updates. |

### Intent Classification

User input is classified into one of these intent categories:

```typescript
type Intent =
  | { type: "return.initiate"; item: string; retailer?: string }
  | { type: "return.status"; returnId?: string }
  | { type: "policy.lookup"; retailer: string }
  | { type: "order.list"; filter?: string }
  | { type: "pickup.schedule"; returnId: string; date?: string }
  | { type: "dropoff.find"; carrier?: string; location?: string }
  | { type: "general.help" }
  | { type: "general.greeting" };
```

---

## Layer 3: Agent Layer

ReturnClaw uses a multi-agent architecture with six specialized agents. Each agent has a focused domain and can call tools specific to its role.

### Agent Roster

#### 1. Triage Agent
- **Role**: First responder. Classifies intent, identifies the item and retailer, matches to a known order.
- **Tools**: Order search, entity extraction, disambiguation prompts
- **Output**: Enriched intent with order_id, retailer, item details

#### 2. Policy Agent
- **Role**: Return policy expert. Checks eligibility, return windows, conditions, and fees.
- **Tools**: Policy graph lookup, deadline calculator, condition evaluator
- **Output**: Eligibility decision with policy details and any required conditions

#### 3. Execution Agent
- **Role**: Initiates the return with the retailer. Generates RMA numbers, return links, and authorization codes.
- **Tools**: Retailer API adapters, web automation (for retailers without APIs), form generation
- **Output**: Return authorization with tracking details

#### 4. Carrier Agent
- **Role**: Handles shipping logistics. Generates labels, schedules pickups, finds drop-off locations.
- **Tools**: UPS/FedEx/USPS/DHL APIs, geocoding, scheduling
- **Output**: Shipping label URL, pickup confirmation, drop-off locations

#### 5. Compliance Agent
- **Role**: Ensures all actions comply with retailer terms, consumer protection laws, and platform policies.
- **Tools**: Terms parser, regulation database, audit logger
- **Output**: Compliance check result, audit trail entry

#### 6. Escalation Agent
- **Role**: Handles failures, edge cases, and disputes. Drafts emails, prepares dispute evidence, suggests alternatives.
- **Tools**: Email drafter, dispute template engine, customer service contact lookup
- **Output**: Escalation action (email draft, phone script, dispute filing)

### Agent Pipeline Flow

```
User: "Return my AirPods from Amazon"
  │
  ├─ Triage Agent
  │   ├─ Searches orders for "AirPods" + "Amazon"
  │   ├─ Finds: Order #114-3941689-8772232, AirPods Pro, $249
  │   └─ Output: { order_id, item, retailer, amount }
  │
  ├─ Policy Agent
  │   ├─ Looks up Amazon return policy
  │   ├─ Checks: 30-day window, free returns, no restocking fee
  │   ├─ Verifies: Purchase date within window
  │   └─ Output: { eligible: true, window_days: 30, free: true }
  │
  ├─ Compliance Agent
  │   ├─ Verifies action is within platform terms
  │   └─ Output: { approved: true }
  │
  ├─ Execution Agent
  │   ├─ Initiates return via Amazon API
  │   ├─ Gets RMA authorization
  │   └─ Output: { return_id, rma_number }
  │
  └─ Carrier Agent
      ├─ Generates UPS return label
      ├─ Offers pickup scheduling
      └─ Output: { label_url, tracking_number }

Response: "Done! Label generated. Shall I schedule a pickup?"
```

---

## Layer 4: Data & Integration Layer

### Policy Engine

The policy engine maintains a structured graph of return policies for 500+ retailers.

```typescript
interface RetailerPolicy {
  retailer: string;
  return_window_days: number;
  free_returns: boolean;
  restocking_fee_percent?: number;
  conditions: PolicyCondition[];
  process_steps: ProcessStep[];
  exceptions: PolicyException[];
  categories: CategoryOverride[];
  last_verified: Date;
  source_urls: string[];
}
```

Policies are stored in PostgreSQL with vector embeddings for semantic search. They are verified weekly through a combination of web monitoring and manual review.

### Email Parser

Connects to Gmail (via Gmail API) and Outlook (via Microsoft Graph) using OAuth 2.0. Parses order confirmation emails using:

1. **Structured data extraction**: Parses Schema.org/JSON-LD embedded in emails
2. **Template matching**: Recognizes email templates from known retailers
3. **LLM fallback**: Uses GPT-4o to extract order details from unstructured emails

### Carrier Integrations

| Carrier | API | Capabilities |
|---------|-----|-------------|
| UPS | UPS Developer Kit | Labels, tracking, pickup scheduling, locations |
| FedEx | FedEx Web Services | Labels, tracking, pickup, drop-off finder |
| USPS | USPS Web Tools | Labels, tracking, post office locations |
| DHL | DHL Express API | Labels, tracking (international) |

---

## Layer 5: Infrastructure

### Database

- **PostgreSQL 16** with pgvector extension for semantic search
- **Drizzle ORM** for type-safe queries
- Schema includes: users, orders, returns, policies, timeline_events, email_connections

### Cache

- **Redis** for session management, rate limiting, and temporary data
- Cached policy lookups (1-hour TTL)
- WebSocket session state

### Object Storage

- **S3-compatible** storage for shipping labels, return documentation, and email attachments

### Message Queue

- **BullMQ** (Redis-backed) for async job processing
- Jobs: email parsing, policy verification, tracking updates, notification delivery

---

## Data Flow

### Return Initiation Flow

```
1. User speaks: "Return my AirPods from Amazon"
2. OpenAI Realtime API → transcription → Gateway
3. Gateway → Intent Router → { type: "return.initiate", item: "AirPods", retailer: "Amazon" }
4. Pipeline: Triage → Policy → Compliance → Execution → Carrier
5. Each agent reads/writes to PostgreSQL and calls external APIs
6. Final response streamed back to user via Realtime API
7. Dashboard updated in real-time via SSE
8. Timeline events written to database
```

### Email Sync Flow

```
1. User connects Gmail via OAuth
2. Background job: Fetch emails matching retailer patterns
3. Parse each email → extract order data → store in orders table
4. Calculate return eligibility based on policy engine
5. Surface eligible returns in dashboard and voice interface
```

---

## Security Model

- **OAuth 2.0** for all email provider connections — we never see passwords
- **Ephemeral voice tokens** with 60-second TTL
- **JWT** authentication for API requests
- **API keys** for CLI and programmatic access
- **Row-level security** in PostgreSQL — users can only access their own data
- **Encrypted at rest** — all PII encrypted with AES-256
- **Audit logging** — every agent action is logged with timestamps and user context
- **No retailer credential storage** — we never ask for or store retailer passwords

---

## Deployment

ReturnClaw is designed to run as:

1. **Self-hosted**: Docker Compose for single-server deployment
2. **Cloud-native**: Kubernetes with horizontal scaling per service
3. **Managed**: ReturnClaw Cloud (coming soon)

```yaml
# docker-compose.yml services:
# - postgres (database)
# - redis (cache + queue)
# - gateway (API server)
# - web (Next.js dashboard)
# - worker (background jobs)
```

---

*For API documentation, see [API.md](API.md). For contributing guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).*
