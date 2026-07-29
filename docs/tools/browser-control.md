---
summary: "Bot browser control API, CLI reference, and scripting actions"
read_when:
  - Scripting or debugging the agent browser via the local control API
  - Looking for the `bot browser` CLI reference
  - Adding custom browser automation with snapshots and refs
title: "Browser control API"
---

For setup, configuration, and troubleshooting, see [Browser](/tools/browser).
This page is the reference for the local control HTTP API, the `bot browser`
CLI, and scripting patterns (snapshots, refs, waits, debug flows).

## Control API (optional)

For local integrations only, the Gateway exposes a small loopback HTTP API.
This standalone server is opt-in — set the environment variable
`BOT_EAGER_BROWSER_CONTROL_SERVER=1` in the gateway service environment
and restart the gateway before the HTTP endpoints become available. Without
this variable the browser control runtime still works through the CLI and
agent tools, but nothing listens on the loopback control port.

- Status/start/stop: `GET /`, `GET /doctor`, `POST /start`, `POST /stop`, `POST /reset-profile`
- Profiles: `GET /profiles`, `POST /profiles/create`, `DELETE /profiles/:name`
- Tabs: `GET /tabs`, `POST /tabs/open`, `POST /tabs/focus`, `DELETE /tabs/:targetId`, `POST /tabs/action`
- Snapshot/screenshot/extract: `GET /snapshot`, `POST /screenshot`, `POST /extract`
- Actions: `POST /navigate`, `POST /act`
- Hooks: `POST /hooks/file-chooser`, `POST /hooks/dialog`
- Downloads: `POST /download`, `POST /wait/download`
- Permissions: `POST /permissions/grant`
- Debugging: `GET /console`, `POST /pdf`
- Debugging: `GET /errors`, `GET /requests`, `GET /dialogs`, `POST /trace/start`, `POST /trace/stop`, `POST /highlight`
- Network: `POST /response/body`
- State: `GET /cookies`, `POST /cookies/set`, `POST /cookies/clear`
- State: `GET /storage/:kind`, `POST /storage/:kind/set`, `POST /storage/:kind/clear`
- Settings: `POST /set/offline`, `POST /set/headers`, `POST /set/credentials`, `POST /set/geolocation`, `POST /set/media`, `POST /set/timezone`, `POST /set/locale`, `POST /set/device`

`POST /tabs/action` is the batched form the CLI uses internally for
`browser tab` subcommands (`{"action":"new"|"label"|"select"|"close"|"list", ...}`);
prefer the single-purpose tab routes above when scripting directly.

All endpoints accept `?profile=<name>`. `POST /start?headless=true` requests a
one-shot headless launch for local managed profiles without changing persisted
browser config; attach-only, remote CDP, and existing-session profiles reject
that override because Bot does not launch those browser processes.

For tab endpoints, `targetId` is the compatibility field name. Prefer passing
`suggestedTargetId` from `GET /tabs` or `POST /tabs/open`; labels and `tabId`
handles such as `t1` are also accepted. Raw CDP target ids and unique raw
target-id prefixes still work, but they are volatile diagnostic handles.

### Page extraction

The agent tool accepts `action="extract"` with required `query` and optional
`targetId`, `timeoutMs`, `selector`, `ignoreSelectors`, and `schema`. `selector`
is a CSS selector that limits capture to matching subtrees; a no-match response
is an error and never falls back to the whole page. `ignoreSelectors` is an
array of CSS selectors removed from the captured subtree before readable text
conversion, so navigation, footers, ads, and banners do not consume the model
context window. The reported `chars` count reflects the scoped, converted text.

`schema` is a JSON Schema object for structured extraction. A successful result
stores the validated value in `details.json` and shows compact JSON in the
wrapped text block. Invalid JSON or a schema mismatch gets one correction retry;
if that also fails, retry without `schema` or adjust the schema. Without
`schema`, extraction keeps its free-text answer and `NOT_FOUND` behavior.

The CLI mirrors these fields with `--selector <css>`, repeatable
`--ignore-selector <css>`, and `--schema <json>`. The private `POST /extract`
capture route accepts `targetId`, `timeoutMs`, `selector`, and
`ignoreSelectors`; schema validation happens in the calling agent tool or CLI.

If shared-secret gateway auth is configured, browser HTTP routes require auth too:

- `Authorization: Bearer <gateway token>`
- `x-bot-password: <gateway password>` or HTTP Basic auth with that password

Notes:

- This standalone loopback browser API does **not** consume trusted-proxy or
  Tailscale Serve identity headers.
- If `gateway.auth.mode` is `none` or `trusted-proxy`, these loopback browser
  routes do not inherit those identity-bearing modes; keep them loopback-only.

### `/act` error contract

`POST /act` uses a structured error response for route-level validation and
policy failures:

```json
{ "error": "<message>", "code": "ACT_*" }
```

Current `code` values:

- `ACT_KIND_REQUIRED` (HTTP 400): `kind` is missing or unrecognized.
- `ACT_INVALID_REQUEST` (HTTP 400): action payload failed normalization or validation.
- `ACT_SELECTOR_UNSUPPORTED` (HTTP 400): `selector` was used with an unsupported action kind.
- `ACT_EVALUATE_DISABLED` (HTTP 403): `evaluate` (or `wait --fn`) is disabled by config.
- `ACT_TARGET_ID_MISMATCH` (HTTP 403): top-level or batched `targetId` conflicts with request target.
- `ACT_EXISTING_SESSION_UNSUPPORTED` (HTTP 501): action is not supported for existing-session profiles.

Other runtime failures may still return `{ "error": "<message>" }` without a
`code` field.

### Playwright requirement

Some features (navigate/act/AI snapshot/role snapshot, extract, element
screenshots, PDF) require Playwright. If Playwright isn't installed, those endpoints return
a clear 501 error.

What still works without Playwright:

- ARIA snapshots
- Role-style accessibility snapshots (`--interactive`, `--compact`,
  `--depth`, `--efficient`) when a per-tab CDP WebSocket is available. This is
  a fallback for inspection and ref discovery; Playwright remains the primary
  action engine.
- Page screenshots for the managed `bot` browser when a per-tab CDP
  WebSocket is available
- Page screenshots for `existing-session` / Chrome MCP profiles
- `existing-session` ref-based screenshots (`--ref`) from snapshot output

What still needs Playwright:

- `navigate`
- `act`
- AI snapshots that depend on Playwright's native AI snapshot format
- CSS-selector element screenshots (`--element`)
- full browser PDF export
- page-question extraction

Element screenshots also reject `--full-page`; the route returns `fullPage is
not supported for element screenshots`.

If you see `Playwright is not available in this gateway build`, the packaged
Gateway is missing the core browser runtime dependency. Reinstall or update
Bot, then restart the gateway. For Docker, also install the Chromium
browser binaries as shown below.

#### Docker Playwright install

If your Gateway runs in Docker, avoid `npx playwright` (npm override conflicts).
For custom images, bake Chromium into the image:

```bash
BOT_INSTALL_BROWSER=1 ./scripts/docker/setup.sh
```

The browser also needs system libraries, so installing Chromium in a one-off
Compose container is not durable. Rebuild the image with
`BOT_INSTALL_BROWSER=1` instead. To persist browser downloads and other
caches, persist `/home/node` with `BOT_HOME_VOLUME` or a bind mount. See
[Docker](/install/docker).

## How it works (internal)

A small loopback control server accepts HTTP requests and connects to Chromium-based browsers via CDP. Advanced actions (click/type/snapshot/PDF) go through Playwright on top of CDP; when Playwright is missing, only non-Playwright operations are available. The agent sees one stable interface while local/remote browsers and profiles swap freely underneath.

## CLI quick reference

All commands accept `--browser-profile <name>` to target a specific profile, and `--json` for machine-readable output.

<AccordionGroup>

<Accordion title="Basics: status, tabs, open/focus/close">

```bash
bot browser status
bot browser doctor
bot browser doctor --deep    # add a live snapshot probe
bot browser start
bot browser start --headless # one-shot local managed headless launch
bot browser stop            # also clears emulation on attach-only/remote CDP
bot browser reset-profile   # moves the profile's browser data to Trash
bot browser tabs
bot browser tab             # shortcut for current tab
bot browser tab new
bot browser tab new --label research
bot browser tab label abcd1234 research
bot browser tab select 2
bot browser tab close 2
bot browser open https://example.com
bot browser focus abcd1234
bot browser close abcd1234
```

</Accordion>

<Accordion title="Profiles: list, create, delete">

```bash
bot browser profiles
bot browser create-profile --name research --color "#0066CC"
bot browser create-profile --name attach --driver existing-session --cdp-url http://127.0.0.1:9222
bot browser delete-profile --name research
```

</Accordion>

<Accordion title="Inspection: screenshot, snapshot, console, errors, requests">

```bash
bot browser screenshot
bot browser screenshot --full-page
bot browser screenshot --ref 12        # or --ref e12
bot browser screenshot --labels
bot browser snapshot
bot browser snapshot --format aria --limit 200
bot browser snapshot --interactive --compact --depth 6
bot browser snapshot --efficient
bot browser snapshot --labels
bot browser snapshot --urls
bot browser snapshot --selector "#main" --interactive
bot browser snapshot --frame "iframe#main" --interactive
bot browser snapshot --out snapshot.txt
bot browser extract "What is the page's main conclusion?"
bot browser extract "List the releases" --selector "main" --ignore-selector "nav" --schema '{"type":"array","items":{"type":"object"}}'
bot browser console --level error
bot browser errors --clear
bot browser requests --filter api --clear
bot browser pdf
bot browser responsebody "**/api" --max-chars 5000
```

</Accordion>

<Accordion title="Actions: navigate, click, type, drag, wait, evaluate">

```bash
bot browser navigate https://example.com
bot browser resize 1280 720
bot browser click 12 --double           # or e12 for role refs
bot browser click-coords 120 340        # viewport coordinates
bot browser type 23 "hello" --submit
bot browser press Enter
bot browser hover 44
bot browser scrollintoview e12
bot browser drag 10 11
bot browser select 9 OptionA OptionB
bot browser download e12 report.pdf
bot browser waitfordownload report.pdf
bot browser upload /tmp/bot/uploads/file.pdf
bot browser upload /tmp/bot/uploads/file.pdf --ref e12
bot browser upload media://inbound/file.pdf
bot browser fill --fields '[{"ref":"1","type":"text","value":"Ada"}]'
bot browser dialog --accept
bot browser dialog --dismiss --dialog-id d1
bot browser wait --text "Done"
bot browser wait "#main" --url "**/dash" --load networkidle --fn "window.ready===true"
bot browser evaluate --fn '(el) => el.textContent' --ref 7
bot browser evaluate --fn 'const title = document.title; return title;'
bot browser evaluate --timeout-ms 30000 --fn 'async () => { await window.ready; return true; }'
bot browser highlight e12
bot browser trace start
bot browser trace stop
```

</Accordion>

<Accordion title="State: cookies, storage, offline, headers, geo, device">

```bash
bot browser cookies
bot browser cookies set session abc123 --url "https://example.com"
bot browser cookies clear
bot browser storage local get
bot browser storage local set theme dark
bot browser storage session clear
bot browser set offline on
bot browser set headers --headers-json '{"X-Debug":"1"}'
bot browser set credentials user pass            # --clear to remove
bot browser set geo 37.7749 -122.4194 --origin "https://example.com"
bot browser set media dark
bot browser set timezone America/New_York
bot browser set locale en-US
bot browser set device "iPhone 14"
```

</Accordion>

</AccordionGroup>

Notes:

- Use `browser extract "<question>"` or agent-tool `action="extract"` when you
  need an answer from the current page but do not need interaction refs. It
  sanitizes readable page content, caps it at 80,000 characters, runs one
  model call, and returns only the wrapped answer. The overall timeout defaults
  to 60 seconds and is clamped to 5–120 seconds. If extraction fails, fall back
  to `snapshot`; existing-session profiles do not support extraction.
- The agent-facing `browser` tool exposes `action=download` (required `ref` and
  `path`) and `action=waitfordownload` (optional `path`). Both return the saved
  download URL, suggested filename, and guarded local path. Explicit download
  interception is available for managed Playwright profiles; existing-session
  profiles return an unsupported-operation error.
- Prefer atomic chooser uploads: pass the trigger `--ref` with the upload so Bot arms and clicks in one request. Paths-only `upload` remains supported when a later trigger is intentional. Use `--input-ref` or `--element` to set a file input directly. `dialog` is an arming call; run it before the click/press that triggers the dialog. If an action opens a modal, the action response includes `blockedByDialog` and `browserState.dialogs.pending`; pass that `dialogId` to respond directly. Dialogs handled outside Bot appear under `browserState.dialogs.recent`.
- `click`/`type`/etc require a `ref` from `snapshot` (numeric `12`, role ref `e12`, or actionable ARIA ref `ax12`). CSS selectors are intentionally not supported for actions. Use `click-coords` when the visible viewport position is the only reliable target.
- Download and trace paths are constrained to Bot temp roots: `/tmp/bot{,/downloads}` (fallback: `${os.tmpdir()}/bot/...`).
- `upload` accepts files from the Bot temp uploads root and
  Bot-managed inbound media. Managed inbound media can be referenced as
  `media://inbound/<id>`, sandbox-relative `media/inbound/<id>`, or a resolved
  path inside the managed inbound media directory. Nested media refs,
  traversal, symlinks, hardlinks, and arbitrary local paths are still rejected.
- `upload` can also set file inputs directly via `--input-ref` or `--element`.

Stable tab ids and labels survive Chromium raw-target replacement when Bot
can prove the replacement tab, such as a unique old/new pair for the same URL or
a single old tab becoming a single new tab after form submission. Ambiguous
duplicate-URL replacements receive fresh handles. Raw target ids are still
volatile; prefer `suggestedTargetId` from `tabs` in scripts.

Snapshot flags at a glance:

- `--format ai` (default with Playwright): AI snapshot with numeric refs (`aria-ref="<n>"`).
- `--format aria`: accessibility tree with `axN` refs. When Playwright is available, Bot binds refs with backend DOM ids to the live page so follow-up actions can use them; otherwise treat the output as inspection-only.
- `--efficient` (or `--mode efficient`): compact role snapshot preset. Set `browser.snapshotDefaults.mode: "efficient"` to make this the default (see [Gateway configuration](/gateway/configuration-reference#browser)).
- `--interactive`, `--compact`, `--depth`, `--selector` force a role snapshot with `ref=e12` refs. `--frame "<iframe>"` scopes role snapshots to an iframe.
- With Playwright, `--labels` adds a screenshot with overlayed ref labels
  (prints `MEDIA:<path>`) plus an `annotations` array with each ref's bounding
  box. On `screenshot`, Playwright-backed labels work with `--full-page`,
  `--ref`, and `--element`; on `snapshot`, the accompanying screenshot remains
  viewport-only. Existing-session/chrome-mcp profiles render overlay labels on
  page screenshots but do not return `annotations` or use the Playwright
  full-page/ref/element projection helper. Without Playwright or chrome-mcp,
  labeled screenshots are not available.
- `--urls` appends discovered link destinations to AI snapshots.

## Snapshots and refs

Bot supports two "snapshot" styles:

- **AI snapshot (numeric refs)**: `bot browser snapshot` (default; `--format ai`)
  - Output: a text snapshot that includes numeric refs.
  - Actions: `bot browser click 12`, `bot browser type 23 "hello"`.
  - Internally, the ref is resolved via Playwright's `aria-ref`.

- **Role snapshot (role refs like `e12`)**: `bot browser snapshot --interactive` (or `--compact`, `--depth`, `--selector`, `--frame`)
  - Output: a role-based list/tree with `[ref=e12]` (and optional `[nth=1]`).
  - Actions: `bot browser click e12`, `bot browser highlight e12`.
  - Internally, the ref is resolved via `getByRole(...)` (plus `nth()` for duplicates).
  - Add `--labels` to include a screenshot with overlayed `e12` labels. On
    Playwright-backed profiles this also returns per-ref bounding-box metadata
    (`annotations[]`).
  - Add `--urls` when link text is ambiguous and the agent needs concrete
    navigation targets.

- **ARIA snapshot (ARIA refs like `ax12`)**: `bot browser snapshot --format aria`
  - Output: the accessibility tree as structured nodes.
  - Actions: `bot browser click ax12` works when the snapshot path can bind
    the ref through Playwright and Chrome backend DOM ids.
- If Playwright is unavailable, ARIA snapshots can still be useful for
  inspection, but refs may not be actionable. Re-snapshot with `--format ai`
  or `--interactive` when you need action refs.
- When the driver exposes stable document identity, consecutive AI and role
  snapshots for the same profile, tab, document, and option family append
  `[new]` to ref-bearing lines absent from the previous snapshot. Navigation
  starts a fresh unmarked baseline; existing-session snapshots omit deltas.
  The first snapshot establishes the baseline without markers; later responses
  also expose `newElements`, and add a count footer when the value is nonzero.
  Structured `--format aria` snapshots with `axN` refs do not use delta markers.
- Docker proof for the raw-CDP fallback path: `pnpm test:docker:browser-cdp-snapshot`
  starts Chromium with CDP, runs `browser doctor --deep`, and verifies role
  snapshots include link URLs, cursor-promoted clickables, and iframe metadata.

Ref behavior:

- Refs are **not stable across navigations**; if something fails, re-run `snapshot` and use a fresh ref.
- A batch stops after a committed main-frame navigation—including a same-URL
  reload—or after the page closes. Its `aborted` summary reports the action
  number and skipped count; take a fresh snapshot before issuing dependent
  actions, or use separate act calls when navigation is expected.
- `/act` returns the current raw `targetId` after action-triggered replacement
  when it can prove the replacement tab. Keep using stable tab ids/labels for
  follow-up commands.
- If the role snapshot was taken with `--frame`, role refs are scoped to that iframe until the next role snapshot.
- Unknown or stale `axN` refs fail fast instead of falling through to
  Playwright's `aria-ref` selector. Run a fresh snapshot on the same tab when
  that happens.

## Browser batch CLI

`bot browser batch` runs an array of nested `/act` actions in one `/act`
call (the same `kind="batch"` runtime reached through the agent tool), so CLI
users and scripts can combine actions like `wait`, `click`, `type`, and
`evaluate` into a single replayable plan without per-action round trips. Each
entry in `actions[]` is a `BrowserActRequest` — the closed union the `/act`
route accepts (`click`, `clickCoords`, `type`, `press`, `hover`,
`scrollIntoView`, `drag`, `select`, `fill`, `resize`, `wait`, `evaluate`,
`close`, `batch`) — not arbitrary `bot browser` subcommands. `batch` is
not supported on `profile="user"` and other existing-session (chrome-mcp)
profiles; send actions individually there.

- CLI: `bot browser batch --actions '<json>'`, `bot browser batch
--actions-file plan.json`, or `bot browser batch --actions-file -` to
  read the JSON array from stdin. `--continue` sets `stopOnError=false`; the
  default is to stop on first error. `--target-id` scopes the whole batch to
  one tab.
- Ref lifecycle: refs come from a `snapshot` run before the batch (snapshot is
  not a nested action). A nested action that changes page state — such as a
  `click` that triggers navigation, or an `evaluate` that mutates the DOM — can
  invalidate earlier refs for the rest of the batch. Put state-changing actions
  first, or split into a follow-up batch after re-snapshotting. Navigation and
  re-snapshotting happen outside the batch (`bot browser navigate` /
  `snapshot`), since `open`, `navigate`, and `snapshot` are not `/act` kinds.
- Target id conflicts: a nested action may omit `targetId` or repeat the
  request-level `targetId`; an explicit nested `targetId` that resolves to a
  different tab is rejected with `ACT_TARGET_ID_MISMATCH` before any action
  runs. Batched actions share the request's tab by design.
- Error summary: the response is `{ "results": [{ "ok": true }, { "ok": false,
"error": "<message>" }, ...] }`, one entry per action in order. When
  `stopOnError` is the default, the array ends at the first failure; with
  `--continue` it covers every action. Any failed entry makes the CLI exit
  nonzero; pass `--json` to preserve the full ordered response for scripts.

## Wait power-ups

You can wait on more than just time/text:

- Wait for URL (globs supported by Playwright):
  - `bot browser wait --url "**/dash"`
- Wait for load state:
  - `bot browser wait --load networkidle`
  - Supported on managed `bot` and raw/remote CDP profiles. Profiles using the `existing-session` driver (including the default `user` profile) reject `networkidle`; use `--url`, `--text`, a selector, or `--fn` waits there.
- Wait for a JS predicate:
  - `bot browser wait --fn "window.ready===true"`
- Wait for a selector to become visible:
  - `bot browser wait "#main"`

These can be combined:

```bash
bot browser wait "#main" \
  --url "**/dash" \
  --load networkidle \
  --fn "window.ready===true" \
  --timeout-ms 15000
```

## Debug workflows

When an action fails (e.g. "not visible", "strict mode violation", "covered"):

1. `bot browser snapshot --interactive`
2. Use `click <ref>` / `type <ref>` (prefer role refs in interactive mode)
3. If it still fails: `bot browser highlight <ref>` to see what Playwright is targeting
4. If the page behaves oddly:
   - `bot browser errors --clear`
   - `bot browser requests --filter api --clear`
5. For deep debugging: record a trace:
   - `bot browser trace start`
   - reproduce the issue
   - `bot browser trace stop` (prints `TRACE:<path>`)

## JSON output

`--json` is for scripting and structured tooling.

Examples:

```bash
bot browser --json status
bot browser --json snapshot --interactive
bot browser --json requests --filter api
bot browser --json cookies
```

Role snapshots in JSON include `refs` plus a small `stats` block (lines/chars/refs/interactive) so tools can reason about payload size and density.

## State and environment knobs

These are useful for "make the site behave like X" workflows:

- Cookies: `cookies`, `cookies set`, `cookies clear`
- Storage: `storage local|session get|set|clear`
- Offline: `set offline on|off`
- Headers: `set headers --headers-json '{"X-Debug":"1"}'` (or the positional form `set headers '{"X-Debug":"1"}'`)
- HTTP basic auth: `set credentials user pass` (or `--clear`)
- Geolocation: `set geo <lat> <lon> --origin "https://example.com"` (or `--clear`)
- Media: `set media dark|light|no-preference|none`
- Timezone / locale: `set timezone ...`, `set locale ...`
- Device / viewport:
  - `set device "iPhone 14"` (Playwright device presets)
  - `set viewport 1280 720`

## Security and privacy

- The bot browser profile may contain logged-in sessions; treat it as sensitive.
- `browser act kind=evaluate` / `bot browser evaluate` and `wait --fn`
  execute arbitrary JavaScript in the page context. Prompt injection can steer
  this. Disable it with `browser.evaluateEnabled=false` if you do not need it.
- `bot browser evaluate --fn` accepts a function source, an expression, or
  a statement body. Statement bodies are wrapped as async functions, so use
  `return` for the value you want back. Use `--timeout-ms <ms>` when the
  page-side function may need longer than the default evaluate timeout.
- For logins and anti-bot notes (X/Twitter, etc.), see [Browser login + X/Twitter posting](/tools/browser-login).
- Keep the Gateway/node host private (loopback or tailnet-only).
- Remote CDP endpoints are powerful; tunnel and protect them.

Strict-mode example (block private/internal destinations by default):

```json5
{
  browser: {
    ssrfPolicy: {
      dangerouslyAllowPrivateNetwork: false,
      hostnameAllowlist: ["*.example.com", "example.com"],
      allowedHostnames: ["localhost"], // optional exact allow
    },
  },
}
```

## Related

- [Browser](/tools/browser) - overview, configuration, profiles, security
- [Browser login](/tools/browser-login) - signing in to sites
- [Browser Linux troubleshooting](/tools/browser-linux-troubleshooting)
- [Browser WSL2 troubleshooting](/tools/browser-wsl2-windows-remote-cdp-troubleshooting)
