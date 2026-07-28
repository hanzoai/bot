---
summary: "CLI reference for `bot browser` (lifecycle, profiles, tabs, actions, state, and debugging)"
read_when:
  - You use `bot browser` and want examples for common tasks
  - You want to control a browser running on another machine via a node host
  - You want to attach to your local signed-in Chrome via Chrome MCP
title: "Browser"
---

# `bot browser`

Manage Bot's browser control surface and run browser actions: lifecycle, profiles, tabs, snapshots, screenshots, navigation, input, state emulation, and debugging.

Related: [Browser tool](/tools/browser)

## Common flags

- `--url <gatewayWsUrl>`: Gateway WebSocket URL (defaults to config).
- `--token <token>`: Gateway token (if required).
- `--timeout <ms>`: request timeout in ms (default: `30000`).
- `--expect-final`: wait for a final Gateway response.
- `--browser-profile <name>`: choose a browser profile (default: `bot`, or `browser.defaultProfile`).
- `--json`: machine-readable output (where supported). This is a browser-level option, so
  place it before the subcommand for an unambiguous form, such as
  `bot browser --json status`. Trailing placement such as
  `bot browser status --json` also works when the selected child command does not
  define its own `--json`.

## Quick start (local)

```bash
bot browser profiles
bot browser --browser-profile bot start
bot browser --browser-profile bot open https://example.com
bot browser --browser-profile bot snapshot
```

Agents can run the same readiness check with `browser({ action: "doctor" })`.

## Quick troubleshooting

If `start` fails with `not reachable after start`, troubleshoot CDP readiness first. If `start` and `tabs` succeed but `open` or `navigate` fails, the browser control plane is healthy and the failure is usually a navigation SSRF policy block.

Minimal sequence:

```bash
bot browser --browser-profile bot doctor
bot browser --browser-profile bot start
bot browser --browser-profile bot tabs
bot browser --browser-profile bot open https://example.com
```

Detailed guidance: [Browser troubleshooting](/tools/browser#cdp-startup-failure-vs-navigation-ssrf-block)

## Lifecycle

```bash
bot browser status
bot browser doctor
bot browser doctor --deep
bot browser start
bot browser start --headless
bot browser stop
bot browser --browser-profile bot reset-profile
```

- `doctor --deep` adds a live snapshot probe: useful when basic CDP readiness is green but you want proof the current tab can be inspected.
- For a running local managed profile, `status` and `doctor` report cached
  graphics diagnostics from Chrome: hardware/software classification, renderer,
  backend, device/driver, feature and disabled-status details, and accelerated
  video capabilities. `bot browser --json status` returns the full structured payload.
  Passive status never launches Chrome just to collect these facts.
- `stop` closes the active control session and clears temporary emulation overrides even for `attachOnly` and remote CDP profiles where Bot did not launch the browser process itself. For local managed profiles, `stop` also stops the spawned browser process.
- `start --headless` applies only to that start request, and only when Bot launches a local managed browser. It does not rewrite `browser.headless` or profile config, and is a no-op for an already-running browser.
- On Linux hosts without `DISPLAY` or `WAYLAND_DISPLAY`, local managed profiles run headless automatically unless `BOT_BROWSER_HEADLESS=0`, `browser.headless=false`, or `browser.profiles.<name>.headless=false` explicitly requests a visible browser.

## If the command is missing

If `bot browser` is an unknown command, check `plugins.allow` in `~/.hanzoai/bot.json`. When `plugins.allow` is present, list the bundled browser plugin explicitly unless the config already has a root `browser` block:

```json5
{
  plugins: {
    allow: ["telegram", "browser"],
  },
}
```

An explicit root `browser` block (for example `browser.enabled=true` or `browser.profiles.<name>`) also activates the bundled browser plugin under a restrictive plugin allowlist.

Related: [Browser tool](/tools/browser#missing-browser-command-or-tool)

## Profiles

Profiles are named browser routing configs:

- `bot` (default): launches or attaches to a dedicated Bot-managed Chrome instance (isolated user data dir).
- `user`: controls your existing signed-in Chrome session via Chrome DevTools MCP.
- custom CDP profiles: point at a local or remote CDP endpoint.

```bash
bot browser profiles
bot browser system-profiles
bot browser system-profiles --browser brave
bot browser import-profile --browser chrome --system Default --into imported
bot browser import-profile --system "Profile 1" --into work --domains google.com,youtube.com
bot browser create-profile --name work --color "#FF5A36"
bot browser create-profile --name chrome-live --driver existing-session
bot browser create-profile --name remote --cdp-url https://browser-host.example.com
bot browser delete-profile --name work
```

Use a specific profile with `--browser-profile <name>` on any subcommand, for example `bot browser --browser-profile work tabs`.

On macOS, `system-profiles` lists real Chrome, Brave, Edge, or Chromium profiles available on the host. `import-profile` decrypts their cookies after one macOS Keychain/Touch ID consent prompt and injects them into a fresh Bot-managed profile. It imports cookies only; local storage and IndexedDB are unchanged. Some Google sessions use device-bound session credentials (DBSC) and can still require re-authentication after import.

When the macOS app uses a local Gateway, it can offer this import once and make the isolated imported profile the default for agent browsing. Import always requires an explicit click; successful import or dismissal suppresses later automatic prompts, and **Settings → General → Browser login** remains available for re-import.

System-profile import is enabled by default. Set `browser.allowSystemProfileImport=false` to disable both CLI and agent-triggered imports. Import is host-local and cannot run through the browser node proxy.

## Tabs

```bash
bot browser tabs
bot browser tab new --label docs
bot browser tab label t1 docs
bot browser tab select 2
bot browser tab close 2
bot browser open https://docs.bot.ai --label docs
bot browser focus docs
bot browser close t1
```

`tabs` returns `suggestedTargetId` first, then the stable `tabId` (such as `t1`), the optional label, and the raw `targetId`. Pass `suggestedTargetId` back into `focus`, `close`, snapshots, and actions. Assign a label with `open --label`, `tab new --label`, or `tab label`; labels, tab ids, raw target ids, and unique target-id prefixes are all accepted. The request field is still named `targetId` for compatibility, but it accepts any of these tab references.

Raw target ids are volatile diagnostic handles, not durable agent memory: when Chromium replaces the underlying raw target during a navigation or form submit, Bot keeps the stable `tabId`/label attached to the replacement tab when it can prove the match. Prefer `suggestedTargetId`.

## Extract / snapshot / screenshot / actions

Answer a question from the current page without printing the page content:

```bash
bot browser extract "What is the main conclusion?"
bot browser extract "Which deadline is listed?" --target-id docs --timeout-ms 90000
bot browser extract "List the releases" --selector "main" --ignore-selector "nav" --schema '{"type":"array","items":{"type":"object"}}'
```

`extract` uses the selected agent model, returns only the wrapped answer, and
reports `NOT_FOUND` when the answer is absent. Its overall timeout defaults to
60 seconds and is clamped to 5–120 seconds. It requires a Playwright-backed
profile; use `snapshot` when you need refs or when extraction is unavailable.
Use `--selector <css>` to limit large pages to matching subtrees and repeat
`--ignore-selector <css>` to remove navigation, footers, ads, or banners before
conversion. `--schema <json>` requests validated structured output in
`details.json`; invalid structured output is retried once, then fails with
guidance to retry without the schema.

Snapshot:

```bash
bot browser snapshot
bot browser snapshot --urls
```

Screenshot:

```bash
bot browser screenshot
bot browser screenshot --full-page
bot browser screenshot --ref e12
bot browser screenshot --labels
```

- `--full-page` is for page captures only; it cannot be combined with `--ref` or `--element`.
- `existing-session` / `user` profiles support page screenshots and `--ref` screenshots from snapshot output, but not CSS `--element` screenshots.
- `--labels` overlays current snapshot refs on the screenshot. On Playwright-backed profiles it works with `--full-page` (full-page overlay), `--ref` (element-clip overlay by ARIA ref), and `--element` (element-clip overlay by CSS selector); in element-clip modes labels are projected relative to the element. The response also includes an `annotations` array (omitted when empty) with each ref's bounding box: `ref`, `number`, `role`, optional `name`, and `box: {x, y, width, height}` in the captured image's coordinate space (viewport / fullpage / element-relative).
  `existing-session` profiles render a chrome-mcp overlay on page screenshots but do not use the Playwright projection helper and do not include `annotations`; CSS `--element` screenshots are unsupported there. Without Playwright or chrome-mcp, labeled screenshots are not available.
- `snapshot --urls` appends discovered link destinations to AI snapshots so agents can choose direct navigation targets instead of guessing from link text alone.

Navigate/click/type (ref-based UI automation):

```bash
bot browser navigate https://example.com
bot browser click <ref>
bot browser click-coords 120 340
bot browser type <ref> "hello"
bot browser press Enter
bot browser hover <ref>
bot browser scrollintoview <ref>
bot browser drag <startRef> <endRef>
bot browser select <ref> OptionA OptionB
bot browser fill --fields '[{"ref":"1","value":"Ada"}]'
bot browser wait --text "Done"
bot browser evaluate --fn '(el) => el.textContent' --ref <ref>
bot browser evaluate --fn 'const title = document.title; return title;'
bot browser evaluate --timeout-ms 30000 --fn 'async () => { await window.ready; return true; }'
```

`evaluate --fn` accepts a function source, an expression, or a statement body. Statement bodies are wrapped as async functions, so use `return` for the value you want back. Use `--timeout-ms` when the page-side function may need longer than the default evaluate timeout. `browser.evaluateEnabled=false` (default: `true`) disables both `evaluate` and `wait --fn`.

Action responses return the current raw `targetId` after action-triggered page replacement when Bot can prove the replacement tab. Scripts should still store and pass `suggestedTargetId`/labels for long-lived workflows.

File + dialog helpers:

```bash
bot browser upload /tmp/bot/uploads/file.pdf --ref <ref>
bot browser upload media://inbound/file.pdf --ref <ref>
bot browser waitfordownload
bot browser download <ref> report.pdf
bot browser dialog --accept
bot browser dialog --dismiss --dialog-id d1
```

Managed Chrome profiles save ordinary click-triggered downloads into the Bot downloads directory (`/tmp/bot/downloads` by default, or the configured temp root). Use `waitfordownload` or `download` when the agent needs to wait for a specific file and return its path; those explicit waiters own the next download. Uploads accept files from the Bot temp uploads root and Bot-managed inbound media, including `media://inbound/<id>` and sandbox-relative `media/inbound/<id>` references. Nested media refs, traversal, and arbitrary local paths are rejected.

When an action opens a modal dialog, the action response returns `blockedByDialog` with `browserState.dialogs.pending`; pass `--dialog-id` to answer it directly. Dialogs handled outside Bot appear under `browserState.dialogs.recent`.

Batch actions:

```bash
bot browser batch --actions '[{"kind":"wait","timeMs":500},{"kind":"click","ref":"12"},{"kind":"type","ref":"23","text":"hello"}]'
bot browser batch --actions-file plan.json
bot browser batch --actions-file - --continue
```

`bot browser batch` sends a `kind="batch"` `/act` request with nested `BrowserActRequest` actions (`wait`, `click`, `type`, `evaluate`, ...) — not `open`/`navigate`/`snapshot`/`screenshot`, which are CLI subcommands, not `/act` kinds. `--continue` sets `stopOnError=false` (default stops on first error); `--target-id` scopes the whole batch to one tab. A failed nested action makes the command exit nonzero; use `--json` to retain the ordered `results` response. See [Browser batch CLI](/tools/browser-control#browser-batch-cli) for the full contract (ref lifecycle, target id conflicts, error summary). `batch` is not supported on `profile="user"` / existing-session profiles.

## State and storage

Viewport + emulation:

```bash
bot browser resize 1280 720
bot browser set viewport 1280 720
bot browser set offline on
bot browser set media dark
bot browser set timezone Europe/London
bot browser set locale en-GB
bot browser set geo 51.5074 -0.1278 --accuracy 25
bot browser set device "iPhone 14"
bot browser set headers '{"x-test":"1"}'
bot browser set credentials myuser mypass
```

Cookies + storage:

```bash
bot browser cookies
bot browser cookies set session abc123 --url https://example.com
bot browser cookies clear
bot browser storage local get
bot browser storage local set token abc123
bot browser storage session clear
```

## Debugging

```bash
bot browser console --level error
bot browser pdf
bot browser responsebody "**/api"
bot browser highlight <ref>
bot browser errors --clear
bot browser requests --filter api
bot browser trace start
bot browser trace stop --out trace.zip
```

## Existing Chrome via MCP

Use the built-in `user` profile, or create your own `existing-session` profile:

```bash
bot browser --browser-profile user tabs
bot browser create-profile --name chrome-live --driver existing-session
bot browser create-profile --name brave-live --driver existing-session --user-data-dir "~/Library/Application Support/BraveSoftware/Brave-Browser"
bot browser create-profile --name chrome-port --driver existing-session --cdp-url http://127.0.0.1:9222
bot browser --browser-profile chrome-live tabs
```

The default existing-session path is host-only Chrome MCP auto-connect. If the browser is already running with a DevTools endpoint, pass `--cdp-url` so Chrome MCP attaches to that endpoint instead. For Docker, Browserless, or other remote setups where Chrome MCP semantics are not needed, use a CDP profile instead.

Current existing-session limits:

- Snapshot-driven actions use refs, not CSS selectors.
- Supported `act` requests use a built-in 60000 ms default when callers omit `timeoutMs`; per-call `timeoutMs` still wins.
- `click` is left-click only.
- `type` does not support `slowly=true`.
- `press` does not support `delayMs`.
- `hover`, `scrollintoview`, `drag`, `select`, and `fill` reject per-call timeout overrides; `evaluate` accepts `--timeout-ms`.
- `select` supports one value only.
- `wait --load networkidle` is not supported (works on managed and raw/remote CDP profiles).
- File uploads require `--ref` / `--input-ref`, do not support CSS `--element`, and support one file at a time.
- Dialog hooks do not support `--timeout`.
- Screenshots support page captures and `--ref`, but not CSS `--element`.
- `extract`, `responsebody`, download interception, PDF export, and batch actions still require a managed browser or raw CDP profile.

## Remote browser control (node host proxy)

If the Gateway runs on a different machine than the browser, run a **node host** on the machine that has Chrome/Brave/Edge/Chromium. The Gateway proxies browser actions to that node; no separate browser control server is required.

Use `gateway.nodes.browser.mode` to control auto-routing and `gateway.nodes.browser.node` to pin a specific node if multiple are connected.

Security + remote setup: [Browser tool](/tools/browser), [Remote access](/gateway/remote), [Tailscale](/gateway/tailscale), [Security](/gateway/security)

## Related

- [CLI reference](/cli)
- [Browser](/tools/browser)
