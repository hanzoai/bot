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

1. Pre-request: `checkBillingAllowance()` → Commerce API balance check (cached 60s)
2. Request: Route to LLM provider
3. Post-request: `reportUsage()` → async queue → Commerce `/api/v1/billing/usage`
4. Commerce API: `COMMERCE_API_URL` (default: `commerce.hanzo.svc.cluster.local:8001`)

## Git Remotes

- `origin` = `ssh://github.com/hanzoai/bot` (a mirror; refs are carried onward)
- `upstream` = the upstream MIT project this forks (see NOTICE for provenance and attribution)

## Syncing with upstream

This tree is upstream's tree plus a brand transform plus our own files — three
layers, kept separate on purpose. `scripts/rebrand.mjs` is the whole of layer
two, it is idempotent, and it is the reason a sync is mechanical:

    git fetch upstream
    git merge upstream/main          # take THEIRS on any conflict
    node scripts/rebrand.mjs         # re-derive the brand
    pnpm install && pnpm check

Take theirs and re-run the transform; because the transform is deterministic,
that always converges. `node scripts/rebrand.mjs --check` exits non-zero when
the tree has drifted, so CI can hold the line.

**Never hand-edit a branded string back.** A one-off rename that the script
cannot re-derive is what turns the next sync into a merge that cannot be
resolved. Extend the rule table instead.

Two exceptions are encoded in the script and must stay: `LICENSE` and
`THIRD_PARTY_NOTICES.md` name upstream (rebranding them would be a false claim
of authorship), and five packages upstream publishes to npm that we do not
republish — `@openclaw/{crabline,fs-safe,libterminal,proxyline,uirouter}` —
must keep pointing at upstream. Every other `@openclaw/*` is either a workspace
package (rebuilt as `@hanzo/bot-*`) or a test fixture name, and both rename
safely.

Dependency blocks in a `package.json` get a JSON-aware pass, because upstream's
root package is the unscoped `openclaw` and ours is `@hanzo/bot`. A text rule
cannot do this: the same manifest carries a top-level `openclaw` block that is
the plugin manifest namespace and correctly becomes `bot`, so only the parse can
tell a package name from a config key.

The script skips itself and this file. Both state the mapping literally, so
branding them rewrites the rules into identity no-ops — silently disarming
every future sync in the one case, and corrupting the explanation in the other.
It also skips symlinks, since `CLAUDE.md -> AGENTS.md -> LLM.md` would
otherwise be rewritten once per link.

### Why the history was transplanted rather than merged

The fork carried ~17k commits ahead of upstream, but 10,832 of them were
upstream's own work replayed under new SHAs. Git therefore saw one body of work
as two lineages and re-conflicted it forever: a trial merge produced 4,387
conflicts, 1,308 of them modify/delete. Upstream had also restructured — every
channel moved from `src/<channel>` to `extensions/<channel>` and roughly
quadrupled — so our copies of `src/discord`, `src/telegram`, `docs/zh-CN`,
`apps/macos` and friends were stale duplicates of paths upstream had moved,
not work of ours worth keeping.

So the tree was rebuilt on pristine upstream and our real delta replayed on
top. That delta is small and nameable: the brand transform, `.hanzo/workflows`,
`hanzo.toml`, the compose/Dockerfile set, `assets/`, `Swabble/`, and the docs
you are reading. Keeping it that way is what keeps the next sync a merge
instead of an archaeology project.

## How this ships

One way, and it runs on our own stack:

    push  ->  github.com/hanzoai/bot            (a mirror)
              hanzoai org webhook                carries refs onward
      ->  git.hanzo.ai/hanzoai/bot               CANONICAL
              .hanzo/workflows/ci.yml            the checks
              .hanzo/workflows/deploy.yml        builds ghcr.io/hanzoai/bot
              .hanzo/workflows/cloud.yml         builds ghcr.io/hanzoai/bot-cloud
              .hanzo/workflows/release.yml       publishes npm @hanzo/bot
      ->  hanzoai/universe crs/bot-gateway.yaml  names the tag that is live
      ->  hanzoai/operator                       reconciles the App
      ->  hanzoai/ingress serves bot.hanzo.ai, gw.hanzo.bot, market.hanzo.bot

**git.hanzo.ai is canonical; GitHub is a mirror.** `.github/workflows/` is empty
and stays that way: refs reach the forge over the `hanzoai` org webhook
(`git.hanzo.ai/v1/sync`), which replaced the per-repo sync workflow across every
org. Every build, check and release is a workflow under `.hanzo/workflows/`,
which the forge reads. Upstream's own 81 GitHub workflows were dropped in the
transplant — they address upstream's runners and secrets, and on our forge they
would queue against labels nothing advertises rather than fail. `.hanzo/workflows` uses GitHub Actions syntax, so a workflow moves
between the two by changing directory and nothing else — `runs-on` included: the
git-runner advertises `hanzo-build-linux-amd64` alongside `ubuntu-latest`,
`self-hosted`, `linux` and `amd64`.

`.github/actions/` is untouched and still works: a local composite action path
like `./.github/actions/setup-node-env` resolves from the repo root, not from the
workflow's own directory.

### The image cannot be built without the admin SPA

`Dockerfile` asserts `dist/control-ui/index.html` exists (`ARG REQUIRE_ADMIN_UI=1`)
and fails the build when it does not. `dist/control-ui` is gitignored with
nothing tracked under it, so the SPA has to be assembled into the build context
first: `deploy.yml` clones the private `hanzoai/admin` workspace with `GH_PAT`,
builds `apps/admin-bot` with bun, and runs `scripts/sync-admin-ui.sh`.

This is why `deploy.yml` uses `context: .`. A remote git context cannot see
anything assembled into the workspace, so the assembly and the build have to
share one local context. The `.hanzo` deploy that existed before this had
neither the assembly step nor a local context, so it could not have produced an
image.

### A build never deploys itself

`deploy.yml` publishes and stops. The tag that runs is `spec.image.tag` in
`hanzoai/universe` `infra/k8s/operator/crs/bot-gateway.yaml`, which is a reviewed
change; `crs/kustomization.yaml` lists CRs explicitly, so nothing is picked up by
a glob. A CI-side `kubectl patch` is reverted within minutes by cd.hanzo.ai's
selfHeal anyway.

Tags: a `v*` tag publishes `:X.Y.Z` and `:latest`; a push to `main` publishes
`:sha-<sha7>` and `:latest`; `dev` and `test` publish `:sha-<sha7>` only, so
`:latest` keeps meaning main. `bot-gateway.yaml` pins a calver tag such as
`2026.7.22`, which comes from the `v*` path.

### Required forge secrets

| Secret | Used by | Without it |
|---|---|---|
| `GIT_TOKEN` | `sync.yml` (on GitHub) | refs never reach the forge, so nothing runs at all |
| `GH_PAT` | `deploy.yml` | the private admin SPA cannot be cloned; the build fails loud |
| `GHCR_USER` / `GHCR_TOKEN` | `deploy.yml`, `cloud.yml` | the registry 403s the push |
| `NPM_TOKEN` | `release.yml` | `@hanzo/bot` cannot be published |

### Known gaps, written down rather than hidden

- **`ghcr.io/hanzoai/bot-browser` has no producer.** `universe`
  `crs/bot-browser.yaml` pins it at `v0.1.0`, but no workflow builds it — only
  `scripts/sandbox-browser-setup.sh`, by hand, locally.
- **`bot-cloud` has no consumer.** Nothing in `universe` references it.
- **`@hanzo/bot` has never actually published.** npm has `2026.6.5`, cut while
  the publisher did not exist. `package.json` now reads `2026.7.2`, tracking
  upstream's calver, because after the transplant the tree *is* upstream
  `2026.7.2` plus the brand — any other number would misstate what ships.
- **The macOS checks do not run.** They need a macOS runner on the forge; see the
  header of `ci.yml`.

### Deleted rather than migrated

- `k8s-deploy-bot.yml` — deployed by hand with `kubectl set env` and wrote
  ANTHROPIC/HANZO API keys as plaintext into a running pod via `kubectl exec`.
  Secrets live in KMS, and the App CR decides what runs.
- `k8s-create-iam-app.yml`, `k8s-debug.yml`, `k8s-recreate-agent.yml` —
  dispatch-only imperative one-shots, superseded by IAM and the universe CRs.
- `formal-conformance.yml` — `continue-on-error: true` on every job plus a bare
  `exit 0`. It could not fail, which makes it worse than absent.
- `auto-response.yml`, `labeler.yml` — upstream's issue/PR triage bots.
- `workflow-sanity.yml` — hardcoded to `pathlib.Path(".github/workflows")`, so
  after this move it would lint an empty directory and pass. Its useful half
  (auditing changed workflows with zizmor) lives in `ci.yml`, now pointed at
  both directories.
