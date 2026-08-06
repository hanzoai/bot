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

## How this ships

One way, and it runs on our own stack:

    push  ->  github.com/hanzoai/bot            (a mirror)
              .github/workflows/sync.yml         carries refs onward
      ->  git.hanzo.ai/hanzoai/bot               CANONICAL
              .hanzo/workflows/ci.yml            the checks
              .hanzo/workflows/deploy.yml        builds ghcr.io/hanzoai/bot
              .hanzo/workflows/cloud.yml         builds ghcr.io/hanzoai/bot-cloud
              .hanzo/workflows/release.yml       publishes npm @hanzo/bot
      ->  hanzoai/universe crs/bot-gateway.yaml  names the tag that is live
      ->  hanzoai/operator                       reconciles the App
      ->  hanzoai/ingress serves bot.hanzo.ai, gw.hanzo.bot, market.hanzo.bot

**git.hanzo.ai is canonical; GitHub is a mirror.** `.github/workflows/` holds
exactly one file, `sync.yml`, and its only job is getting refs to the forge.
Every build, check and release is a workflow under `.hanzo/workflows/`, which the
forge reads. `.hanzo/workflows` uses GitHub Actions syntax, so a workflow moves
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

| Secret                     | Used by                   | Without it                                                   |
| -------------------------- | ------------------------- | ------------------------------------------------------------ |
| `GIT_TOKEN`                | `sync.yml` (on GitHub)    | refs never reach the forge, so nothing runs at all           |
| `GH_PAT`                   | `deploy.yml`              | the private admin SPA cannot be cloned; the build fails loud |
| `GHCR_USER` / `GHCR_TOKEN` | `deploy.yml`, `cloud.yml` | the registry 403s the push                                   |
| `NPM_TOKEN`                | `release.yml`             | `@hanzo/bot` cannot be published                             |

### Known gaps, written down rather than hidden

- **`ghcr.io/hanzoai/bot-browser` has no producer.** `universe`
  `crs/bot-browser.yaml` pins it at `v0.1.0`, but no workflow builds it — only
  `scripts/sandbox-browser-setup.sh`, by hand, locally.
- **`bot-cloud` HAS a consumer, and it is not in `universe`.** `hanzoai/playground`
  provisions desktop-mode cloud agents from `ghcr.io/hanzoai/bot-cloud:latest`
  (`internal/config/cloud.go` `BotCloudImage`, used by
  `internal/cloud/provisioner.go`). The App CR `hanzo-playground` overrides
  `..._OPERATIVE_IMAGE` but NOT the bot-cloud image, so production takes the
  default — a floating `:latest`, which is the real gap here. Looking for the
  consumer in `universe` and concluding there is none is what made
  `docker/cloud-entrypoint.sh` read like dead code; it is the entrypoint of every
  playground desktop agent.
- **The live `bot` tag shares NO history with `main`.** `v2026.7.22` — the calver
  `crs/bot-gateway.yaml` pins — and `origin/main` have an EMPTY merge base
  (34,825 commits one way, 34,660 the other; see the `pre-ancestry-rebuild` and
  `pre-transplant` tags). So "cut the next calver from main" is not a patch over
  what runs; it is a jump across a history rewrite, and a diff against the live
  tag says nothing. Establish what actually changed before shipping one.
- **`@hanzo/bot` is two versions behind.** npm has `2026.6.5`, `package.json`
  says `2026.6.7`; both were cut while the publisher did not exist.
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

## The sandbox: a run is a computer

`POST /v1/coding-tasks` (`src/gateway/coding-tasks-http.ts`) takes four things
that matter, and everything else is derived from them:

| field                               | meaning                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prompt`                            | the task                                                                                                                                                                                   |
| `tool`                              | `dev \| claude \| codex \| python \| node` — default `dev`                                                                                                                                 |
| `cloneUrl` (+`branch`,`credential`) | **OPTIONAL.** Present ⇒ a git grant rides with it. Absent ⇒ no clone, no push, and **no credential exists in the run at all** — a credential sent without one is a 400, not a silent drop. |
| `desktop`                           | **OPTIONAL.** Selects the xvfb image variant.                                                                                                                                              |

Three things about that table are load-bearing.

**`tool` is a data table, not a switch.** `TOOLS` in `coding-task.ts` maps a name
to an argv, and every runner — host seam and docker — reads that one map. There
is no second place where "what does `claude` run" could answer differently. Each
agent entry passes its own "stop asking me" flag (`--dangerously-skip-permissions`
and friends), which is honest _here and only here_: the container is the
boundary, and a second in-process approval prompt inside a box that has already
dropped every capability just hangs a non-interactive run forever.

**`repo` is optional because git is a capability of a run, not the shape of one.**
`runCodingTask` is `[clone] → run the tool → [commit, push]`; the brackets are
the repo. Deep research and a bare `python` snippet want the same computer with
nothing checked out into it.

**`desktop` is a TAG.** Headless and xvfb are two tags of one image and the flag
picks the tag (`imageFor`). Nothing downstream branches on it. If the
orchestrator reasoned about it instead, there would be two code paths to keep in
step, and they would drift.

### The image: one browser, two ways to run it

`Dockerfile.box` → `registry.hanzo.ai/hanzoai/sandbox`, three tags on one chain
`exec → dev → desktop`.

**The browser lives in `exec`, at the bottom.** It used to be in `desktop`, which
meant the DEFAULT class for an agent run could not open a web page. The class
boundary is cut on RUNTIME cost — `desktop` earns its tag because Xvfb, openbox,
x0vncserver and websockify are four processes running forever on every desktop
pod. A browser binary nobody launched costs nothing at runtime, and layers are
shared per node. So `desktop` does not add a browser; it adds a **screen** for
the browser that is already there.

The half that was missing was not the browser but the **library**. `npx playwright
install` fetches the chromium build to `PLAYWRIGHT_BROWSERS_PATH` and leaves the
npm package in an npx cache that the next line deletes — a real chromium at
`/opt/playwright` that nothing in the image could drive (`require("playwright")`
threw MODULE_NOT_FOUND, measured on the built image). It is now `npm install -g
playwright` + `NODE_PATH=/usr/local/lib/node_modules`, so `require("playwright")`
resolves from any cwd **with the network turned all the way down** — which is the
state a confined sandbox is supposed to run in.

Measured on the published amd64 images (compressed): `exec` 1.09 GB · `dev`
1.18 GB · `desktop` 1.69 GB. Moving the browser down adds ~0.4 GB to `exec` and
`dev` and leaves `desktop` where it was.

Chromium runs as uid 1000 **with its own sandbox left on** — no `--no-sandbox`
needed. What it does need comes from the container, not the image, and
`createDockerRuntime` sets both: `--shm-size=1g` (Docker's default 64 MiB
/dev/shm makes Chromium die mid-page-load as a renderer crash, which reads like a
flaky site) and `--init` (a browser forks a tree of zygote and renderer
processes; `docker exec` children are not under the image's tini).

### Env names

`SANDBOX_IMAGE`, `SANDBOX_NETWORK`, `SANDBOX_RUNTIME_CLASS`. The old
`HANZO_CODING_SANDBOX_*` names are accepted for ONE release so a deploy cannot
half-land, then they are deleted — they are not permanent aliases, because two
live names for one knob is how nobody can say which value won. The prefix was
wrong by construction: deep research and bare exec want the same sandbox and
neither is coding. `apps/bots/transport.go` keeps `BOT_GATEWAY_URL` for actual
bot traffic; that name is right for what it does.

`SANDBOX_IMAGE` names the **repo**. `SANDBOX_IMAGE_TAG` optionally pins a
version. What `imageFor` composes from those is dictated by the producer, and
the producer's shape is not the obvious guess — see below.

### Known gaps, measured 2026-08-06

- **A bare `:<class>` tag is a name no build can create.** hanzoai/ci's image
  lane composes every tag from `tag-suffix` and emits exactly three:
  `sha-<short>-amd64-<class>`, `<class>-latest`, `<version>-<class>`. **The
  order flips** — the floating tag is class-FIRST (`${sfx:+$sfx-}latest`), the
  pinned one class-LAST (`${sfx:+-$sfx}`) — and nothing in those 1837 lines emits
  `<class>` alone. So `imageFor` here composes `<class>-latest` unpinned and
  `<version>-<class>` pinned, and a test asserts it never produces the bare form.
- **The moving tags in the registry are not our image.** `:exec`, `:dev`,
  `:desktop` and all three `*-latest` resolve to ONE digest — `sha256:0557ac14…`,
  a stock `node:22` (entrypoint `docker-entrypoint.sh`, cmd `node`, Debian 12,
  root). The real builds exist only as `sha-d190451-amd64-<class>` and
  `2026.6.7-<class>`, three correct distinct digests. The build lane cannot have
  done this — it has no placeholder push, and its `crane` step only mirrors refs
  already in its own tag list — so six moving tags were overwritten out of band.
  Meanwhile cloud's `apps/sandbox` asks for the bare `<repo>:<class>`, so **every
  sandbox pod in production is a bare node:22**: no toolchain, no `dev`, no
  browser, running as root. A container that starts, reads EOF and exits 0 looks
  like a run that "worked". This is why `createDockerRuntime` now names the
  command EXPLICITLY for both classes instead of relying on the image's CMD — a
  wrong image fails loudly instead of quietly.
- **hanzoai/ci's mirror step copies this image into the wrong org.** It rewrites
  `hanzoai` → `hanzo` on the way out, so a `repo:` that already names
  `registry.hanzo.ai/hanzoai/sandbox` gets crane-copied to
  `registry.hanzo.ai/hanzo/sandbox` as well — a second repo nothing pulls.
- **Egress from a sandbox is unrestricted**, and a browser makes that matter more
  — see the security note below.

### Security: what a prompt-injected run can reach

Measured from a live pod in `hanzo-sandboxes` on hanzo-k8s, not inferred:

| target                                                     | result                                                                                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| arbitrary internet (`example.com`, `1.1.1.1`, npm, GitHub) | **reachable**                                                                                                                 |
| `bot-gateway.hanzo.svc`, `kubernetes.default.svc`          | **reachable**                                                                                                                 |
| `cloud.hanzo.svc`, `kms.hanzo.svc`                         | blocked                                                                                                                       |
| kubelet on the node IP `:10250`                            | blocked                                                                                                                       |
| **DO droplet metadata `169.254.169.254`**                  | **reachable — `/metadata/v1/user-data` is 6005 bytes containing an RSA PRIVATE KEY, a bootstrap token and `k8saas` material** |
| pod service-account token                                  | not mounted (`automountServiceAccountToken: false`)                                                                           |

No NetworkPolicy selects these pods and no `runtimeClassName` is set, so they run
under `runc` on the default network. The metadata row is the serious one: one
`curl` from untrusted model output reads node bootstrap credentials. A browser
does not create that hole, but it is an egress channel by definition — and with
indirect prompt injection the _page being read_ becomes the instruction source,
so "fetch this, then POST it there" needs no operator in the loop.

What confines it, in the order the reward/effort ratio says to do it:

1. A NetworkPolicy on `hanzo-sandboxes` denying `169.254.169.254/32` and RFC1918
   on egress. This is the single highest-value change and it is one manifest.
2. `SANDBOX_NETWORK` set (docker path) — today unset means the default bridge,
   which is the whole internet.
3. `SANDBOX_RUNTIME_CLASS`. It is ONE FIELD and a deployment value — never a fork
   in code. The benchmark on this fleet: Firecracker beat gVisor on both latency
   and memory (git status 82 ms vs 980 ms; start 294 ms vs 881 ms; ~57 MiB both);
   runc is fastest and weakest.
