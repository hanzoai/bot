---
summary: "CLI reference for `hanzo-bot agents` (list/add/delete/set identity)"
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
hanzo-bot agents set-identity --workspace ~/.hanzo/bot/workspace --from-identity
hanzo-bot agents set-identity --agent main --avatar avatars/bot.png
hanzo-bot agents delete work
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
hanzo-bot agents set-identity --agent main --name "Hanzo Bot" --emoji "🤖" --avatar avatars/bot.png
```

Config sample:

```json5
{
  agents: {
    list: [
      {
        id: "main",
        identity: {
          name: "Hanzo Bot",
          theme: "AI assistant",
          emoji: "🤖",
          avatar: "avatars/bot.png",
        },
      },
    ],
  },
}
```
