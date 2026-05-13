# bot-core — Hanzo Bot canonical contract

Language-agnostic spec for the Hanzo Bot runtime. Same shape as ZAP:
one repo per language port (`bot-ts` / `bot-go` / `bot-rust` / `bot-cpp` /
`bot-py`), all implementing the contracts in this repo so a brain.db
written by any runtime is consumed by any other runtime, and bot
extensions cross-port mechanically.

Status: draft v0. The TS reference implementation is `hanzoai/bot`
(OpenClaw fork). The Go port is `hanzobot/go`.

---

## 1. Process layout

```
                ┌───────────────────────────────┐
                │  hanzo-bot serve (CLI)        │
                │  • config from ~/.hanzo       │
                │  • brain at ~/.hanzo/brain/   │
                │  • recipes from ~/.hanzo/     │
                └──────────────┬────────────────┘
                               │
              ┌────────────────┼─────────────────┐
              ▼                ▼                 ▼
        Gateway          MessageRouter      ChannelAdapters
        (HTTP+WS)        (intent → route)   (Slack, Telegram, …)
              │                │                 │
              └────────┬───────┴────────┬────────┘
                       ▼                ▼
                 BrainHooks       BillingGate
                 (recall/write)   (fail-closed prod)
                       │
                       ▼
                 BrainStore (pluggable)
                 ├─ sqlite (default)
                 ├─ zapdb
                 ├─ qdrant
                 └─ register your own
```

Every runtime exposes both modes:

- **standalone**: `hanzo-bot serve` — single binary, owns its port, owns the brain.
- **embeddable**: imported as a library inside `hanzoai/node` (Rust),
  `hanzoai/cloud` (Go), the Python SDK, etc.

---

## 2. Canonical artifact paths

All runtimes read/write the same paths so brains compose:

| Path                      | What                                     |
| ------------------------- | ---------------------------------------- |
| `~/.hanzo/brain/brain.db` | The brain — pages / edges / facts / FTS5 |
| `~/.hanzo/workspace/`     | Markdown source — auto-ingested          |
| `~/.hanzo/recipes/`       | User-authored YAML recipes               |
| `~/.hanzo/config.toml`    | Per-machine bot/mcp config               |
| `~/.hanzo/cache/`         | Embedding cache, tool-output cache       |
| `~/.hanzo/logs/`          | Structured logs                          |

---

## 3. Channel adapter

```
interface Channel {
  id          : string          // "slack", "telegram", "discord", ...
  start       (ctx) -> Result   // connect, begin listening
  stop        (ctx) -> Result   // graceful shutdown
  send        (msg) -> Result   // outbound to platform
  on_inbound  : (msg) -> *      // platform → router callback
}

type Message {
  channel     : string          // origin id
  user        : string          // platform user id
  room        : string          // channel/room/dm id
  body        : string          // utf-8 text or markdown
  attachments : []Attachment
  ts          : iso8601
}
```

Plain stdin/stdout subprocess plugins also satisfy this contract via a
JSON-Lines protocol, so adapters can be written in any language and
spawned by any host runtime.

---

## 4. BrainStore

The full BrainStore interface is normative for all runtimes. The
canonical reference is [`hanzoai/bot/extensions/memory/index.ts`](https://github.com/hanzoai/bot/blob/main/extensions/memory/index.ts).
Schema (pages / edges / facts / FTS5) is in
[`extensions/memory/sqlite.ts`](https://github.com/hanzoai/bot/blob/main/extensions/memory/sqlite.ts).

```
trait BrainStore {
  init                  () -> Result
  upsert_page           (slug, content, frontmatter?) -> Result
  get_page              (slug) -> Page?
  upsert_edges          (source, edges) -> Result
  edges_for             (slug, dir = In|Out|Both) -> [Edge]
  upsert_fact           (fact) -> Result
  recall                (entity, limit?, since?) -> [Fact]
  hybrid_search         (query, top_k?) -> [SearchHit]
  close                 () -> Result
}
```

Pluggable. Each runtime exposes a `register_backend(name, factory)`.
Canonical backends per the bot/memory README: sqlite (default),
qdrant, meilisearch, postgres, lancedb, zapdb, replicate, vfs.

---

## 5. Graph-links

Zero-LLM regex extractor. Six edge types — `mentions / attended /
works_at / invested_in / founded / advises`. Strip code fences before
extraction. Ports MUST agree on:

- The regex set in [graph-links/index.ts](https://github.com/hanzoai/bot/blob/main/extensions/graph-links/index.ts)
  (TS), `graph_links.py` (Python), `graph_links.rs` (Rust),
  `graphlinks.go` (Go).
- The slugify algorithm: NFKD-normalize, drop combining marks,
  lowercase, replace `&` with " and ", non-alphanumeric → `-`, trim,
  truncate to 80 chars.
- Code-fence stripping: ` ``` … ``` ` removed before extraction.

---

## 6. Recipe runner

YAML schema is documented in [`recipes-brain/recipes/email.yaml`](https://github.com/hanzoai/bot/blob/main/extensions/recipes-brain/recipes/email.yaml)
and is the same shape across runtimes. Keys: `recipe`, `version`,
`backend`, `auth`, `cron`, `ingest`, `classify`, `draft`, `enqueue`,
`notify`, `on_swipe_*`. The runner orchestrates:
`fetch → classify → draft → enqueue → notify`.

---

## 7. BillingGate

Pre-request gate. Three modes via `BILLING_GATE_MODE`:

- `open` — log only, never block
- `warn` — log + emit warn
- `closed` — block when balance ≤ 0 (production default)

Commerce-API contract: `GET /v1/billing/balance/<user>` → `{ balance }`,
`POST /v1/billing/usage` → 202.

---

## 8. MCP surface

Same 13 HIP-0300 tools across all runtimes (`fs / exec / code / git /
fetch / workspace / ui / think / memory / hanzo / plan / tasks / mode`).
Reference impl: [`hanzoai/mcp`](https://github.com/hanzoai/mcp).

Brain extensions add two more tools (`brain.recall`, `brain.search`)
when the bot-brain meta-pack is enabled.

---

## 9. Wire protocol

All inter-runtime messaging — gateway ↔ channel adapter, gateway ↔
brain store, gateway ↔ MCP server — speaks ZAP (zero-copy app proto).
See `zap-proto/spec`. ZAP natively carries MCP, A2A, and ACP.

HTTP and WS are surfaced for browsers and legacy clients; everything
internal is ZAP.

---

## 10. Versioning

This spec is versioned by the contract surface. v0 = draft, expect
breaking changes. v1 will mirror the production TS bot runtime
(`@hanzo/bot >= 1.4.x`). Ports declare their `bot-core` compat version
in their root manifest.
