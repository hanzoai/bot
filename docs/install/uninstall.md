---
summary: "Uninstall Hanzo Bot completely (CLI, service, state, workspace)"
read_when:
  - You want to remove Hanzo Bot from a machine
  - The gateway service is still running after uninstall
title: "Uninstall"
---

# Uninstall

Two paths:

- **Easy path** if `bot` is still installed.
- **Manual service removal** if the CLI is gone but the service is still running.

## Easy path (CLI still installed)

Recommended: use the built-in uninstaller:

```bash
hanzo-bot uninstall
```

Non-interactive (automation / npx):

```bash
hanzo-bot uninstall --all --yes --non-interactive
npx -y hanzo-bot uninstall --all --yes --non-interactive
```

Manual steps (same result):

1. Stop the gateway service:

```bash
hanzo-bot gateway stop
```

2. Uninstall the gateway service (launchd/systemd/schtasks):

```bash
hanzo-bot gateway uninstall
```

3. Delete state + config:

```bash
rm -rf "${BOT_STATE_DIR:-$HOME/.bot}"
```

If you set `BOT_CONFIG_PATH` to a custom location outside the state dir, delete that file too.

4. Delete your workspace (optional, removes agent files):

```bash
rm -rf ~/.hanzo/bot/workspace
```

5. Remove the CLI install (pick the one you used):

```bash
npm rm -g bot
pnpm remove -g bot
bun remove -g bot
```

6. If you installed the macOS app:

```bash
rm -rf /Applications/Hanzo Bot.app
```

Notes:

- If you used profiles (`--profile` / `BOT_PROFILE`), repeat step 3 for each state dir (defaults are `~/.bot-<profile>`).
- In remote mode, the state dir lives on the **gateway host**, so run steps 1-4 there too.

## Manual service removal (CLI not installed)

Use this if the gateway service keeps running but `bot` is missing.

### macOS (launchd)

Default label is `bot.molt.gateway` (or `bot.molt.<profile>`; legacy `com.bot.*` may still exist):

```bash
launchctl bootout gui/$UID/bot.molt.gateway
rm -f ~/Library/LaunchAgents/bot.molt.gateway.plist
```

If you used a profile, replace the label and plist name with `bot.molt.<profile>`. Remove any legacy `com.bot.*` plists if present.

### Linux (systemd user unit)

Default unit name is `bot-gateway.service` (or `bot-gateway-<profile>.service`):

```bash
systemctl --user disable --now bot-gateway.service
rm -f ~/.config/systemd/user/bot-gateway.service
systemctl --user daemon-reload
```

### Windows (Scheduled Task)

Default task name is `Hanzo Bot Gateway` (or `Hanzo Bot Gateway (<profile>)`).
The task script lives under your state dir.

```powershell
schtasks /Delete /F /TN "Hanzo Bot Gateway"
Remove-Item -Force "$env:USERPROFILE\.bot\gateway.cmd"
```

If you used a profile, delete the matching task name and `~\.bot-<profile>\gateway.cmd`.

## Normal install vs source checkout

### Normal install (install.sh / npm / pnpm / bun)

If you used `https://hanzo.bot/install.sh` or `install.ps1`, the CLI was installed with `npm install -g bot@latest`.
Remove it with `npm rm -g bot` (or `pnpm remove -g` / `bun remove -g` if you installed that way).

### Source checkout (git clone)

If you run from a repo checkout (`git clone` + `hanzo-bot ...` / `bun run hanzo-bot ...`):

1. Uninstall the gateway service **before** deleting the repo (use the easy path above or manual service removal).
2. Delete the repo directory.
3. Remove state + workspace as shown above.
