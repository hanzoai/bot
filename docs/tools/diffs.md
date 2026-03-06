---
title: "Diffs"
summary: "Read-only diff viewer and PNG renderer for agents (optional plugin tool)"
description: "Use the optional Diffs plugin to render before/after text or unified patches as a gateway-hosted diff view or a PNG."
read_when:
  - You want agents to show code or markdown edits as diffs
  - You want a canvas-ready viewer URL or a rendered diff PNG
---

# Diffs

`diffs` is an optional plugin tool with short built-in system guidance and a companion skill that turns change content into a read-only diff artifact for agents.

- arbitrary `before` / `after` text
- a unified patch

The tool can produce:

It can return:

- a gateway viewer URL for canvas presentation
- a rendered file path (PNG or PDF) for message delivery
- both outputs in one call

When enabled, the plugin prepends concise usage guidance into system-prompt space and also exposes a detailed skill for cases where the agent needs fuller instructions.

## Quick start

1. Enable the plugin.
2. Call `diffs` with `mode: "view"` for canvas-first flows.
3. Call `diffs` with `mode: "file"` for chat file delivery flows.
4. Call `diffs` with `mode: "both"` when you need both artifacts.

## Enable the plugin

```json5
{
  plugins: {
    entries: {
      diffs: {
        enabled: true,
      },
    },
  },
}
```

## Disable built-in system guidance

If you want to keep the `diffs` tool enabled but disable its built-in system-prompt guidance, set `plugins.entries.diffs.hooks.allowPromptInjection` to `false`:

```json5
{
  plugins: {
    entries: {
      diffs: {
        enabled: true,
        hooks: {
          allowPromptInjection: false,
        },
      },
    },
  },
}
```

This blocks the diffs plugin's `before_prompt_build` hook while keeping the plugin, tool, and companion skill available.

If you want to disable both the guidance and the tool, disable the plugin instead.

## Typical agent workflow

- `mode: "view"` returns `details.viewerUrl` and `details.viewerPath`
- `mode: "image"` returns `details.imagePath` only
- `mode: "both"` returns the viewer details plus `details.imagePath`

Typical agent patterns:

- open `details.viewerUrl` in canvas with `canvas present`
- send `details.imagePath` with the `message` tool using `path` or `filePath`

## Tool inputs

Before/after input:

```json
{
  "before": "# Hello\n\nOne",
  "after": "# Hello\n\nTwo",
  "path": "docs/example.md",
  "mode": "view"
}
```

Patch input:

```json
{
  "patch": "diff --git a/src/example.ts b/src/example.ts\n--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1 +1 @@\n-const x = 1;\n+const x = 2;\n",
  "mode": "both"
}
```

Useful options:

- `mode`: `view`, `image`, or `both`
- `layout`: `unified` or `split`
- `theme`: `light` or `dark`
- `expandUnchanged`: expand unchanged sections instead of collapsing them
- `path`: display name for before/after input
- `title`: explicit diff title
- `ttlSeconds`: viewer artifact lifetime
- `baseUrl`: override the gateway base URL used in the returned viewer link

## Plugin defaults

Set plugin-wide defaults in `~/.hanzo/bot/bot.json`:

```json5
{
  plugins: {
    entries: {
      diffs: {
        enabled: true,
        config: {
          defaults: {
            fontFamily: "Fira Code",
            fontSize: 15,
            layout: "unified",
            wordWrap: true,
            background: true,
            theme: "dark",
            mode: "both",
          },
        },
      },
    },
  },
}
```

Supported defaults:

- `fontFamily`
- `fontSize`
- `layout`
- `wordWrap`
- `background`
- `theme`
- `mode`

Explicit tool parameters override the plugin defaults.

## Notes

- Viewer pages are hosted locally by the gateway under `/plugins/diffs/...`.
- Viewer artifacts are ephemeral and stored locally.
- `mode: "image"` uses a faster image-only render path and does not create a viewer URL.
- PNG rendering requires a Chromium-compatible browser. If auto-detection is not enough, set `browser.executablePath`.
- Diff rendering is powered by [Diffs](https://diffs.com).

## Related docs

- [Tools overview](/tools)
- [Plugins](/tools/plugin)
- [Browser](/tools/browser)
