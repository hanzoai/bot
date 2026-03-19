---
summary: "Updating Hanzo Bot safely (global install or source), plus rollback strategy"
read_when:
  - Updating Hanzo Bot
  - Something breaks after an update
title: "Updating"
---

# Updating

Keep Hanzo Bot up to date.

## Recommended: `hanzo-bot update`

The fastest way to update. It detects your install type (npm or git), fetches the latest version, runs `hanzo-bot doctor`, and restarts the gateway.

```bash
openclaw update
```

To switch channels or target a specific version:

```bash
openclaw update --channel beta
openclaw update --tag main
openclaw update --dry-run   # preview without applying
```

See [Development channels](/install/development-channels) for channel semantics.

## Alternative: re-run the installer

```bash
curl -fsSL https://hanzo.bot/install.sh | bash
```

Add `--no-onboard` to skip onboarding. For source installs, pass `--install-method git --no-onboard`.

## Alternative: manual npm or pnpm

```bash
npm i -g @hanzo/bot@latest
```

```bash
pnpm add -g openclaw@latest
```

## Auto-updater

The auto-updater is off by default. Enable it in `~/.hanzoai/bot.json`:

```json5
{
  update: {
    channel: "stable",
    auto: {
      enabled: true,
      stableDelayHours: 6,
      stableJitterHours: 12,
      betaCheckIntervalHours: 1,
    },
  },
}
```

| Channel  | Behavior                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| `stable` | Waits `stableDelayHours`, then applies with deterministic jitter across `stableJitterHours` (spread rollout). |
| `beta`   | Checks every `betaCheckIntervalHours` (default: hourly) and applies immediately.                              |
| `dev`    | No automatic apply. Use `hanzo-bot update` manually.                                                           |

The gateway also logs an update hint on startup (disable with `update.checkOnStart: false`).

## After updating

<Steps>

### Run doctor

```bash
openclaw doctor
```

Migrates config, audits DM policies, and checks gateway health. Details: [Doctor](/gateway/doctor)

### Restart the gateway

```bash
openclaw gateway restart
```

### Verify

```bash
openclaw health
```

</Steps>

## Rollback

### Pin a version (npm)

```bash
npm i -g @hanzo/bot@<version>
openclaw doctor
openclaw gateway restart
```

Tip: `npm view hanzo-bot version` shows the current published version.

### Pin a commit (source)

```bash
git fetch origin
git checkout "$(git rev-list -n 1 --before=\"2026-01-01\" origin/main)"
pnpm install && pnpm build
openclaw gateway restart
```

To return to latest: `git checkout main && git pull`.

## If you are stuck

- Run `hanzo-bot doctor` again and read the output carefully.
- Check: [Troubleshooting](/gateway/troubleshooting)
- Ask in Discord: [https://discord.gg/clawd](https://discord.gg/clawd)
