---
summary: "Install and use Codex, Claude, and Cursor bundles as Bot plugins"
read_when:
  - You want to install a Codex, Claude, or Cursor-compatible bundle
  - You need to understand how Bot maps bundle content into native features
  - You are debugging bundle detection or missing capabilities
title: "Plugin bundles"
---

Bot can install plugins from three external ecosystems: **Codex**, **Claude**,
and **Cursor**. These are called **bundles** - content and metadata packs that
Bot maps into native features like skills, hooks, and MCP tools.

<Info>
  Bundles are **not** the same as native Bot plugins. Native plugins run
  in-process and can register any capability. Bundles are content packs with
  selective feature mapping and a narrower trust boundary.
</Info>

## Why bundles exist

Many useful plugins are published in Codex, Claude, or Cursor format. Instead
of requiring authors to rewrite them as native Bot plugins, Bot
detects these formats and maps their supported content into the native feature
set. You can install a Claude command pack or a Codex skill bundle and use it
immediately.

## Install a bundle

<Steps>
  <Step title="Install from a directory, archive, or marketplace">
    ```bash
    # Local directory
    bot plugins install ./my-bundle

    # Archive
    bot plugins install ./my-bundle.tgz

    # Claude marketplace
    bot plugins marketplace list <source>
    bot plugins install <plugin> --marketplace <source>
    ```

    `<source>` is a local marketplace path/repo or a git/GitHub source.

  </Step>

  <Step title="Verify detection">
    ```bash
    bot plugins list
    bot plugins inspect <id>
    ```

    Bundles show `Format: bundle` plus a `Bundle format:` value of `codex`,
    `claude`, or `cursor`.

  </Step>

  <Step title="Restart and use">
    ```bash
    bot gateway restart
    ```

    Mapped features (skills, hooks, MCP tools, LSP defaults) are available in the next session.

  </Step>
</Steps>

## What Bot maps from bundles

Not every bundle feature runs in Bot today. Here is what works and what
is detected but not yet wired.

### Supported now

| Feature       | How it maps                                                                                       | Applies to     |
| ------------- | ------------------------------------------------------------------------------------------------- | -------------- |
| Skill content | Bundle skill roots load as normal Bot skills                                                 | All formats    |
| Commands      | `commands/` and `.cursor/commands/` treated as skill roots                                        | Claude, Cursor |
| Hook packs    | Bot-style `HOOK.md` + `handler.ts` layouts                                                   | Codex          |
| MCP tools     | Bundle MCP config merged into embedded Bot settings; supported stdio and HTTP servers loaded | All formats    |
| LSP servers   | Claude `.lsp.json` and manifest-declared `lspServers` merged into embedded Bot LSP defaults  | Claude         |
| Settings      | Claude `settings.json` imported as embedded Bot defaults                                     | Claude         |

#### Skill content

- Bundle skill roots load as normal Bot skill roots.
- Claude `commands/` roots are treated as additional skill roots.
- Cursor `.cursor/commands/` roots are treated as additional skill roots.

Claude markdown command files and Cursor command markdown both work through the
normal Bot skill loader.

#### Hook packs

Bundle hook roots work **only** when they use the normal Bot hook-pack
layout: `HOOK.md` plus `handler.ts` or `handler.js`. Today this is primarily
the Codex-compatible case.

#### MCP for embedded Bot

- Enabled bundles can contribute MCP server config.
- Bot merges bundle MCP config into the effective embedded Bot
  settings as `mcpServers`.
- Bot exposes supported bundle MCP tools during embedded Bot agent
  turns by launching stdio servers or connecting to HTTP servers.
- The `coding` and `messaging` tool profiles include bundle MCP tools by
  default; use `tools.deny: ["bundle-mcp"]` to opt out for an agent or gateway.
- Project-local embedded agent settings still apply after bundle defaults, so
  workspace settings can override bundle MCP entries when needed.
- Bundle MCP tool catalogs are sorted deterministically before registration, so
  upstream `listTools()` order changes do not thrash prompt-cache tool blocks.

##### Transports

MCP servers can use stdio or HTTP transport.

**Stdio** launches a child process:

```json
{
  "mcp": {
    "servers": {
      "my-server": {
        "command": "node",
        "args": ["server.js"],
        "env": { "PORT": "3000" }
      }
    }
  }
}
```

**HTTP** connects to a running MCP server, defaulting to `sse` unless
`streamable-http` is requested:

```json
{
  "mcp": {
    "servers": {
      "my-server": {
        "url": "http://localhost:3100/mcp",
        "transport": "streamable-http",
        "headers": {
          "Authorization": "Bearer ${MY_SECRET_TOKEN}"
        },
        "connectionTimeoutMs": 30000
      }
    }
  }
}
```

- `transport` accepts `"streamable-http"` or `"sse"`; omitted defaults to `sse`.
- `type: "http"` is a CLI-native downstream shape; use `transport: "streamable-http"` in Bot config. `bot mcp set` and `bot doctor --fix` normalize the common alias.
- Only `http:` and `https:` URL schemes are allowed.
- `headers` values support `${ENV_VAR}` interpolation.
- A server entry with both `command` and `url` is rejected.
- URL credentials (userinfo and query params) are redacted from tool
  descriptions and logs.
- `connectionTimeoutMs` overrides the default 30-second connection timeout for
  both stdio and HTTP transports. Request timeout defaults to 60 seconds and
  can be overridden with `requestTimeoutMs`.

##### Tool naming

Bot registers bundle MCP tools with provider-safe names in the form
`serverName__toolName`. For example, a server keyed `"vigil-harbor"` exposing a
`memory_search` tool registers as `vigil-harbor__memory_search`.

- Characters outside `A-Za-z0-9_-` are replaced with `-`.
- Fragments that would start with a non-letter get a letter prefix, so numeric
  server keys such as `12306` become provider-safe tool prefixes.
- Server prefixes are capped at 30 characters.
- Full tool names are capped at 64 characters.
- Empty server names fall back to `mcp`.
- Colliding sanitized names are disambiguated with numeric suffixes.
- Final exposed tool order is deterministic by safe name, keeping repeated
  embedded-agent turns cache-stable.
- Profile filtering treats every tool from one bundle MCP server as
  plugin-owned by `bundle-mcp`, so profile allow/deny lists can reference
  either individual exposed tool names or the `bundle-mcp` plugin key.

#### Embedded Bot settings

Claude `settings.json` is imported as default embedded Bot settings when
the bundle is enabled. Bot sanitizes shell override keys before applying
them:

- `shellPath`
- `shellCommandPrefix`

#### Embedded Bot LSP

- Enabled Claude bundles can contribute LSP server config.
- Bot loads `.lsp.json` plus any manifest-declared `lspServers` paths.
- Bundle LSP config is merged into the effective embedded Bot LSP
  defaults.
- Only supported stdio-backed LSP servers are runnable today; unsupported
  transports still show up in `bot plugins inspect <id>`.

### Detected but not executed

These are recognized and shown in diagnostics, but Bot does not run them:

- Claude `agents`, `hooks/hooks.json` automation, `outputStyles`
- Cursor `.cursor/agents`, `.cursor/hooks.json`, `.cursor/rules`
- Codex `.app.json` metadata beyond capability reporting

## Bundle formats

<AccordionGroup>
  <Accordion title="Codex bundles">
    Markers: `.codex-plugin/plugin.json`

    Optional content: `skills/`, `hooks/`, `.mcp.json`, `.app.json`

    Codex bundles fit Bot best when they use skill roots and Bot-style
    hook-pack directories (`HOOK.md` + `handler.ts`).

  </Accordion>

  <Accordion title="Claude bundles">
    Two detection modes:

    - **Manifest-based:** `.claude-plugin/plugin.json`
    - **Manifestless:** default Claude layout (`skills/`, `commands/`, `agents/`, `hooks/`, `.mcp.json`, `.lsp.json`, `settings.json`)

    Claude-specific behavior:

    - `commands/` is treated as skill content
    - `settings.json` is imported into embedded Bot settings (shell override keys are sanitized)
    - `.mcp.json` exposes supported stdio tools to embedded Bot
    - `.lsp.json` plus manifest-declared `lspServers` paths load into embedded Bot LSP defaults
    - `hooks/hooks.json` is detected but not executed
    - Custom component paths in the manifest are additive; they extend defaults, not replace them

  </Accordion>

  <Accordion title="Cursor bundles">
    Markers: `.cursor-plugin/plugin.json`

    Optional content: `skills/`, `.cursor/commands/`, `.cursor/agents/`, `.cursor/rules/`, `.cursor/hooks.json`, `.mcp.json`

    - `.cursor/commands/` is treated as skill content
    - `.cursor/rules/`, `.cursor/agents/`, and `.cursor/hooks.json` are detect-only

  </Accordion>
</AccordionGroup>

## Detection precedence

Bot checks for native plugin format first:

1. `bot.plugin.json` or a valid `package.json` with `bot.extensions` - treated as a **native plugin**
2. Bundle markers (`.codex-plugin/`, `.claude-plugin/`, or default Claude/Cursor layout) - treated as a **bundle**

If a directory contains both, Bot uses the native path. This prevents
dual-format packages from being partially installed as bundles.

## Runtime dependencies and cleanup

- Third-party compatible bundles do not get startup `npm install` repair. They
  should be installed through `bot plugins install` and ship everything
  they need in the installed plugin directory.
- Bot-owned bundled plugins are either shipped lightweight in core or
  downloadable through the plugin installer. Gateway startup never runs a
  package manager for them.
- `bot doctor --fix` removes stale local bundled-plugin install records
  and can recover downloadable plugins that are missing from the local plugin
  index when config still references them.

## Security

Bundles have a narrower trust boundary than native plugins:

- Bot does **not** load arbitrary bundle runtime modules in-process.
- Skills and hook-pack paths must stay inside the plugin root (boundary-checked).
- Settings files are read with the same boundary checks.
- Supported stdio MCP servers may be launched as subprocesses.

This makes bundles safer by default, but you should still treat third-party
bundles as trusted content for the features they do expose.

## Troubleshooting

<AccordionGroup>
  <Accordion title="Bundle is detected but capabilities do not run">
    Run `bot plugins inspect <id>`. If a capability is listed but marked as
    not wired, that is a product limit, not a broken install.
  </Accordion>

  <Accordion title="Claude command files do not appear">
    Make sure the bundle is enabled and the markdown files are inside a detected
    `commands/` or `skills/` root.
  </Accordion>

  <Accordion title="Claude settings do not apply">
    Only embedded Bot settings from `settings.json` are supported. Bot does
    not treat bundle settings as raw config patches.
  </Accordion>

  <Accordion title="Claude hooks do not execute">
    `hooks/hooks.json` is detect-only. If you need runnable hooks, use the
    Bot hook-pack layout or ship a native plugin.
  </Accordion>
</AccordionGroup>

## Related

- [Install and Configure Plugins](/tools/plugin)
- [Building Plugins](/plugins/building-plugins) - create a native plugin
- [Plugin Manifest](/plugins/manifest) - native manifest schema
