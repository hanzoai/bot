---
summary: "grammY framework integration notes for Telegram"
read_when:
  - Working on Telegram internals or the grammY runner
title: "Telegram grammY Notes"
---

# Telegram grammY Notes

Bot uses [grammY](https://grammy.dev/) as the underlying framework for Telegram Bot API communication.

## Runner

Long polling uses the grammY runner with per-chat and per-thread sequencing. Overall runner sink concurrency is governed by `agents.defaults.maxConcurrent`.

## Middleware Stack

The grammY middleware chain handles:

- Message and callback query routing
- Media group deduplication
- Rate-limit aware retry (via `auto-retry` plugin)
- Session management

## Timeouts

`channels.telegram.timeoutSeconds` overrides the Telegram API client timeout. If unset, the grammY default applies.

## References

- [grammY documentation](https://grammy.dev/)
- [Telegram channel guide](/channels/telegram)
