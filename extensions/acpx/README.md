# @hanzo/bot-acpx

Official ACP runtime backend for Bot.

ACPx lets Bot run external coding harnesses through the Agent Client Protocol while Bot still owns sessions, channels, delivery, permissions, and Gateway state.

## Install

```bash
bot plugins install @hanzo/bot-acpx
```

Restart the Gateway after installing or updating the plugin.

## What it provides

- ACP-backed agent runtime sessions.
- Plugin-owned session and transport management.
- MCP bridge helpers for Bot tools and plugin tools.
- Static runtime assets used by the ACP process bridge.

## Configure

Use the ACP docs for harness-specific setup, permission modes, and model/runtime selection:

- https://docs.bot.ai/tools/acp-agents-setup
- https://docs.bot.ai/tools/acp-agents

## Package

- Plugin id: `acpx`
- Package: `@hanzo/bot-acpx`
- Minimum Bot host: `2026.4.25`
