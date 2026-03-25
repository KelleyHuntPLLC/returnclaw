# Contributing to ReturnClaw

Thank you for your interest in contributing to ReturnClaw! This guide will help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Testing](#testing)
- [Adding a New Retailer](#adding-a-new-retailer)
- [Adding a New Agent Tool](#adding-a-new-agent-tool)
- [Community](#community)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you are expected to uphold this code. Please report unacceptable behavior to conduct@returnclaw.com.

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally
3. **Create a branch** for your changes
4. **Make your changes** and test them
5. **Push** your branch and open a Pull Request

## Development Setup

### Prerequisites

- Node.js 22+
- pnpm 9+
- Docker and Docker Compose
- PostgreSQL 16+ (or use Docker)
- Redis 7+ (or use Docker)

### Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/returnclaw.git
cd returnclaw

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your API keys

# Start infrastructure
docker compose up -d postgres redis

# Run database migrations
pnpm db:migrate

# Seed test data
pnpm db:seed

# Start all services in development mode
pnpm dev
```

### Verify Setup

```bash
# Run tests
pnpm test

# Type-check all packages
pnpm type-check

# Lint all packages
pnpm lint
```

## Project Structure

```
returnclaw/
├── apps/
│   └── web/                  # Next.js 15 web dashboard
│       └── src/
│           ├── app/          # Next.js App Router pages
│           ├── components/   # React components
│           └── lib/          # Utilities and API client
├── packages/
│   ├── core/                 # Shared types, policy engine, utilities
│   ├── agents/               # AI agent implementations
│   ├── gateway/              # Fastify API gateway
│   └── cli/                  # Command-line interface
├── docs/                     # Documentation
└── docker-compose.yml        # Infrastructure
```

## Making Changes

### Branching Strategy

- `main` — stable, production-ready code
- `develop` — integration branch for next release
- `feature/*` — new features
- `fix/*` — bug fixes
- `docs/*` — documentation changes

```bash
# Create a feature branch
git checkout -b feature/my-amazing-feature develop

# Or a fix branch
git checkout -b fix/broken-thing develop
```

### Types of Contributions

| Type | Branch Prefix | Example |
|------|--------------|---------|
| New feature | `feature/` | `feature/add-costco-support` |
| Bug fix | `fix/` | `fix/label-generation-error` |
| Documentation | `docs/` | `docs/update-api-reference` |
| Performance | `perf/` | `perf/optimize-policy-lookup` |
| Refactor | `refactor/` | `refactor/agent-pipeline` |

## Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat` — New feature
- `fix` — Bug fix
- `docs` — Documentation
- `style` — Code style (formatting, no logic change)
- `refactor` — Code change that neither fixes a bug nor adds a feature
- `perf` — Performance improvement
- `test` — Adding or updating tests
- `chore` — Maintenance tasks

### Examples

```
feat(agents): add escalation agent for disputed returns
fix(carrier): handle UPS API timeout gracefully
docs(readme): update quick start instructions
refactor(gateway): simplify intent routing logic
```

## Pull Request Process

1. **Update documentation** if your changes affect the public API or user-facing behavior
2. **Add tests** for new functionality
3. **Ensure all tests pass**: `pnpm test`
4. **Ensure type-checking passes**: `pnpm type-check`
5. **Ensure linting passes**: `pnpm lint`
6. **Fill out the PR template** completely
7. **Request review** from at least one maintainer

### PR Title Format

Same as commit convention: `type(scope): description`

### PR Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Type-check passes
- [ ] Lint passes
- [ ] No breaking changes (or clearly documented)
- [ ] Screenshots/recordings for UI changes

## Code Style

### TypeScript

- Strict mode enabled (`strict: true`)
- Prefer `const` over `let`
- Use explicit return types for exported functions
- Use `interface` for object shapes, `type` for unions/intersections
- No `any` — use `unknown` and narrow

### React / Next.js

- Functional components only
- Server Components by default; `"use client"` only when needed
- Props interfaces named `{Component}Props`
- Colocate styles with components

### CSS / Tailwind

- Tailwind CSS 4 utility classes
- Dark theme by default (zinc-950 background)
- Glass morphism for cards: `bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/50`
- Brand color: emerald-500 for actions and success states
- Voice color: violet-500 for voice-related UI

## Testing

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter @returnclaw/core test

# Run tests in watch mode
pnpm test -- --watch

# Run with coverage
pnpm test -- --coverage
```

### Test Structure

- Unit tests: `__tests__/` directories next to source files
- Integration tests: `tests/integration/` at package root
- E2E tests: `tests/e2e/` at repo root (Playwright)

## Adding a New Retailer

ReturnClaw's policy engine makes it straightforward to add support for new retailers.

### 1. Create the Policy Definition

```typescript
// packages/core/src/policies/retailers/costco.ts
import { RetailerPolicy } from "../types";

export const costcoPolicy: RetailerPolicy = {
  retailer: "Costco",
  slug: "costco",
  return_window_days: 90,
  free_returns: true,
  restocking_fee_percent: 0,
  conditions: [
    { type: "receipt_required", description: "Receipt or order lookup required" },
    { type: "original_packaging", required: false },
  ],
  process_steps: [
    { step: 1, action: "Visit Costco.com or any warehouse" },
    { step: 2, action: "Present item and membership card" },
    { step: 3, action: "Refund issued to original payment method" },
  ],
  exceptions: [
    { category: "electronics", window_days: 90 },
    { category: "diamonds", window_days: 48, unit: "hours" },
  ],
  source_urls: ["https://www.costco.com/return-policy.html"],
};
```

### 2. Register the Policy

```typescript
// packages/core/src/policies/registry.ts
import { costcoPolicy } from "./retailers/costco";

registry.register(costcoPolicy);
```

### 3. Add Tests

```typescript
// packages/core/src/__tests__/policies/costco.test.ts
describe("Costco Policy", () => {
  it("should allow returns within 90 days", () => { ... });
  it("should have no restocking fee", () => { ... });
});
```

### 4. Update Documentation

Add the retailer to the supported retailers table in `README.md`.

## Adding a New Agent Tool

Agents use tools to interact with external services. Here's how to add one:

### 1. Define the Tool Schema

```typescript
// packages/agents/src/tools/schedule-pickup.ts
import { AgentTool } from "../types";

export const schedulePickupTool: AgentTool = {
  name: "schedule_pickup",
  description: "Schedule a carrier pickup at the user's address",
  parameters: {
    type: "object",
    properties: {
      carrier: { type: "string", enum: ["ups", "fedex", "usps"] },
      date: { type: "string", format: "date" },
      address_id: { type: "string" },
      return_id: { type: "string" },
    },
    required: ["carrier", "date", "return_id"],
  },
  handler: async (params) => {
    // Implementation
  },
};
```

### 2. Register with the Agent

```typescript
// packages/agents/src/agents/carrier.ts
import { schedulePickupTool } from "../tools/schedule-pickup";

carrierAgent.registerTool(schedulePickupTool);
```

## Community

- **Discord**: [discord.gg/returnclaw](https://discord.gg/returnclaw)
- **Twitter**: [@returnclaw](https://twitter.com/returnclaw)
- **Email**: contributors@returnclaw.com

### Getting Help

- Open a [GitHub Discussion](https://github.com/returnclaw/returnclaw/discussions) for questions
- Open a [GitHub Issue](https://github.com/returnclaw/returnclaw/issues) for bugs
- Join [Discord](https://discord.gg/returnclaw) for real-time help

---

Thank you for contributing to ReturnClaw! Every contribution, no matter how small, helps make returns easier for everyone. 🦞
