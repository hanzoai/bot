---
summary: "CLI reference for `bot uninstall` (remove gateway service + local data)"
read_when:
  - You want to remove the gateway service and/or local state
  - You want a dry-run first
title: "Uninstall"
---

# `bot uninstall`

Uninstall the Gateway service and/or local data. The CLI itself is not
removed; uninstall it via npm/pnpm separately.

## Options

| Flag                | Default | Description                                          |
| ------------------- | ------- | ---------------------------------------------------- |
| `--service`         | `false` | Remove the Gateway service.                          |
| `--state`           | `false` | Remove state and config.                             |
| `--workspace`       | `false` | Remove workspace directories.                        |
| `--app`             | `false` | Remove the macOS app.                                |
| `--all`             | `false` | Shorthand for `--service --state --workspace --app`. |
| `--yes`             | `false` | Skip confirmation prompts.                           |
| `--non-interactive` | `false` | Disable prompts; requires `--yes`.                   |
| `--dry-run`         | `false` | Print planned actions without removing files.        |

With no scope flags, an interactive multiselect prompts for which components
to remove (defaults to service, state, workspace preselected).

## Examples

```bash
bot backup create
bot uninstall
bot uninstall --service --yes --non-interactive
bot uninstall --state --workspace --yes --non-interactive
bot uninstall --all --yes
bot uninstall --dry-run
```

## Notes

- Run `bot backup create` first for a restorable snapshot before removing
  state or workspaces.
- `--state` preserves configured workspace directories unless `--workspace` is
  also selected.

## Related

- [CLI reference](/cli)
- [Uninstall](/install/uninstall)
