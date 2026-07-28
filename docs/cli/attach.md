---
summary: "CLI reference for `bot attach` (launch Claude Code with a scoped Gateway MCP grant)"
read_when:
  - You want Claude Code to use Bot Gateway MCP tools
  - You need a temporary session-bound MCP grant for an external harness
title: "Attach CLI"
---

`bot attach` launches Claude Code with a strict temporary MCP config bound to one Gateway session.

```sh
bot attach
bot attach --session agent:main:telegram:123 --ttl 600000
bot attach --print-config
```

Options:

- `--session <key>` binds the grant to a Gateway session. Defaults to the main session.
- `--ttl <ms>` requests a positive grant TTL in milliseconds. The Gateway applies its own ceiling.
- `--bin <path>` selects the Claude Code binary. Default: `claude`.
- `--print-config` writes the temporary `.mcp.json`, prints the launch command and env, and leaves the grant live until TTL expiry (it does not spawn Claude Code or revoke the grant).

The bearer token is passed through environment variables, not argv. Bot launches Claude Code with `--strict-mcp-config --mcp-config <path>` so ambient Claude MCP servers do not join the attached session. Normal launches (without `--print-config`) revoke the grant when the Claude Code process exits.

See also: [Gateway CLI](/cli/gateway), [MCP CLI](/cli/mcp), and [ACP CLI](/cli/acp).
