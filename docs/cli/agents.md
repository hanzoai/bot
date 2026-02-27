---
summary: "CLI reference for `hanzo-bot agents` (list/add/delete/bindings/bind/unbind/set identity)"
read_when:
  - You want multiple isolated agents (workspaces + routing + auth)
title: "agents"
---

# `hanzo-bot agents`

Manage isolated agents (workspaces + auth + routing).

Related:

- Multi-agent routing: [Multi-Agent Routing](/concepts/multi-agent)
- Agent workspace: [Agent workspace](/concepts/agent-workspace)

## Examples

```bash
hanzo-bot agents list
hanzo-bot agents add work --workspace ~/.hanzo/bot/workspace-work
hanzo-bot agents bindings
hanzo-bot agents bind --agent work --bind telegram:ops
hanzo-bot agents unbind --agent work --bind telegram:ops
hanzo-bot agents set-identity --workspace ~/.hanzo/bot/workspace --from-identity
hanzo-bot agents set-identity --agent main --avatar avatars/bot.png
hanzo-bot agents delete work
```

## Routing bindings

Use routing bindings to pin inbound channel traffic to a specific agent.

List bindings:

```bash
hanzo-bot agents bindings
hanzo-bot agents bindings --agent work
hanzo-bot agents bindings --json
```

Add bindings:

```bash
hanzo-bot agents bind --agent work --bind telegram:ops --bind discord:guild-a
```

If you omit `accountId` (`--bind <channel>`), Bot resolves it from channel defaults and plugin setup hooks when available.

### Binding scope behavior

- A binding without `accountId` matches the channel default account only.
- `accountId: "*"` is the channel-wide fallback (all accounts) and is less specific than an explicit account binding.
- If the same agent already has a matching channel binding without `accountId`, and you later bind with an explicit or resolved `accountId`, Bot upgrades that existing binding in place instead of adding a duplicate.

Example:

```bash
# initial channel-only binding
hanzo-bot agents bind --agent work --bind telegram

# later upgrade to account-scoped binding
hanzo-bot agents bind --agent work --bind telegram:ops
```

After the upgrade, routing for that binding is scoped to `telegram:ops`. If you also want default-account routing, add it explicitly (for example `--bind telegram:default`).

Remove bindings:

```bash
hanzo-bot agents unbind --agent work --bind telegram:ops
hanzo-bot agents unbind --agent work --all
```

## Identity files

Each agent workspace can include an `IDENTITY.md` at the workspace root:

- Example path: `~/.hanzo/bot/workspace/IDENTITY.md`
- `set-identity --from-identity` reads from the workspace root (or an explicit `--identity-file`)

Avatar paths resolve relative to the workspace root.

## Set identity

`set-identity` writes fields into `agents.list[].identity`:

- `name`
- `theme`
- `emoji`
- `avatar` (workspace-relative path, http(s) URL, or data URI)

Load from `IDENTITY.md`:

```bash
hanzo-bot agents set-identity --workspace ~/.hanzo/bot/workspace --from-identity
```

Override fields explicitly:

```bash
hanzo-bot agents set-identity --agent main --name "Bot" --emoji "🦞" --avatar avatars/bot.png
```

Config sample:

```json5
{
  agents: {
    list: [
      {
        id: "main",
        identity: {
          name: "Bot",
          theme: "space lobster",
          emoji: "🦞",
          avatar: "avatars/bot.png",
        },
      },
    ],
  },
}
```
