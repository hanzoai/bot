---
summary: "CLI reference for `hanzo-bot uninstall` (remove gateway service + local data)"
read_when:
  - You want to remove the gateway service and/or local state
  - You want a dry-run first
title: "uninstall"
---

# `hanzo-bot uninstall`

Uninstall the gateway service + local data (CLI remains).

```bash
openclaw backup create
openclaw uninstall
openclaw uninstall --all --yes
openclaw uninstall --dry-run
```

Run `hanzo-bot backup create` first if you want a restorable snapshot before removing state or workspaces.
