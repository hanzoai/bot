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
hanzo-bot reset
hanzo-bot reset --dry-run
hanzo-bot reset --scope config+creds+sessions --yes --non-interactive
```
