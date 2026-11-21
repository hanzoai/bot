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
- `server-http.ts` — HTTP handler chain: /health → /auth → hooks → tools → /v1/chat (chat bridge) → Slack → plugins (/v1/channels/\*) → /v1/responses → /v1/marketplace → /v1/chat/completions → canvas → control-ui → 404
- Every route is under `/v1`; `/api/*` is a 404. `v1-prefix.guard.test.ts` fails on any first-party `/api` path literal in `src/`, `extensions/` or `ui/src/` (third-party APIs are listed there by file).
- `/v1/chat/completions`: a run whose model call failed answers **500** `{error:{type:"upstream_error"}}` (a stream
  carries that object before `[DONE]`), never a 200 whose reply is the error text; the edge replaces a 502 or 504
  with its own page, so neither is used. An unauthorized model call logs `upstream=<base URL> credential=<source>`.
- Plugin auto-enable never switches on a channel with `enabled: false`; a scoped `@hanzo/bot-<id>` package hints the
  plugin id `<id>`. The doctor skips disabled channels and accounts.
- The production image is built `REQUIRE_ADMIN_UI=0` (the admin SPA is private), so prod config sets
  `gateway.controlUi.enabled: false` and `/__bot__/` answers the gateway's 404.
- `server-ws.ts` — WebSocket connection mgmt for nodes/clients
- `server-methods.ts` — RPC method implementations
- `billing/billing-gate.ts` — Pre-request billing check (fail-closed in production)
- `billing/usage-reporter.ts` — Async usage reporting (batch 50, flush 5s, retry 3x)
- `marketplace-http.ts` — P2P inference marketplace
- `bots-http.ts` — org-scoped `GET /v1/bots` (list the caller org's runs) + `POST /v1/bots/:runId/stop` (own-key stop guard), authenticated at the pod boundary
- `coding-tasks-http.ts` — `POST /v1/coding-tasks`: native coding-task runner (clone → agent → commit → push); sandbox isolation is fail-closed and OFF by default

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

1. Pre-request: every paid HTTP path (`/v1/chat/completions`, `/v1/responses`, marketplace) calls
   `billRequest()` (`billing/billing-http.ts`) before the platform key is used. The request's `model`
   is an agent selector (`bot`, `bot:<agent>`, `agent:<agent>`: the agent's default runs) or a model
   (`enso-auto`, `hanzo/zen6`: it runs for that call only). The gate reads the caller's own tier from
   cloud `GET /v1/billing/tier` with the caller's token (cached 60s). A model outside the plan is 402
   `model_not_in_plan`; a free account is served the plan's own models at zero balance, and when it
   names no model and the agent's default is outside its plan the plan's first model runs instead; a
   paid plan with a spent balance is 402 `payment_required`. Both bodies are
   `{error:{message,type:"billing_error",code,billingUrl}}` with `billingUrl` from `BILLING_URL`; an
   unreadable plan is 503 `billing_unavailable`. No role passes without a plan read: an admin's org is read and
   metered like any other, and every decision is logged (`org`, `user`, `model`, verdict). Only
   IAM-mode gateways bill; the shared gateway token is an operator's own node and is not billed.
2. Request: Route to LLM provider
3. Post-request: `reportUsage()` → async queue → cloud `POST /v1/billing/usage`
4. Commerce API: `COMMERCE_API_URL` (cloud, `http://cloud.hanzo.svc:8000` in the cluster)

## IAM issuers

`gateway.auth.iam.serverUrl` is the pinned issuer; `issuers` names further ones, each matched
exactly (the platform's two: `https://hanzo.id`, `https://hanzo.ai`). A token signed by IAM's key
under any other issuer string, an organization's `https://hanzo.ai/<org>` among them, is refused.

## Git Remotes

- `origin` = `ssh://github.com/hanzoai/bot` (canonical, PRs here)
- `upstream` = `git@github.com:openclaw/openclaw` (the MIT project this forks; see NOTICE)
