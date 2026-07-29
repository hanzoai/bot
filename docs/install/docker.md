---
summary: "Optional Docker-based setup and onboarding for Bot"
read_when:
  - You want a containerized gateway instead of local installs
  - You are validating the Docker flow
title: "Docker"
---

Docker is **optional**. Use it for an isolated, throwaway gateway environment or a host without local installs. If you already develop on your own machine, use the normal install flow instead.

The default sandbox backend uses Docker when `agents.defaults.sandbox` is enabled, but sandboxing is off by default and does not require the gateway itself to run in Docker. SSH and OpenShell sandbox backends are also available; see [Sandboxing](/gateway/sandboxing).

Hosting multiple users? See [Multi-tenant hosting](/gateway/multi-tenant-hosting) for the one-cell-per-tenant model.

## Prerequisites

- Docker Desktop (or Docker Engine) + Docker Compose v2
- At least 2 GB RAM for image build (`pnpm install` may be OOM-killed on 1 GB hosts with exit 137)
- Enough disk for images and logs
- On a VPS/public host, review [Security hardening for network exposure](/gateway/security), especially the Docker `DOCKER-USER` firewall chain

## Containerized gateway

<Steps>
  <Step title="Build the image">
    From the repo root:

    ```bash
    ./scripts/docker/setup.sh
    ```

    This builds the gateway image locally as `bot:local`. To use a pre-built image instead:

    ```bash
    export BOT_IMAGE="ghcr.io/hanzoai/bot:latest"
    ./scripts/docker/setup.sh
    ```

    Pre-built images are published first to the [GitHub Container Registry](https://github.com/hanzoai/bot/pkgs/container/bot). GHCR is the primary registry for release automation, pinned deployments, and provenance checks. The same release publishes a Docker Hub mirror at `hanzoai/bot`:

    ```bash
    export BOT_IMAGE="hanzoai/bot:latest"
    ./scripts/docker/setup.sh
    ```

    Use `ghcr.io/hanzoai/bot` or `hanzoai/bot` and avoid unofficial mirrors, which don't share Bot's release timing or retention policy. Version-specific tags include releases such as `2026.2.26` and prereleases such as `2026.2.26-beta.1`. Stable releases move `latest` and `main`; trailing-month Gateway releases move only `extended-stable`. Variants include `slim`, `main-slim`, `extended-stable-slim`, `latest-browser`, `main-browser`, and `extended-stable-browser`. The default images bundle the `codex` and `diagnostics-otel` plugins. A `-browser` variant also ships with Chromium baked in, useful for the [sandboxed browser](/gateway/sandboxing#sandboxed-browser) tool without a first-run Playwright install.

  </Step>

  <Step title="Airgapped rerun">
    On offline hosts, transfer and load the image first:

    ```bash
    docker load -i bot-image.tar
    export BOT_IMAGE="ghcr.io/hanzoai/bot:latest"
    ./scripts/docker/setup.sh --offline
    ```

    `--offline` verifies `BOT_IMAGE` already exists locally, disables implicit Compose pulls/builds, then runs the normal flow: `.env` sync, permission fixes, onboarding, gateway config sync, Compose startup.

    If `BOT_SANDBOX=1`, offline setup also checks the configured default and per-agent sandbox images on the daemon behind `BOT_DOCKER_SOCKET`, including the browser-contract label on Docker-backed browser images. If a required image is missing or stale, setup exits without changing sandbox config rather than reporting a broken success.

  </Step>

  <Step title="Complete onboarding">
    The setup script runs onboarding automatically:

    - prompts for provider API keys
    - generates a gateway token and writes it to `.env`
    - creates the auth-profile secret key directory
    - starts the gateway via Docker Compose

    Pre-start onboarding and config writes run through `bot-gateway` directly (with `--no-deps --entrypoint node`), since `bot-cli` shares the gateway's network namespace and only works once the gateway container exists.

  </Step>

  <Step title="Open the Control UI">
    Open `http://127.0.0.1:18789/` and paste the token written to `.env` into Settings. If you switched the container to password auth, use that password instead.

    Need the URL again?

    ```bash
    docker compose run --rm bot-cli dashboard --no-open
    ```

  </Step>

  <Step title="Configure channels (optional)">
    ```bash
    # WhatsApp (QR)
    docker compose run --rm bot-cli channels login

    # Telegram
    docker compose run --rm bot-cli channels add --channel telegram --token "<token>"

    # Discord
    docker compose run --rm bot-cli channels add --channel discord --token "<token>"
    ```

    Docs: [WhatsApp](/channels/whatsapp), [Telegram](/channels/telegram), [Discord](/channels/discord)

  </Step>
</Steps>

### Manual flow

```bash
BUILD_GIT_COMMIT="$(git rev-parse HEAD)"
BUILD_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
docker build \
  --build-arg "GIT_COMMIT=${BUILD_GIT_COMMIT}" \
  --build-arg "BOT_BUILD_TIMESTAMP=${BUILD_TIMESTAMP}" \
  -t bot:local -f Dockerfile .
docker compose run --rm --no-deps --entrypoint node bot-gateway \
  dist/index.js onboard --mode local --no-install-daemon
docker compose run --rm --no-deps --entrypoint node bot-gateway \
  dist/index.js config set --batch-json '[{"path":"gateway.mode","value":"local"},{"path":"gateway.bind","value":"lan"},{"path":"gateway.controlUi.allowedOrigins","value":["http://localhost:18789","http://127.0.0.1:18789"]}]'
docker compose up -d bot-gateway
```

The Docker context excludes `.git`. Pass the source identity as build arguments
as shown above so the image's About screen reports the checked-out commit and
one build timestamp. `scripts/docker/setup.sh` resolves and passes both values
automatically.

<Note>
Run `docker compose` from the repo root. If you enabled `BOT_EXTRA_MOUNTS` or `BOT_HOME_VOLUME`, the setup script writes `docker-compose.extra.yml`; include it after any `docker-compose.override.yml` you maintain yourself, e.g. `-f docker-compose.yml -f docker-compose.override.yml -f docker-compose.extra.yml`.
</Note>

### Upgrading container images

When you replace the Bot image but keep the same mounted state/config, the
new gateway runs startup-safe upgrade migrations and plugin convergence before
readiness. Routine image upgrades should not require a separate
`bot doctor --fix` pass.

If startup cannot complete those repairs safely, the gateway exits instead of
reporting healthy. With a restart policy, Docker, Podman, or Kubernetes may show
the gateway container restarting. Keep the mounted state volume, then run the
same image once with `bot doctor --fix` as the container command, using the
same state/config mounts the gateway uses:

```bash
docker run --rm -v <bot-state>:/home/node/.bot <image> bot doctor --fix
podman run --rm -v <bot-state>:/home/node/.bot <image> bot doctor --fix
```

After doctor finishes, restart the gateway container with its default command.
In Kubernetes, run the same command in a one-off Job or debug pod mounted to the
same PVC, then restart the Deployment or StatefulSet.

### Environment variables

Optional variables accepted by `scripts/docker/setup.sh` (and, for the gateway container, by `docker-compose.yml` directly):

| Variable                                        | Purpose                                                                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `BOT_IMAGE`                                | Use a remote image instead of building locally                                                                    |
| `BOT_IMAGE_APT_PACKAGES`                   | Install extra apt packages during build (space-separated). Legacy alias: `BOT_DOCKER_APT_PACKAGES`           |
| `BOT_IMAGE_PIP_PACKAGES`                   | Install extra Python packages during build (space-separated)                                                      |
| `BOT_EXTENSIONS`                           | Compile/package supported selected plugins and install their runtime dependencies (comma- or space-separated ids) |
| `BOT_DOCKER_BUILD_NODE_OPTIONS`            | Override the local source-build Node options (default `--max-old-space-size=8192`)                                |
| `BOT_DOCKER_BUILD_TSDOWN_MAX_OLD_SPACE_MB` | Override the local source-build tsdown heap in MB                                                                 |
| `BOT_DOCKER_BUILD_SKIP_DTS`                | Skip declaration output during runtime-only local image builds (default `1`)                                      |
| `BOT_INSTALL_BROWSER`                      | Bake Chromium + Xvfb into the image at build time                                                                 |
| `BOT_EXTRA_MOUNTS`                         | Extra host bind mounts (comma-separated `source:target[:opts]`)                                                   |
| `BOT_HOME_VOLUME`                          | Persist `/home/node` in a named Docker volume                                                                     |
| `BOT_SANDBOX`                              | Opt in to sandbox bootstrap (`1`, `true`, `yes`, `on`)                                                            |
| `BOT_SKIP_ONBOARDING`                      | Skip the interactive onboarding step (`1`, `true`, `yes`, `on`)                                                   |
| `BOT_DOCKER_SOCKET`                        | Override the Docker socket path                                                                                   |
| `BOT_DISABLE_BONJOUR`                      | Force Bonjour/mDNS advertising on (`0`) or off (`1`); see [Bonjour / mDNS](#bonjour--mdns)                        |
| `BOT_DISABLE_BUNDLED_SOURCE_OVERLAYS`      | Disable bundled plugin source bind-mount overlays                                                                 |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                   | Shared OTLP/HTTP collector endpoint for OpenTelemetry export                                                      |
| `OTEL_EXPORTER_OTLP_*_ENDPOINT`                 | Signal-specific OTLP endpoints for traces, metrics, or logs                                                       |
| `OTEL_EXPORTER_OTLP_PROTOCOL`                   | OTLP protocol override. Only `http/protobuf` is supported today                                                   |
| `OTEL_SERVICE_NAME`                             | Service name used for OpenTelemetry resources                                                                     |
| `OTEL_SEMCONV_STABILITY_OPT_IN`                 | Opt in to latest experimental GenAI semantic attributes                                                           |
| `BOT_OTEL_PRELOADED`                       | Skip starting a second OpenTelemetry SDK when one is preloaded                                                    |

The official image ships no Homebrew. During onboarding, Bot hides brew-only skill dependency installers in a Linux container without `brew`; provide those dependencies through a custom image or install manually. Use `BOT_IMAGE_APT_PACKAGES` for Debian-packaged dependencies and `BOT_IMAGE_PIP_PACKAGES` for Python dependencies (runs `python3 -m pip install --break-system-packages` at build time, so pin versions and use only indexes you trust).

If Docker reports `ResourceExhausted`, `cannot allocate memory`, or aborts during `tsdown`, increase the Docker builder memory limit or retry with smaller explicit heaps:

```bash
BOT_DOCKER_BUILD_NODE_OPTIONS=--max-old-space-size=4096 BOT_DOCKER_BUILD_TSDOWN_MAX_OLD_SPACE_MB=4096
```

### Source-built images with selected plugins

`BOT_EXTENSIONS` selects plugin manifest ids from the source checkout;
existing source-directory names are also accepted when they differ. The Docker
build resolves the selection to source directories once, installs production
dependencies, and, when a selected plugin is published separately with
`bot.build.bundledDist: false`, compiles its runtime into the root bundled
dist. This Docker-only packaging does not change the plugin's npm or ClawHub
artifact contract. Unknown, invalid, or ambiguous ids fail the image build.
Known dependency/source-only ids keep their existing source and dependency
staging without gaining a compiled root dist entry. A selected plugin with
unified build entries must compile successfully; unselected external plugin
source and runtime output are pruned.

For example, these commands build separate, multi-architecture standalone
FakeCo gateway images for ClickClack, Slack, and Microsoft Teams. ClawRouter is
already part of the root Bot runtime, so the ClickClack image selects only
`clickclack`. The explicit empty browser argument keeps the default image free
of Chromium:

```bash
SOURCE_SHA="$(git rev-parse HEAD)"
BUILD_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
REGISTRY="registry.example.com/fakeco"

build_gateway_image() {
  gateway="$1"
  selected_plugin="$2"
  docker buildx build \
    --platform linux/amd64,linux/arm64 \
    --build-arg "GIT_COMMIT=${SOURCE_SHA}" \
    --build-arg "BOT_BUILD_TIMESTAMP=${BUILD_TIMESTAMP}" \
    --build-arg "BOT_EXTENSIONS=${selected_plugin}" \
    --build-arg BOT_INSTALL_BROWSER= \
    --provenance=mode=max \
    --sbom=true \
    --tag "${REGISTRY}/bot-${gateway}:${SOURCE_SHA}" \
    --push \
    .
}

build_gateway_image clickclack clickclack
build_gateway_image slack slack
build_gateway_image teams msteams
```

Use `--platform linux/arm64 --load` or `--platform linux/amd64 --load` for a
single native local build. Multi-platform output and attached SBOM/provenance
require a registry or another Buildx output that preserves attestations. After
pushing, inspect the manifest and deploy the immutable digest rather than the
mutable source-SHA tag:

```bash
docker buildx imagetools inspect \
  "${REGISTRY}/bot-clickclack:${SOURCE_SHA}"
# Deploy: registry.example.com/fakeco/bot-clickclack@sha256:<manifest-digest>
```

These images are for standalone OCI-based gateways and generic Docker users.
Crabhelm-managed gateways do not consume them: that delivery path builds a
separate x86_64 appliance archive containing an Bot npm tarball and pins
the Node, archive, and manifest digests. Build that appliance independently
from the same landed Bot source.

To test bundled plugin source against a packaged image, mount one plugin source directory over its packaged source path, e.g. `BOT_EXTRA_MOUNTS=/path/to/fork/extensions/synology-chat:/app/extensions/synology-chat:ro`. That overrides the matching compiled `/app/dist/extensions/synology-chat` bundle for the same plugin id.

### Observability

OpenTelemetry export is outbound from the Gateway container to your OTLP collector; it needs no published Docker port. To include the bundled exporter in a locally built image:

```bash
export BOT_EXTENSIONS="diagnostics-otel"
export OTEL_EXPORTER_OTLP_ENDPOINT="http://otel-collector:4318"
export OTEL_SERVICE_NAME="bot-gateway"
./scripts/docker/setup.sh
```

Official prebuilt images already bundle `diagnostics-otel`; install `clawhub:@hanzo/bot-diagnostics-otel` yourself only if you removed it. To enable export, allow and enable the `diagnostics-otel` plugin in config, then set `diagnostics.otel.enabled=true` (see the full example in [OpenTelemetry export](/gateway/opentelemetry)). Collector auth headers go through `diagnostics.otel.headers`, not Docker environment variables.

Prometheus metrics reuse the already-published Gateway port. Install `clawhub:@hanzo/bot-diagnostics-prometheus`, enable the `diagnostics-prometheus` plugin, then scrape:

```text
http://<gateway-host>:18789/api/diagnostics/prometheus
```

The route is protected by Gateway authentication; don't expose a separate public `/metrics` port or unauthenticated reverse-proxy path. See [Prometheus metrics](/gateway/prometheus).

### Health checks

Container probe endpoints (no auth required):

```bash
curl -fsS http://127.0.0.1:18789/healthz   # liveness
curl -fsS http://127.0.0.1:18789/readyz     # readiness
```

The image's built-in `HEALTHCHECK` pings `/healthz`; repeated failures mark the container `unhealthy` so orchestrators can restart or replace it.

Authenticated deep health snapshot:

```bash
docker compose exec bot-gateway node dist/index.js health --token "$BOT_GATEWAY_TOKEN"
```

### LAN vs loopback

`scripts/docker/setup.sh` defaults `BOT_GATEWAY_BIND=lan` so `http://127.0.0.1:18789` on the host works with Docker port publishing.

- `lan` (default): host browser and host CLI can reach the published gateway port.
- `loopback`: only processes inside the container network namespace can reach the gateway directly.

<Note>
Use bind mode values in `gateway.bind` (`lan` / `loopback` / `custom` / `tailnet` / `auto`), not host aliases like `0.0.0.0` or `127.0.0.1`.
</Note>

### Host local providers

Inside the container, `127.0.0.1` is the container itself, not the host. Use `host.docker.internal` for providers running on the host:

| Provider  | Host default URL         | Docker setup URL                    |
| --------- | ------------------------ | ----------------------------------- |
| LM Studio | `http://127.0.0.1:1234`  | `http://host.docker.internal:1234`  |
| Ollama    | `http://127.0.0.1:11434` | `http://host.docker.internal:11434` |

The bundled setup uses those URLs as LM Studio/Ollama onboarding defaults, and `docker-compose.yml` maps `host.docker.internal` to the host gateway on Linux Docker Engine (Docker Desktop provides the same alias on macOS/Windows). Host services must listen on an address Docker can reach:

```bash
lms server start --port 1234 --bind 0.0.0.0
OLLAMA_HOST=0.0.0.0:11434 ollama serve
```

Using your own Compose file or `docker run`? Add the same mapping yourself, e.g. `--add-host=host.docker.internal:host-gateway`.

### Claude CLI backend in Docker

The official image does not pre-install Claude Code. Install and log in inside the container's `node` user, then persist that container home so image upgrades don't erase the binary or auth state.

For a new install, enable a persistent `/home/node` volume before running setup:

```bash
export BOT_IMAGE="ghcr.io/hanzoai/bot:latest"
export BOT_HOME_VOLUME="bot_home"
./scripts/docker/setup.sh
```

For an existing install, stop the stack and reload the current `.env` values first — the setup script always rewrites `.env` from the current shell and defaults, it doesn't read the file on its own:

```bash
set -a
. ./.env
set +a
export BOT_HOME_VOLUME="${BOT_HOME_VOLUME:-bot_home}"
./scripts/docker/setup.sh
```

If `.env` contains values your shell can't source, re-export what you rely on manually first (`BOT_IMAGE`, ports, bind mode, custom paths, `BOT_EXTRA_MOUNTS`, sandbox, skip-onboarding). The generated overlay mounts the home volume for both `bot-gateway` and `bot-cli`; run the remaining commands with that overlay (and `docker-compose.override.yml` first, if you use one):

```bash
docker compose -f docker-compose.yml -f docker-compose.extra.yml run --rm \
  --entrypoint sh bot-cli -lc \
  'curl -fsSL https://claude.ai/install.sh | bash'
```

The native installer writes `claude` to `/home/node/.local/bin/claude`. The
Bot image includes `/home/node/.local/bin` on `PATH`, so the bundled
Anthropic plugin resolves it without an adapter config override.

Log in and verify from the same persisted home:

```bash
docker compose -f docker-compose.yml -f docker-compose.extra.yml run --rm \
  --entrypoint /home/node/.local/bin/claude bot-cli auth login
docker compose -f docker-compose.yml -f docker-compose.extra.yml run --rm \
  --entrypoint /home/node/.local/bin/claude bot-cli auth status --text
docker compose -f docker-compose.yml -f docker-compose.extra.yml run --rm \
  bot-cli models auth login \
  --provider anthropic --method cli --set-default
docker compose -f docker-compose.yml -f docker-compose.extra.yml run --rm \
  bot-cli models list --provider anthropic
```

Then use the bundled `claude-cli` backend:

```bash
docker compose -f docker-compose.yml -f docker-compose.extra.yml run --rm \
  bot-cli agent \
  --agent main \
  --model claude-cli/claude-sonnet-4-6 \
  --message "Say hello from Docker Claude CLI"
```

`BOT_HOME_VOLUME` persists the native install under `/home/node/.local/bin` and `/home/node/.local/share/claude`, plus Claude Code settings/auth under `/home/node/.claude` and `/home/node/.claude.json`. Persisting only `/home/node/.bot` is not enough; if you use `BOT_EXTRA_MOUNTS` instead of a home volume, mount all of those Claude paths into both services.

<Note>
For shared production automation or predictable Anthropic billing, prefer the Anthropic API-key path. Claude CLI reuse follows Claude Code's installed version, account login, billing, and update behavior.
</Note>

### Bonjour / mDNS

Docker bridge networking usually doesn't forward Bonjour/mDNS multicast (`224.0.0.251:5353`) reliably. When `BOT_DISABLE_BONJOUR` is unset, the bundled Bonjour plugin auto-disables LAN advertising once it detects it's running in a container, so it won't crash-loop retrying multicast the bridge drops. Set `BOT_DISABLE_BONJOUR=1` to force it off regardless of detection, or `0` to force it on (only on host networking, macvlan, or another network where mDNS multicast is known to work).

Use the published Gateway URL, Tailscale, or wide-area DNS-SD for Docker hosts otherwise. See [Bonjour discovery](/gateway/bonjour) for gotchas and troubleshooting.

### Storage and persistence

Docker Compose bind-mounts `BOT_CONFIG_DIR` to `/home/node/.bot`, `BOT_WORKSPACE_DIR` to `/home/node/.bot/workspace`, and `BOT_AUTH_PROFILE_SECRET_DIR` to `/home/node/.config/bot`, so those paths survive container replacement. When a variable is unset, `docker-compose.yml` falls back under `${HOME}`, or `/tmp` if `HOME` itself is missing, so `docker compose up` never emits an empty-source volume spec on bare environments.

That mounted config directory holds:

- `bot.json` for behavior config
- `agents/<agentId>/agent/auth-profiles.json` for stored provider OAuth/API-key auth
- `.env` for env-backed runtime secrets such as `BOT_GATEWAY_TOKEN`

The auth-profile secret directory stores the local encryption key for OAuth-backed auth profile token material. Keep it with your Docker host state, but separate from `BOT_CONFIG_DIR`.

Installed downloadable plugins store package state under the mounted Bot home, so install records and package roots survive container replacement; gateway startup does not regenerate bundled-plugin dependency trees.

For full VM persistence details, see [Docker VM Runtime - What persists where](/install/docker-vm-runtime#what-persists-where).

**Disk growth hotspots:** `media/`, per-agent SQLite databases, legacy session JSONL transcripts, the shared SQLite state database, installed plugin package roots, and rolling file logs under `/tmp/bot/`.

### Shell helpers (optional)

For shorter day-to-day commands, install [ClawDock](/install/clawdock):

```bash
mkdir -p ~/.clawdock && curl -sL https://raw.githubusercontent.com/hanzoai/bot/main/scripts/clawdock/clawdock-helpers.sh -o ~/.clawdock/clawdock-helpers.sh
echo 'source ~/.clawdock/clawdock-helpers.sh' >> ~/.zshrc && source ~/.zshrc
```

If you installed from the older `scripts/shell-helpers/clawdock-helpers.sh` path, rerun the command above so your local helper tracks the current location. Then use `clawdock-start`, `clawdock-stop`, `clawdock-dashboard`, etc. (run `clawdock-help` for the full list).

<AccordionGroup>
  <Accordion title="Enable agent sandbox for Docker gateway">
    ```bash
    export BOT_SANDBOX=1
    ./scripts/docker/setup.sh
    ```

    Custom socket path (e.g. rootless Docker):

    ```bash
    export BOT_SANDBOX=1
    export BOT_DOCKER_SOCKET=/run/user/1000/docker.sock
    ./scripts/docker/setup.sh
    ```

    The script mounts `docker.sock` only after sandbox prerequisites pass. If sandbox setup can't complete, it resets `agents.defaults.sandbox.mode` to `off`. Codex code mode is disabled for turns where the Bot sandbox is active (see [Sandboxing § Docker backend](/gateway/sandboxing#docker-backend)); never mount the host Docker socket into agent sandbox containers.

  </Accordion>

  <Accordion title="Automation / CI (non-interactive)">
    Disable Compose pseudo-TTY allocation with `-T`:

    ```bash
    docker compose run -T --rm bot-cli gateway probe
    docker compose run -T --rm bot-cli devices list --json
    ```

  </Accordion>

  <Accordion title="Shared-network security note">
    `bot-cli` uses `network_mode: "service:bot-gateway"` so CLI commands can reach the gateway over `127.0.0.1`. Treat this as a shared trust boundary. The compose config drops `NET_RAW`/`NET_ADMIN` and enables `no-new-privileges` on both `bot-gateway` and `bot-cli`.
  </Accordion>

  <Accordion title="Docker Desktop DNS failures in bot-cli">
    Some Docker Desktop setups fail DNS lookups from the shared-network `bot-cli` sidecar after `NET_RAW` is dropped, showing up as `EAI_AGAIN` during npm-backed commands like `bot plugins install`. Keep the default hardened compose file for normal operation. The override below restores default capabilities for the `bot-cli` container only — use it for the one-off command that needs registry access, not as your default invocation:

    ```bash
    printf '%s\n' \
      'services:' \
      '  bot-cli:' \
      '    cap_drop: !reset []' \
      > docker-compose.cli-no-dropped-caps.local.yml

    docker compose -f docker-compose.yml -f docker-compose.cli-no-dropped-caps.local.yml run --rm bot-cli plugins install <package>
    ```

    If you already created a long-running `bot-cli` container, recreate it with the same override — `docker compose exec`/`docker exec` can't change Linux capabilities on an already-created container.

  </Accordion>

  <Accordion title="Permissions and EACCES">
    The image runs as `node` (uid 1000). If you see permission errors on `/home/node/.bot`, make sure your host bind mounts are owned by uid 1000:

    ```bash
    sudo chown -R 1000:1000 /path/to/bot-config /path/to/bot-workspace
    ```

    The same mismatch can show up as `blocked plugin candidate: suspicious ownership (... uid=1000, expected uid=0 or root)` followed by `plugin present but blocked` — the process uid and the mounted plugin directory owner disagree. Prefer running as the default uid 1000 and fixing the bind mount ownership. Only chown `/path/to/bot-config/npm` to `root:root` if you intentionally run Bot as root long term.

  </Accordion>

  <Accordion title="Faster rebuilds">
    Order your Dockerfile so dependency layers are cached, avoiding a `pnpm install` rerun unless lockfiles change:

    ```dockerfile
    FROM node:24-bookworm
    RUN curl -fsSL https://bun.sh/install | bash
    ENV PATH="/root/.bun/bin:${PATH}"
    RUN corepack enable
    WORKDIR /app
    COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
    COPY ui/package.json ./ui/package.json
    COPY scripts ./scripts
    RUN pnpm install --frozen-lockfile
    COPY . .
    RUN pnpm build
    RUN pnpm ui:install
    RUN pnpm ui:build
    ENV NODE_ENV=production
    CMD ["node","dist/index.js"]
    ```

  </Accordion>

  <Accordion title="Power-user container options">
    The default image is security-first and runs as non-root `node`. For a more full-featured container:

    1. **Persist `/home/node`**: `export BOT_HOME_VOLUME="bot_home"`
    2. **Bake system deps**: `export BOT_IMAGE_APT_PACKAGES="git curl jq"`
    3. **Bake Python deps**: `export BOT_IMAGE_PIP_PACKAGES="requests==2.32.5 humanize==4.14.0"`
    4. **Bake Playwright Chromium**: `export BOT_INSTALL_BROWSER=1`, or use the official `-browser` image tag
    5. **Persist browser downloads and caches**: use `BOT_HOME_VOLUME` or `BOT_EXTRA_MOUNTS`. Bot auto-detects the image's Playwright-managed Chromium on Linux.

  </Accordion>

  <Accordion title="OpenAI Codex OAuth (headless Docker)">
    If you pick OpenAI Codex OAuth in the wizard, it opens a browser URL. In Docker or headless setups, copy the full redirect URL you land on and paste it back into the wizard to finish auth.
  </Accordion>

  <Accordion title="Base image metadata">
    The runtime image uses `node:24-bookworm-slim` and runs `tini` as PID 1 so zombie processes are reaped and signals handled correctly in long-running containers. It publishes OCI base-image annotations including `org.opencontainers.image.base.name` and `org.opencontainers.image.source`. Dependabot refreshes the pinned Node base digest; release builds don't run a separate distro upgrade layer. See [OCI image annotations](https://github.com/opencontainers/image-spec/blob/main/annotations.md).
  </Accordion>
</AccordionGroup>

### Running on a VPS?

See [Hetzner (Docker VPS)](/install/hetzner) and [Docker VM Runtime](/install/docker-vm-runtime) for shared VM deployment steps including binary baking, persistence, and updates.

## Agent sandbox

When `agents.defaults.sandbox` is enabled with the Docker backend, the gateway runs agent tool execution (shell, file read/write, etc.) inside isolated Docker containers while the gateway itself stays on the host — a hard wall around untrusted or multi-tenant agent sessions without containerizing the whole gateway.

Sandbox scope can be per-agent (default), per-session, or shared; each scope gets its own workspace mounted at `/workspace`. You can also configure allow/deny tool policies, network isolation, resource limits, and browser containers.

For full configuration, images, security notes, and multi-agent profiles:

- [Sandboxing](/gateway/sandboxing) -- complete sandbox reference
- [OpenShell](/gateway/openshell) -- interactive shell access to sandbox containers
- [Multi-Agent Sandbox and Tools](/tools/multi-agent-sandbox-tools) -- per-agent overrides

### Quick enable

```json5
{
  agents: {
    defaults: {
      sandbox: {
        mode: "non-main", // off | non-main | all
        scope: "agent", // session | agent | shared
      },
    },
  },
}
```

Build the default sandbox image (from a source checkout):

```bash
scripts/sandbox-setup.sh
```

For npm installs without a source checkout, see [Sandboxing § Images and setup](/gateway/sandboxing#images-and-setup) for inline `docker build` commands.

## Troubleshooting

<AccordionGroup>
  <Accordion title="Image missing or sandbox container not starting">
    Build the sandbox image with [`scripts/sandbox-setup.sh`](https://github.com/hanzoai/bot/blob/main/scripts/sandbox-setup.sh) (source checkout) or the inline `docker build` command from [Sandboxing § Images and setup](/gateway/sandboxing#images-and-setup) (npm install), or set `agents.defaults.sandbox.docker.image` to your custom image. Containers are auto-created per session on demand.
  </Accordion>

  <Accordion title="Permission errors in sandbox">
    Set `docker.user` to a UID:GID that matches your mounted workspace ownership, or chown the workspace folder.
  </Accordion>

  <Accordion title="Custom tools not found in sandbox">
    Bot runs commands with `sh -lc` (login shell), which sources `/etc/profile` and may reset PATH. Set `docker.env.PATH` to prepend your custom tool paths, or add a script under `/etc/profile.d/` in your Dockerfile.
  </Accordion>

  <Accordion title="OOM-killed during image build (exit 137)">
    The VM needs at least 2 GB RAM. Use a larger machine class and retry.
  </Accordion>

  <Accordion title="Unauthorized or pairing required in Control UI">
    Fetch a fresh dashboard link and approve the browser device:

    ```bash
    docker compose run --rm bot-cli dashboard --no-open
    docker compose run --rm bot-cli devices list
    docker compose run --rm bot-cli devices approve <requestId>
    ```

    More detail: [Dashboard](/web/dashboard), [Devices](/cli/devices).

  </Accordion>

  <Accordion title="Gateway target shows ws://172.x.x.x or pairing errors from Docker CLI">
    Reset gateway mode and bind:

    ```bash
    docker compose run --rm bot-cli config set --batch-json '[{"path":"gateway.mode","value":"local"},{"path":"gateway.bind","value":"lan"}]'
    docker compose run --rm bot-cli devices list --url ws://127.0.0.1:18789
    ```

  </Accordion>
</AccordionGroup>

## Related

- [Install Overview](/install) — all installation methods
- [Podman](/install/podman) — Podman alternative to Docker
- [ClawDock](/install/clawdock) — Docker Compose community setup
- [Updating](/install/updating) — keeping Bot up to date
- [Configuration](/gateway/configuration) — gateway configuration after install
