# @hanzo/bot-tokenjuice

Official Tokenjuice output compaction plugin for Bot.

Tokenjuice compacts noisy `exec` and `bash` tool results after commands run, before the result is fed back into the active agent session. It does not rewrite commands, rerun commands, or change exit codes.

## Install

```bash
bot plugins install @hanzo/bot-tokenjuice
```

Restart the Gateway after installing or updating the plugin.

## Enable

```bash
bot config set plugins.entries.tokenjuice.enabled true
```

Equivalent:

```bash
bot plugins enable tokenjuice
```

## Docs

- https://docs.bot.ai/tools/tokenjuice

## Package

- Plugin id: `tokenjuice`
- Package: `@hanzo/bot-tokenjuice`
- Minimum Bot host: `2026.5.28`
