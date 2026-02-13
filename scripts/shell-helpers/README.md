# BotDock <!-- omit in toc -->

Stop typing `docker-compose` commands. Just type `bot-start`.

Inspired by Simon Willison's [Running Hanzo Bot in Docker](https://til.simonwillison.net/llms/hanzo-bot-docker).

- [Quickstart](#quickstart)
- [Available Commands](#available-commands)
  - [Basic Operations](#basic-operations)
  - [Container Access](#container-access)
  - [Web UI \& Devices](#web-ui--devices)
  - [Setup \& Configuration](#setup--configuration)
  - [Maintenance](#maintenance)
  - [Utilities](#utilities)
- [Common Workflows](#common-workflows)
  - [Check Status and Logs](#check-status-and-logs)
  - [Set Up WhatsApp Bot](#set-up-whatsapp-bot)
  - [Troubleshooting Device Pairing](#troubleshooting-device-pairing)
  - [Fix Token Mismatch Issues](#fix-token-mismatch-issues)
  - [Permission Denied](#permission-denied)
- [Requirements](#requirements)

## Quickstart

**Install:**

```bash
mkdir -p ~/.bot && curl -sL https://raw.githubusercontent.com/hanzoai/bot/main/scripts/shell-helpers/bot-helpers.sh -o ~/.bot/bot-helpers.sh
```

```bash
echo 'source ~/.bot/bot-helpers.sh' >> ~/.zshrc && source ~/.zshrc
```

**See what you get:**

```bash
bot-help
```

On first command, BotDock auto-detects your Hanzo Bot directory:

- Checks common paths (`~/hanzo-bot`, `~/workspace/hanzo-bot`, etc.)
- If found, asks you to confirm
- Saves to `~/.bot/config`

**First time setup:**

```bash
bot-start
```

```bash
bot-fix-token
```

```bash
bot-dashboard
```

If you see "pairing required":

```bash
bot-devices
```

And approve the request for the specific device:

```bash
bot-approve <request-id>
```

## Available Commands

### Basic Operations

| Command       | Description                     |
| ------------- | ------------------------------- |
| `bot-start`   | Start the gateway               |
| `bot-stop`    | Stop the gateway                |
| `bot-restart` | Restart the gateway             |
| `bot-status`  | Check container status          |
| `bot-logs`    | View live logs (follows output) |

### Container Access

| Command              | Description                                    |
| -------------------- | ---------------------------------------------- |
| `bot-shell`          | Interactive shell inside the gateway container |
| `bot-cli <command>`  | Run Hanzo Bot CLI commands                     |
| `bot-exec <command>` | Execute arbitrary commands in the container    |

### Web UI & Devices

| Command            | Description                                |
| ------------------ | ------------------------------------------ |
| `bot-dashboard`    | Open web UI in browser with authentication |
| `bot-devices`      | List device pairing requests               |
| `bot-approve <id>` | Approve a device pairing request           |

### Setup & Configuration

| Command         | Description                                       |
| --------------- | ------------------------------------------------- |
| `bot-fix-token` | Configure gateway authentication token (run once) |

### Maintenance

| Command       | Description                                      |
| ------------- | ------------------------------------------------ |
| `bot-rebuild` | Rebuild the Docker image                         |
| `bot-clean`   | Remove all containers and volumes (destructive!) |

### Utilities

| Command         | Description                               |
| --------------- | ----------------------------------------- |
| `bot-health`    | Run gateway health check                  |
| `bot-token`     | Display the gateway authentication token  |
| `bot-cd`        | Jump to the Hanzo Bot project directory   |
| `bot-config`    | Open the Hanzo Bot config directory       |
| `bot-workspace` | Open the workspace directory              |
| `bot-help`      | Show all available commands with examples |

## Common Workflows

### Check Status and Logs

**Restart the gateway:**

```bash
bot-restart
```

**Check container status:**

```bash
bot-status
```

**View live logs:**

```bash
bot-logs
```

### Set Up WhatsApp Bot

**Shell into the container:**

```bash
bot-shell
```

**Inside the container, login to WhatsApp:**

```bash
hanzo-bot channels login --channel whatsapp --verbose
```

Scan the QR code with WhatsApp on your phone.

**Verify connection:**

```bash
hanzo-bot status
```

### Troubleshooting Device Pairing

**Check for pending pairing requests:**

```bash
bot-devices
```

**Copy the Request ID from the "Pending" table, then approve:**

```bash
bot-approve <request-id>
```

Then refresh your browser.

### Fix Token Mismatch Issues

If you see "gateway token mismatch" errors:

```bash
bot-fix-token
```

This will:

1. Read the token from your `.env` file
2. Configure it in the Hanzo Bot config
3. Restart the gateway
4. Verify the configuration

### Permission Denied

**Ensure Docker is running and you have permission:**

```bash
docker ps
```

## Requirements

- Docker and Docker Compose installed
- Bash or Zsh shell
- Hanzo Bot project (from `docker-setup.sh`)

## Development

**Test with fresh config (mimics first-time install):**

```bash
unset BOTDOCK_DIR && rm -f ~/.bot/config && source scripts/shell-helpers/bot-helpers.sh
```

Then run any command to trigger auto-detect:

```bash
bot-start
```
