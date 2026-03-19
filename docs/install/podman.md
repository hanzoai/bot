---
summary: "Run Hanzo Bot in a rootless Podman container"
read_when:
  - You want a containerized gateway with Podman instead of Docker
title: "Podman"
---

# Podman

Run the Hanzo Bot Gateway in a **rootless** Podman container. Uses the same image as Docker (built from the repo [Dockerfile](https://github.com/hanzoai/bot/blob/main/Dockerfile)).

## Prerequisites

- **Podman** (rootless mode)
- **sudo** access for one-time setup (creating the dedicated user and building the image)

## Quick start

<Steps>
  <Step title="One-time setup">
    From the repo root, run the setup script. It creates a dedicated `openclaw` user, builds the container image, and installs the launch script:

    ```bash
    ./setup-podman.sh
    ```

    This also creates a minimal config at `~openclaw/.hanzoai/bot.json` (sets `gateway.mode` to `"local"`) so the Gateway can start without running the wizard.

    By default the container is **not** installed as a systemd service -- you start it manually in the next step. For a production-style setup with auto-start and restarts, pass `--quadlet` instead:

    ```bash
    ./setup-podman.sh --quadlet
    ```

    (Or set `BOT_PODMAN_QUADLET=1`. Use `--container` to install only the container and launch script.)

    **Optional build-time env vars** (set before running `setup-podman.sh`):

    - `BOT_DOCKER_APT_PACKAGES` -- install extra apt packages during image build.
    - `BOT_EXTENSIONS` -- pre-install extension dependencies (space-separated names, e.g. `diagnostics-otel matrix`).

  </Step>

  <Step title="Start the Gateway">
    For a quick manual launch:

    ```bash
    ./scripts/run-openclaw-podman.sh launch
    ```

  </Step>

  <Step title="Run the onboarding wizard">
    To add channels or providers interactively:

    ```bash
    ./scripts/run-openclaw-podman.sh launch setup
    ```

    Then open `http://127.0.0.1:18789/` and use the token from `~openclaw/.hanzo/bot/.env` (or the value printed by setup).

  </Step>
</Steps>

## Systemd (Quadlet, optional)

If you ran `./setup-podman.sh --quadlet` (or `BOT_PODMAN_QUADLET=1`), a [Podman Quadlet](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html) unit is installed so the gateway runs as a systemd user service for the hanzo-bot user. The service is enabled and started at the end of setup.

- **Start:** `sudo systemctl --machine openclaw@ --user start openclaw.service`
- **Stop:** `sudo systemctl --machine openclaw@ --user stop openclaw.service`
- **Status:** `sudo systemctl --machine openclaw@ --user status openclaw.service`
- **Logs:** `sudo journalctl --machine openclaw@ --user -u openclaw.service -f`

The quadlet file lives at `~openclaw/.config/containers/systemd/openclaw.container`. To change ports or env, edit that file (or the `.env` it sources), then `sudo systemctl --machine openclaw@ --user daemon-reload` and restart the service. On boot, the service starts automatically if lingering is enabled for hanzo-bot (setup does this when loginctl is available).

To add quadlet **after** an initial setup that did not use it, re-run: `./setup-podman.sh --quadlet`.

## The hanzo-bot user (non-login)

`setup-podman.sh` creates a dedicated system user `openclaw`:

- **Shell:** `nologin` — no interactive login; reduces attack surface.
- **Home:** e.g. `/home/openclaw` — holds `~/.openclaw` (config, workspace) and the launch script `run-openclaw-podman.sh`.
- **Rootless Podman:** The user must have a **subuid** and **subgid** range. Many distros assign these automatically when the user is created. If setup prints a warning, add lines to `/etc/subuid` and `/etc/subgid`:

  ```text
  openclaw:100000:65536
  ```

  Then start the gateway as that user (e.g. from cron or systemd):

  ```bash
  sudo -u hanzo-bot /home/openclaw/run-openclaw-podman.sh
  sudo -u hanzo-bot /home/openclaw/run-openclaw-podman.sh setup
  ```

- **Config:** Only `openclaw` and root can access `/home/openclaw/.openclaw`. To edit config: use the Control UI once the gateway is running, or `sudo -u hanzo-bot $EDITOR /home/openclaw/.hanzoai/bot.json`.

## Environment and config

- **Token:** Stored in `~openclaw/.hanzo/bot/.env` as `BOT_GATEWAY_TOKEN`. `setup-podman.sh` and `run-openclaw-podman.sh` generate it if missing (uses `openssl`, `python3`, or `od`).
- **Optional:** In that `.env` you can set provider keys (e.g. `GROQ_API_KEY`, `OLLAMA_API_KEY`) and other Hanzo Bot env vars.
- **Host ports:** By default the script maps `18789` (gateway) and `18790` (bridge). Override the **host** port mapping with `BOT_PODMAN_GATEWAY_HOST_PORT` and `BOT_PODMAN_BRIDGE_HOST_PORT` when launching.
- **Gateway bind:** By default, `run-openclaw-podman.sh` starts the gateway with `--bind loopback` for safe local access. To expose on LAN, set `BOT_GATEWAY_BIND=lan` and configure `gateway.controlUi.allowedOrigins` (or explicitly enable host-header fallback) in `openclaw.json`.
- **Paths:** Host config and workspace default to `~openclaw/.openclaw` and `~openclaw/.hanzo/bot/workspace`. Override the host paths used by the launch script with `BOT_CONFIG_DIR` and `BOT_WORKSPACE_DIR`.

## Storage model

- **Persistent host data:** `BOT_CONFIG_DIR` and `BOT_WORKSPACE_DIR` are bind-mounted into the container and retain state on the host.
- **Ephemeral sandbox tmpfs:** if you enable `agents.defaults.sandbox`, the tool sandbox containers mount `tmpfs` at `/tmp`, `/var/tmp`, and `/run`. Those paths are memory-backed and disappear with the sandbox container; the top-level Podman container setup does not add its own tmpfs mounts.
- **Disk growth hotspots:** the main paths to watch are `media/`, `agents/<agentId>/sessions/sessions.json`, transcript JSONL files, `cron/runs/*.jsonl`, and rolling file logs under `/tmp/openclaw/` (or your configured `logging.file`).

`setup-podman.sh` now stages the image tar in a private temp directory and prints the chosen base dir during setup. For non-root runs it accepts `TMPDIR` only when that base is safe to use; otherwise it falls back to `/var/tmp`, then `/tmp`. The saved tar stays owner-only and is streamed into the target user’s `podman load`, so private caller temp dirs do not block setup.

## Useful commands

- **Logs:** With quadlet: `sudo journalctl --machine openclaw@ --user -u openclaw.service -f`. With script: `sudo -u hanzo-bot podman logs -f openclaw`
- **Stop:** With quadlet: `sudo systemctl --machine openclaw@ --user stop openclaw.service`. With script: `sudo -u hanzo-bot podman stop openclaw`
- **Start again:** With quadlet: `sudo systemctl --machine openclaw@ --user start openclaw.service`. With script: re-run the launch script or `podman start openclaw`
- **Remove container:** `sudo -u hanzo-bot podman rm -f openclaw` — config and workspace on the host are kept

## Troubleshooting

- **Permission denied (EACCES) on config or auth-profiles:** The container defaults to `--userns=keep-id` and runs as the same uid/gid as the host user running the script. Ensure your host `BOT_CONFIG_DIR` and `BOT_WORKSPACE_DIR` are owned by that user.
- **Gateway start blocked (missing `gateway.mode=local`):** Ensure `~openclaw/.hanzoai/bot.json` exists and sets `gateway.mode="local"`. `setup-podman.sh` creates this file if missing.
- **Rootless Podman fails for user openclaw:** Check `/etc/subuid` and `/etc/subgid` contain a line for `openclaw` (e.g. `openclaw:100000:65536`). Add it if missing and restart.
- **Container name in use:** The launch script uses `podman run --replace`, so the existing container is replaced when you start again. To clean up manually: `podman rm -f openclaw`.
- **Script not found when running as openclaw:** Ensure `setup-podman.sh` was run so that `run-openclaw-podman.sh` is copied to openclaw’s home (e.g. `/home/openclaw/run-openclaw-podman.sh`).
- **Quadlet service not found or fails to start:** Run `sudo systemctl --machine openclaw@ --user daemon-reload` after editing the `.container` file. Quadlet requires cgroups v2: `podman info --format '{{.Host.CgroupsVersion}}'` should show `2`.

## Optional: run as your own user

To run the gateway as your normal user (no dedicated hanzo-bot user): build the image, create `~/.hanzo/bot/.env` with `BOT_GATEWAY_TOKEN`, and run the container with `--userns=keep-id` and mounts to your `~/.openclaw`. The launch script is designed for the openclaw-user flow; for a single-user setup you can instead run the `podman run` command from the script manually, pointing config and workspace to your home. Recommended for most users: use `setup-podman.sh` and run as the hanzo-bot user so config and process are isolated.
