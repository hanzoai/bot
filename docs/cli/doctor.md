---
summary: "CLI reference for `hanzo-bot doctor` (health checks + guided repairs)"
read_when:
  - You have connectivity/auth issues and want guided fixes
  - You updated and want a sanity check
title: "doctor"
---

# `hanzo-bot doctor`

Health checks + quick fixes for the gateway and channels.

Related:

- Troubleshooting: [Troubleshooting](/gateway/troubleshooting)
- Security audit: [Security](/gateway/security)

## Examples

```bash
hanzo-bot doctor
hanzo-bot doctor --repair
hanzo-bot doctor --deep
```

Notes:

- Interactive prompts (like keychain/OAuth fixes) only run when stdin is a TTY and `--non-interactive` is **not** set. Headless runs (cron, Telegram, no terminal) will skip prompts.
- `--fix` (alias for `--repair`) writes a backup to `~/.bot/bot.json.bak` and drops unknown config keys, listing each removal.
- State integrity checks now detect orphan transcript files in the sessions directory and can archive them as `.deleted.<timestamp>` to reclaim space safely.
- Doctor includes a memory-search readiness check and can recommend `hanzo-bot configure --section model` when embedding credentials are missing.
- If sandbox mode is enabled but Docker is unavailable, doctor reports a high-signal warning with remediation (`install Docker` or `hanzo-bot config set agents.defaults.sandbox.mode off`).
- If an OpenClaw install is present (`$OPENCLAW_STATE_DIR`, `~/.openclaw` or a Clawdbot-era `~/.clawdbot`), doctor points at `hanzo-bot migrate openclaw` and warns when OpenClaw's gateway service is still installed. It does this before a `bot.json` exists, too. See [Migrate from OpenClaw](/install/migrate-from-openclaw).

## macOS: `launchctl` env overrides

If you previously ran `launchctl setenv BOT_GATEWAY_TOKEN ...` (or `...PASSWORD`), that value overrides your config file and can cause persistent “unauthorized” errors.

```bash
launchctl getenv BOT_GATEWAY_TOKEN
launchctl getenv BOT_GATEWAY_PASSWORD

launchctl unsetenv BOT_GATEWAY_TOKEN
launchctl unsetenv BOT_GATEWAY_PASSWORD
```
