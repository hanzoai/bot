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

    push  ->  github.com/hanzoai/bot            the ONLY ref you can write
      ->  git.hanzo.ai/hanzoai/bot               CANONICAL, and read-only
              .hanzo/workflows/ci.yml            the checks
              .hanzo/workflows/deploy.yml        builds ghcr.io/hanzoai/bot
              .hanzo/workflows/cloud.yml         builds ghcr.io/hanzoai/bot-cloud
              .hanzo/workflows/cicd.yml          builds registry.hanzo.ai/hanzoai/sandbox
              .hanzo/workflows/release.yml       publishes npm @hanzo/bot
      ->  hanzoai/universe crs/bot-gateway.yaml  names the tag that is live
      ->  hanzoai/operator                       reconciles the App
      ->  hanzoai/ingress serves bot.hanzo.ai, gw.hanzo.bot, market.hanzo.bot

**git.hanzo.ai is canonical; GitHub is a mirror.** Every build, check and release
is a workflow under `.hanzo/workflows/`, which the forge reads.

PUSH TO GITHUB. THE FORGE PULLS, AND IT WILL REFUSE YOU IF YOU TRY.
`git push forge main` answers `Mirror Repository hanzoai/bot is read-only`,
because the forge side is a PULL mirror: it fetches from GitHub on its own clock
and no one writes to it. So "canonical" here means the forge is what the fleet
reads and where every check runs — not that it is where a commit lands first.

There is no `sync.yml` and there never needs to be one; `.github/workflows/` is
EMPTY. Nothing in this repo carries refs onward because the mirror is configured
on the forge, against the repository, where no file here can describe it. Confirm
a push arrived with `git ls-remote forge main` rather than by looking for a
workflow that was never written. `.hanzo/workflows` uses GitHub Actions syntax, so a workflow moves
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

`Dockerfile.sandbox` → `registry.hanzo.ai/hanzoai/sandbox`, four tags on one chain
that forks once: `exec → dev → {desktop, admin}`.

**`admin` is a tag that is NOT a class.** The other three are words a caller puts
in a request; `admin` is one nobody can ask for. hanzoai/cloud substitutes it for
a **SuperAdmin's** `dev` sandbox (`apps/sandbox/runtime.go` `imageFor(class,
super)`, predicate `principal.IsSuperAdmin`) and leaves every other caller's
`dev` exactly as it was. Which bytes you get is a fact about the caller, so a
fourth class would be the one thing it must not be: a field every caller can set.

It adds zsh, kubectl and doctl to `dev`. **It adds no credential, and that is
load-bearing** — kubectl with no kubeconfig and doctl with no token are argument
parsers, so the image confers no authority and "who may pull it" is a bandwidth
question rather than an access one. Any future credential must reach the **pod**
from the identity that leased it, never a layer in a registry.

Layered on `dev` because a substitute has to be a superset of what it replaces:
`exec` stays the throwaway a tool call spends fifteen minutes in, and `desktop`
keeps the screen `admin` has no X server for. kubectl is pinned on the **1.35**
line, not `stable` — DOKS runs 1.34 and kubectl is supported within one minor of
its apiserver, so today's stable 1.36 is out of skew with every cluster this box
exists to reach.

zsh's config is `docker/zshrc` → `/etc/zsh/zshrc`, system-wide and framework-free
(a dotfile is the same file somewhere a fresh home, a `su` or a HOME override
stops reading, and the only volume a sandbox mounts is `/work`). The build
asserts the rc was **read**, not merely that zsh runs.

The terminal picks it up on its own: cloud's `shell()` is a preference chain,
`zsh → bash → sh`, so an image without zsh costs a caller nothing.

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

**The browser also has a NAME now.** Playwright unpacks it to
`/opt/playwright/chromium-1234/chrome-linux64/chrome` — a path a library resolves
and a person never types — so an agent that shelled out to `chromium` got
"command not found" for a browser three directories away. One symlink,
`/usr/local/bin/chromium`, is the single fact; `chromium-browser` and
`google-chrome` link to it, and `CHROME_BIN` / `CHROME_PATH` /
`PUPPETEER_EXECUTABLE_PATH` name it for the three tools that ask in three
different spellings. Nothing repeats the versioned path, so a playwright bump
moves one target. A symlink is enough because chromium finds its resource bundle
from the realpath of `/proc/self/exe`; the build proves it with `chromium
--version`.

### Three products, three binaries

`hanzo`, `dev` and `hanzo-mcp` are **native Rust binaries** fetched from GitHub
release assets, not npm packages:

| binary      | from                       | what it is                                          |
| ----------- | -------------------------- | --------------------------------------------------- |
| `hanzo`     | `hanzoai/cli` v1.9.37      | the cloud CLI — auth, billing, every product        |
| `dev`       | `hanzoai/dev` v0.6.91      | the coding agent; `dev exec …` is what TOOLS spells |
| `hanzo-mcp` | `hanzoai/mcp` rust-v1.1.15 | the MCP server, 13 HIP-0300 tools over JSON-RPC     |

What this replaced was `npm install -g @hanzo/dev`, and it was wrong three ways
at once. It put a **Node shim** at `/usr/local/bin/dev` that spawns a native
binary nested in its own `node_modules`, so launching the agent needed a working
node. That package also claims the bin name `hanzo`, which is why the CLOUD CLI
was a symlink to the AGENT and no `hanzo` command existed at all. And the MCP
server has no package on that path, so it was simply **absent** — measured in a
live pod: `hanzo` and `dev` were the same `dev.js`, `command -v hanzo-mcp` was
empty. A build-time assert now refuses an image where `hanzo` and `dev` resolve
to one file again.

One fetch rule, which is the publisher's own (`hanzoai/cli` `install.sh`): every
Hanzo binary is a release asset named `<BIN>-<os>-<arch>.tar.gz` unpacking to a
single file named `<BIN>`. So the Dockerfile has one loop over `(repo, tag, bin,
sha256)` and a fourth binary costs one line. Checksums are **literals**, read
from the publisher, not the `.sha256` beside the asset — a digest fetched from
the same host proves the transport, not the bytes we agreed to ship, and a
release asset can be replaced under a tag that never moves.

**`hanzo` is pinned at 1.9.37, not at latest, and that is a gap.**
`hanzoai/cli`'s newest release is v1.9.40 and its release matrix declares a
`linux-amd64` target, but v1.9.40 published only darwin-amd64, darwin-arm64,
linux-arm64 and windows-amd64. There is no linux-amd64 asset to fetch and this
image is linux-amd64; 1.9.37 is the newest release that has one. When that
matrix publishes linux-amd64 again this is one version and one checksum.

### The version is the image's own

`docker/sandbox.version` — one file, read twice. `hanzo.yml`'s `version:` key
turns it into the published `<version>-<class>` tag through `hanzoai/ci`'s
`imgver`, and `Dockerfile.sandbox` COPYs the same file to `/etc/sandbox-version`, so
a running pod can be asked what it is and cannot disagree with its own tag.

Before this, `imgver` fell back to the build context's manifest — the repo root's
`package.json`, which is **bot's** version, `2026.6.7`, last bumped 2026-06-07.
So today's rebuild republished `2026.6.7-desktop` from source two months newer:
`2026.6.7-desktop` and `sha-d190451-amd64-desktop` are one digest,
`sha256:7a41f69f…`. A tag that gets rewritten is not a pin, and one that LOOKS
pinned is worse than `latest`, which at least admits what it is — which is
precisely why `hanzoai/cloud` had to pin these images by digest. The series
starts at `1.0.0` because `2026.6.7` was never this artifact's number; the old
tags stay in the registry as archaeology.

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

- **The desktop class serves nothing, and the missing piece was never in this
  image.** `command -v x11vnc` is empty and that is deliberate — the VNC server
  here is TigerVNC's `x0vncserver`, from `tigervnc-scraping-server`, chosen over
  x11vnc for the MSG_PEEK deadlock (see `Dockerfile.sandbox`). What kept port 5900
  unserved was `hanzoai/cloud` `apps/sandbox/runtime.go` setting
  `command: ["sleep","infinity"]` on every pod: a k8s `command` with no `args`
  replaces the image's ENTRYPOINT **and** CMD, so `sandbox-desktop` never ran and
  tini was never PID 1. Proven in a live desktop pod — `/proc/1/cmdline` was
  `sleep infinity` and `ss -ltn` was empty; running the script by hand brought X
  up on `:1` with `127.0.0.1:5900` and `127.0.0.1:6080` LISTENing, nothing
  installed. The override is removed on cloud's side; the image now asserts
  Xvfb/openbox/x0vncserver/websockify/xdpyinfo at build time so the natural wrong
  diagnosis is answered by the build.
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

### Security: what a prompt-injected run can reach

Re-measured 2026-08-06 **after** the NetworkPolicy landed, from a labelled pod in
`hanzo-sandboxes` on hanzo-k8s. Every row has a control in the same shell, because
a probe that returns nothing proves nothing on its own — it looks identical
whether the target is blocked or the tool is missing.

| target                                               | result                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| arbitrary internet (`example.com`) — the CONTROL     | **reachable**, 200, 559 bytes                                              |
| **DO droplet metadata `169.254.169.254`**            | **blocked** — `/metadata/v1/id` and `/metadata/v1/user-data` both time out |
| `cloud.hanzo.svc`, `kms.hanzo.svc`, kubelet `:10250` | blocked                                                                    |
| pod service-account token                            | not mounted (`automountServiceAccountToken: false`)                        |

`sandbox-isolation` in `hanzo-sandboxes` selects `hanzo.ai/sandbox-class` (Exists)
and its egress ipBlock is `0.0.0.0/0` except `10.0.0.0/8`, `172.16.0.0/12`,
`192.168.0.0/16`, **`169.254.0.0/16`**. That last entry is the metadata one, and
it is not RFC1918 — writing "the private ranges" from memory leaves it out, which
is exactly how it was left out everywhere else.

**The hole was NOT the sandbox namespace, and the fix there did not close it.**
The same probe from `bot-gateway` in namespace `hanzo` answered 200 with 5983
bytes of `/metadata/v1/user-data` — the node's cloud-init: a private key, a
bootstrap token, `k8saas` join material. Status and length only; the body was
never read. The negative control is what makes that finding solid: from the same
shell the node's own `10.124.0.38:10250` timed out, so the except-list WAS being
enforced and link-local was simply not in it. `hanzo/policy` is a `podSelector: {}`
blanket, and NetworkPolicy allows are ADDITIVE — `hanzo/lsp` already carried the
correct four-entry list and its pod reached the metadata service anyway, because
the blanket rule granted what the tight one withheld. Fixed in universe
`charts/app/values/hanzo/policy.yaml`.

A browser does not create any of this, but it is an egress channel by definition
— and with indirect prompt injection the _page being read_ becomes the
instruction source, so "fetch this, then POST it there" needs no operator.

What confines a run, in reward/effort order:

1. **A NetworkPolicy** — done, in both namespaces. This is the load-bearing
   control and it is declarative, which is the reason the Kubernetes path is the
   one production uses.
2. **`SANDBOX_NETWORK` (docker path) — now REQUIRED; unset is a refusal.** It used
   to be optional, and unset meant docker's default bridge, which routes through
   the host and therefore reaches `169.254.169.254`. Docker has no per-network
   egress ACL — a user-defined bridge reaches link-local exactly like the default
   one, and a container without `NET_ADMIN` cannot blackhole the route itself — so
   confinement there has to come from the host's `DOCKER-USER` chain, which is
   host state this process cannot see. What `sandboxNetwork()` can honestly check
   is that an operator NAMED a network, and that the name is not `host` or
   `container:<id>`; those are the absence of a network, not a choice of one.
3. **`SANDBOX_RUNTIME_CLASS`.** ONE FIELD, a deployment value, never a fork in
   code. `gvisor` is live on `code-exec-pool`. The benchmark on this fleet:
   Firecracker beat gVisor on both latency and memory (git status 82 ms vs
   980 ms; start 294 ms vs 881 ms; ~57 MiB both), but firecracker-containerd has
   never cut a release — so that is a deployment choice, not something to encode.

**There are two sandbox execution paths and only one of them runs in
production.** Kubernetes (cloud `apps/sandbox`) is deployed, confined and
verified. The docker path has no docker endpoint on `bot-gateway` — no CLI, no
socket — so `POST /v1/coding-tasks` refuses there rather than running unconfined.
It exists for the single-binary local case, where docker is the only runtime
available. Point 2 is what keeps it from ever silently becoming a second
production path.
