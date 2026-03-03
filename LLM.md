# Hanzo Bot — Architecture & Context

## Overview

Multi-channel AI messaging gateway (TypeScript ESM). Routes messages between 50+ messaging platforms and AI models/agents. Composable plugin architecture with WebSocket + HTTP server core.

## Key Architecture Layers

1. **CLI** (`src/cli/`) — Command registry, arg parsing, `bot gateway run`, `bot agent`, `bot channels`
2. **Gateway** (`src/gateway/`) — WebSocket + HTTP server, auth, billing, marketplace, channels
3. **Channels** (`src/channels/`, `src/discord/`, `src/slack/`, `src/telegram/`, etc.) — Platform adapters
4. **Agents** (`src/agents/`) — ACP-based agent spawning, model selection, auth profiles
5. **Extensions** (`extensions/`) — 50+ channel/feature plugins as workspace packages

## Gateway Server (`src/gateway/`)

- `server.impl.ts` — Main initialization and lifecycle
- `server-http.ts` — HTTP handler chain: /health → /auth → hooks → tools → Slack → plugins → /v1/responses → /v1/marketplace → /v1/chat/completions → canvas → control-ui → 404
- `server-ws.ts` — WebSocket connection mgmt for nodes/clients
- `server-methods.ts` — RPC method implementations
- `billing/billing-gate.ts` — Pre-request billing check (fail-closed in production)
- `billing/usage-reporter.ts` — Async usage reporting (batch 50, flush 5s, retry 3x)
- `marketplace-http.ts` — P2P inference marketplace

## Model System (`src/agents/`)

- `model-selection.ts` — Provider/model parsing, alias resolution, allowlist matching
- `defaults.ts` — `DEFAULT_PROVIDER = "hanzo"`, `DEFAULT_MODEL = "claude-sonnet-4-6"`
- Tier-aware routing: free → claude-sonnet-4-6, paid → zen4-pro
- Auth profiles: multi-key round-robin with cooldown recovery

## Configuration

- Zod schema in `src/config/zod-schema.ts`
- Primary: `~/.hanzo/bot/node.json` (fallback: `~/.bot/`)
- JSON5 parsing, hot-reload on file change
- Gateway config under `config.gateway.*`, agents under `config.agents.*`

## Plugin Model

```typescript
type ChannelPlugin = {
  id: string;
  messaging: ChannelMessagingAdapter;
  auth?: ChannelAuthAdapter;
  // ... 10+ adapters
};
```

- Plugins in `extensions/*/` with own `package.json`
- Runtime deps in `dependencies` (no `workspace:*`)
- Loaded via `jiti` alias resolver

## Testing

- Framework: Vitest (multiple configs: unit, gateway, e2e, live, extensions)
- Colocated `*.test.ts` files
- Coverage: 70% thresholds
- Workers: max 16, 2048MB heap each
- `pnpm test` (vitest), `pnpm test:coverage`, `pnpm test:live` (real APIs)

## Build

- pnpm + tsdown (bundle) + tsc (types) + oxfmt (format) + oxlint (lint)
- Node 22+, Bun supported for scripts/dev/tests
- Output: `dist/index.js`, Docker: `ghcr.io/hanzoai/bot:latest`

## Key Patterns

- **Dual routing**: inbound channels → agents, outbound agents → channels
- **Billing gate**: open/warn/fail-closed modes via `BILLING_GATE_MODE` env
- **Exec approval**: Code execution gated behind interactive UI
- **Config injection**: `createDefaultDeps()` pattern for CLI, plugin services for runtime
- **Channel adapters**: Loose coupling via interface-based plugins

## Billing Flow

1. Pre-request: `checkBillingAllowance()` → Commerce API balance check (cached 60s)
2. Request: Route to LLM provider
3. Post-request: `reportUsage()` → async queue → Commerce `/api/v1/billing/usage`
4. Commerce API: `COMMERCE_API_URL` (default: `commerce.hanzo.svc.cluster.local:8001`)

## Git Remotes

- `origin` = `ssh://github.com/hanzoai/bot` (primary, PRs here)
- `upstream` = `https://github.com/openclaw/openclaw.git`
