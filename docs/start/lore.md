---
summary: "Background and context for Hanzo Bot"
read_when:
  - Writing docs or UX copy that reference the project's background
title: "Hanzo Bot Origin"
---

# Hanzo Bot Origin

Hanzo Bot is a multi-channel personal AI assistant: one bot that reaches you across WhatsApp, Telegram, Discord, iMessage, Slack, and more. Send a message, get an agent response — from your pocket, on your own machine, under your own rules.

## Lineage

Hanzo Bot builds on open-source foundations (see [NOTICE](https://github.com/hanzoai/bot/blob/main/NOTICE)). It started as a simple messaging gateway, grew into a general bridge between chat platforms and AI agents, and is now maintained by Hanzo AI as part of the Hanzo platform.

By default, every model call routes through the Hanzo LLM Gateway at `api.hanzo.ai` — so billing, observability, and rate-limiting stay in one place — while any other provider remains available with your own key.

## Principles

- **Yours to run.** Local-first, self-hostable, no lock-in.
- **One bot, every channel.** A consistent identity across every platform.
- **Composable.** Plugins add channels and tools; you opt into what you want.
- **Honest by default.** Explicit approvals for side effects, no surprises.

---

_One bot, every chat._
