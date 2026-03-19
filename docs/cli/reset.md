---
summary: "CLI reference for `hanzo-bot reset` (reset local state/config)"
read_when:
  - You want to wipe local state while keeping the CLI installed
  - You want a dry-run of what would be removed
title: "reset"
---

# `hanzo-bot reset`

Reset local config/state (keeps the CLI installed).

```bash
openclaw backup create
openclaw reset
openclaw reset --dry-run
openclaw reset --scope config+creds+sessions --yes --non-interactive
```

Run `hanzo-bot backup create` first if you want a restorable snapshot before removing local state.
