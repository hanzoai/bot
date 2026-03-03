# @bot/zalouser

Hanzo Bot extension for Zalo Personal Account messaging via [zca-cli](https://zca-cli.dev).

> **Warning:** Using Zalo automation may result in account suspension or ban. Use at your own risk. This is an unofficial integration.

## Features

- Channel plugin integration with onboarding + QR login
- In-process listener/sender via `zca-js` (no external CLI)
- Multi-account support
- Agent tool integration (`zalouser`)
- DM/group policy support

## Prerequisites

- Bot Gateway
- Zalo mobile app (for QR login)

No external `zca`, `openzca`, or `zca-cli` binary is required.

## Install

### Option A: npm

```bash
bot plugins install @bot/zalouser
```

### Option B: local source checkout

```bash
bot plugins install ./extensions/zalouser
cd ./extensions/zalouser && pnpm install
```

Restart the Gateway after install.

## Quick start

### Login (QR)

```bash
hanzo-bot onboard
# Select "Zalo Personal" from channel list
# Follow QR code login flow
```

Scan the QR code with the Zalo app on your phone.

```bash
hanzo-bot channels login --channel zalouser
# Scan QR code with Zalo app
```

### Send a Message

```bash
hanzo-bot message send --channel zalouser --target <threadId> --message "Hello from Hanzo Bot!"
```

## Configuration

After onboarding, your config will include:

```yaml
channels:
  zalouser:
    enabled: true
    dmPolicy: pairing # pairing | allowlist | open | disabled
```

### Send a message

```bash
bot message send --channel zalouser --target <threadId> --message "Hello from Bot"
```

## Configuration

Basic:

```yaml
channels:
  zalouser:
    enabled: true
    dmPolicy: pairing
```

Multi-account:

```yaml
channels:
  zalouser:
    enabled: true
    defaultAccount: default
    accounts:
      default:
        enabled: true
        profile: default
      work:
        enabled: true
        profile: work
```

## Useful commands

```bash
hanzo-bot channels login --channel zalouser              # Login via QR
hanzo-bot channels login --channel zalouser --account work
hanzo-bot channels status --probe
hanzo-bot channels logout --channel zalouser
```

## Agent tool

```bash
hanzo-bot directory self --channel zalouser
hanzo-bot directory peers list --channel zalouser --query "name"
hanzo-bot directory groups list --channel zalouser --query "work"
hanzo-bot directory groups members --channel zalouser --group-id <id>
```

### Account Management

```bash
zca account list      # List all profiles
zca account current   # Show active profile
zca account switch <profile>
zca account remove <profile>
zca account label <profile> "Work Account"
```

### Messaging

```bash
# Text
hanzo-bot message send --channel zalouser --target <threadId> --message "message"

# Media (URL)
hanzo-bot message send --channel zalouser --target <threadId> --message "caption" --media-url "https://example.com/img.jpg"
```

### Listener

The listener runs inside the Gateway when the channel is enabled. For debugging,
use `hanzo-bot channels logs --channel zalouser` or run `zca listen` directly.

### Data Access

```bash
# Friends
zca friend list
zca friend list -j    # JSON output
zca friend find "name"
zca friend online

# Groups
zca group list
zca group info <groupId>
zca group members <groupId>

# Profile
zca me info
zca me id
```

## Multi-Account Support

Use `--profile` or `-p` to work with multiple accounts:

```bash
hanzo-bot channels login --channel zalouser --account work
hanzo-bot message send --channel zalouser --account work --target <id> --message "Hello"
ZCA_PROFILE=work zca listen
```

Profile resolution order: `--profile` flag > `ZCA_PROFILE` env > default

## Agent Tool

The extension registers a `zalouser` tool for AI agents:

```json
{
  "action": "send",
  "threadId": "123456",
  "message": "Hello from AI!",
  "isGroup": false,
  "profile": "default"
}
```

Available actions: `send`, `image`, `link`, `friends`, `groups`, `me`, `status`

## Troubleshooting

- Login not persisted: `bot channels logout --channel zalouser && bot channels login --channel zalouser`
- Probe status: `bot channels status --probe`
- Name resolution issues (allowlist/groups): use numeric IDs or exact Zalo names

## Credits

Built on [zca-js](https://github.com/RFS-ADRENO/zca-js).
