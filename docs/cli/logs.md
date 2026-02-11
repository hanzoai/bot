---
summary: "CLI reference for `hanzo-bot logs` (tail gateway logs via RPC)"
read_when:
  - You need to tail Gateway logs remotely (without SSH)
  - You want JSON log lines for tooling
title: "logs"
---

# `hanzo-bot logs`

Tail Gateway file logs over RPC (works in remote mode).

Related:

- Logging overview: [Logging](/logging)

## Examples

```bash
hanzo-bot logs
hanzo-bot logs --follow
hanzo-bot logs --json
hanzo-bot logs --limit 500
```
