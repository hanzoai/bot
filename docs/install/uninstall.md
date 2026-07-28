---
summary: "Uninstall Bot completely (CLI, service, state, workspace)"
read_when:
  - You want to remove Bot from a machine
  - The gateway service is still running after uninstall
title: "Uninstall"
---

Two paths:

- **Easy path** if `bot` is still installed.
- **Manual service removal** if the CLI is gone but the service is still running.

## Easy path (CLI still installed)

Recommended: use the built-in uninstaller:

```bash
bot uninstall
```

State removal preserves configured workspace directories unless you also select `--workspace`.

Preview what will be removed (safe):

```bash
bot uninstall --dry-run --all
```

Non-interactive (automation / npx). Use with caution and only after confirming scopes:

```bash
bot uninstall --all --yes --non-interactive
npx -y bot uninstall --all --yes --non-interactive
```

Flags: `--service`, `--state`, `--workspace`, `--app` select individual scopes; `--all` selects all four.

Manual steps (same result):

1. Stop the gateway service:

```bash
bot gateway stop
```

2. Uninstall the gateway service (launchd/systemd/schtasks):

```bash
bot gateway uninstall
```

3. Delete state + config:

```bash
rm -rf "${BOT_STATE_DIR:-$HOME/.bot}"
```

If you set `BOT_CONFIG_PATH` to a custom location outside the state dir, delete that file too.
If you want to keep a workspace inside the state dir, such as `~/.bot/workspace`, move it aside before running `rm -rf` or delete state contents selectively.

4. Delete your workspace (optional, removes agent files):

```bash
rm -rf ~/.bot/workspace
```

5. Remove the CLI install (pick the one you used):

```bash
npm rm -g bot
pnpm remove -g bot
bun remove -g bot
```

6. If you installed the macOS app:

```bash
rm -rf /Applications/Bot.app
```

Notes:

- If you used profiles (`--profile` / `BOT_PROFILE`), repeat step 3 for each state dir (defaults are `~/.bot-<profile>`).
- In remote mode, the state dir lives on the **gateway host**, so run steps 1-4 there too.

## Manual service removal (CLI not installed)

Use this if the gateway service keeps running but `bot` is missing.

### macOS (launchd)

Default label is `ai.bot.gateway` (or `ai.bot.<profile>` with a profile):

```bash
launchctl bootout gui/$UID/ai.bot.gateway
rm -f ~/Library/LaunchAgents/ai.bot.gateway.plist
```

If you used a profile, replace the label and plist name with `ai.bot.<profile>`.

### Linux (systemd user unit)

Default unit name is `bot-gateway.service` (or `bot-gateway-<profile>.service`). A pre-rename `clawdbot-gateway.service` unit may still exist on machines upgraded from very old installs; `bot uninstall` / `bot gateway uninstall` detects and removes it automatically.

```bash
systemctl --user disable --now bot-gateway.service
rm -f ~/.config/systemd/user/bot-gateway.service
systemctl --user daemon-reload
```

### Windows (Scheduled Task)

Default task name is `Bot Gateway` (or `Bot Gateway (<profile>)`).
The task launches a windowless `gateway.vbs` script under your state dir, which in turn
runs `gateway.cmd`; remove both.

```powershell
schtasks /Delete /F /TN "Bot Gateway"
Remove-Item -Force "$env:USERPROFILE\.bot\gateway.cmd" -ErrorAction SilentlyContinue
Remove-Item -Force "$env:USERPROFILE\.bot\gateway.vbs" -ErrorAction SilentlyContinue
```

If you used a profile, delete the matching task name and the `gateway.cmd` /
`gateway.vbs` files under `~\.bot-<profile>`.

## Normal install vs source checkout

### Normal install (install.sh / npm / pnpm / bun)

If you used `https://bot.ai/install.sh` or `install.ps1`, the CLI was installed with `npm install -g bot@latest`.
Remove it with `npm rm -g bot` (or `pnpm remove -g` / `bun remove -g` if you installed that way).

### Source checkout (git clone)

If you run from a repo checkout (`git clone` + `bot ...` / `bun run bot ...`):

1. Uninstall the gateway service **before** deleting the repo (use the easy path above or manual service removal).
2. Delete the repo directory.
3. Remove state + workspace as shown above.

## Related

- [Install overview](/install)
- [Migration guide](/install/migrating)
