---
summary: "CLI reference for `hanzo-bot plugins` (list, install, enable/disable, doctor)"
read_when:
  - You want to install or manage in-process Gateway plugins
  - You want to debug plugin load failures
title: "plugins"
---

# `hanzo-bot plugins`

Manage Gateway plugins/extensions (loaded in-process).

Related:

- Plugin system: [Plugins](/tools/plugin)
- Plugin manifest + schema: [Plugin manifest](/plugins/manifest)
- Security hardening: [Security](/gateway/security)

## Commands

```bash
hanzo-bot plugins list
hanzo-bot plugins info <id>
hanzo-bot plugins enable <id>
hanzo-bot plugins disable <id>
hanzo-bot plugins doctor
hanzo-bot plugins update <id>
hanzo-bot plugins update --all
```

Bundled plugins ship with Hanzo Bot but start disabled. Use `plugins enable` to
activate them.

All plugins must ship a `bot.plugin.json` file with an inline JSON Schema
(`configSchema`, even if empty). Missing/invalid manifests or schemas prevent
the plugin from loading and fail config validation.

### Install

```bash
hanzo-bot plugins install <path-or-spec>
```

Security note: treat plugin installs like running code. Prefer pinned versions.

Supported archives: `.zip`, `.tgz`, `.tar.gz`, `.tar`.

Use `--link` to avoid copying a local directory (adds to `plugins.load.paths`):

```bash
hanzo-bot plugins install -l ./my-plugin
```

### Update

```bash
hanzo-bot plugins update <id>
hanzo-bot plugins update --all
hanzo-bot plugins update <id> --dry-run
```

Updates only apply to plugins installed from npm (tracked in `plugins.installs`).
