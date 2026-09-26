---
summary: "CLI reference for `hanzo-bot migrate` (import another assistant install)"
read_when:
  - You are moving from OpenClaw to Hanzo Bot
  - You want to see what `hanzo-bot migrate openclaw` reads and writes
title: "migrate"
---

# `hanzo-bot migrate`

Import the state of another assistant install into Hanzo Bot.

Related:

- Guide: [Migrate from OpenClaw](/install/migrate-from-openclaw)

## `hanzo-bot migrate openclaw`

```bash
hanzo-bot migrate openclaw                          # the plan; writes nothing
hanzo-bot migrate openclaw --apply                  # perform it
hanzo-bot migrate openclaw --json                   # the plan as JSON
hanzo-bot migrate openclaw --from ~/.openclaw-work  # another OpenClaw state dir
```

Options:

- `--from <dir>`: the OpenClaw state dir. Default: `$OPENCLAW_STATE_DIR`, else `~/.openclaw`,
  else a Clawdbot-era `~/.clawdbot`.
- `--apply`: write the changes. Without it nothing is written.
- `--json`: print the plan as JSON. It holds paths, key names and counts, never a secret value.

The target is Hanzo Bot's state dir (`$BOT_STATE_DIR`, else `~/.bot`). The OpenClaw install,
and every dir it reaches through a link, is only read; files that belong in such a dir wait in
`~/.bot/agents/<id>/from-openclaw/`, and the plan says where they go. Running it again is safe: anything
already in place is reported as `unchanged`, and a value or file Hanzo Bot already has is never
replaced, except the defaults Hanzo Bot's own first run wrote (see
[an existing bot.json](/install/migrate-from-openclaw#an-existing-botjson)).

The plan has four parts:

- **Moves**: each file written or tree copied, marked `create`, `merge`, `unchanged` or
  `conflict` (Hanzo Bot already has a different file there, and keeps it).
- **Renamed**: config keys and env vars that changed name.
- **Not carried**: what stays behind, each with the reason.
- **Do by hand**: steps the import cannot take for you, such as stopping OpenClaw's gateway.
