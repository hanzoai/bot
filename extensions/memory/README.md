# @hanzo/bot-memory

> The Hanzo Brain memory layer. Pluggable BrainStore contract. SQLite default — single file, zero infra. **Path shared across every Hanzo SDK** at `~/.hanzo/brain/brain.db`.

## Canonical artifact locations

Every Hanzo SDK on a machine reads/writes the same paths so brains
compose across the bot, hanzo-mcp, hanzo-dev, and the Python SDK:

| Path                      | What                                     |
| ------------------------- | ---------------------------------------- |
| `~/.hanzo/brain/brain.db` | The brain — pages / edges / facts / FTS5 |
| `~/.hanzo/workspace/`     | Markdown source — auto-ingested          |
| `~/.hanzo/config.toml`    | Per-machine bot/mcp config               |
| `~/.hanzo/cache/`         | Embedding cache, tool-output cache       |
| `~/.hanzo/logs/`          | Structured logs                          |

## What ships in core

- **SQLite backend** (canonical default) — `~/.hanzo/brain/brain.db`. FTS5 keyword. Optional sqlite-vec for ANN.
- **Pluggable interface** — `registerBackend("name", factory)`. Anyone can ship Qdrant / Meilisearch / Postgres / LanceDB / D1 / libSQL as a sibling extension.

## Scale-out backends (sibling extensions, not in core)

Hanzo ships the heavy machinery, all open source — register them by name.
Native stack uses **ZAP** (zero-copy transport) + **hanzo-consensus** (metastable
agent agreement) + **zapdb** (storage primitives) end-to-end. No libSQL,
no Turso — we ship our own.

| Backend       | Repo                                               | License  | Use                                                                                                                                        |
| ------------- | -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `qdrant`      | [`~/work/hanzo/vector`](../../../vector/)          | Apache 2 | Vector ANN at scale (millions of embeddings, multi-replica)                                                                                |
| `meilisearch` | [`~/work/hanzo/search`](../../../search/)          | (fork)   | Fast keyword FTS when SQLite FTS5 stops being enough                                                                                       |
| `replicate`   | [`~/work/hanzo/replicate`](../../../replicate/)    | (fork)   | Background SQLite WAL → S3 backup, point-in-time restore                                                                                   |
| `vfs`         | [`~/work/hanzo/vfs`](../../../vfs/)                | Apache 2 | S3-backed virtual block FS with PQ encryption — unlimited write storage                                                                    |
| `luxdb`       | [`~/work/lux/database`](../../../../lux/database/) | BSD-3    | Canonical Hanzo storage layer (Go) — wraps internal zapdb primitives. Use `luxfi/database` as the public API; never import zapdb directly. |
| `zapdb-cpp`   | [`~/work/luxcpp/zapdb`](../../../../luxcpp/zapdb/) | Apache 2 | C++ port of zapdb; same wire format as Go luxdb.                                                                                           |
| `postgres`    | (sibling pkg)                                      |          | Multi-tenant team brain with pgvector                                                                                                      |

### The native distributed-SQL story (we ship our own — not libSQL/Turso)

For multi-machine SQLite-shaped semantics with native replication, the
canonical Hanzo stack is **ZAP + hanzo-consensus + zapdb**, not libSQL/Turso:

- **Wire**: ZAP (zero-copy transport) — same protocol the rest of Hanzo speaks. Carries MCP, A2A, and ACP natively too.
- **Consensus**: `hanzo-consensus` for metastable agent agreement. For storage-level write ordering we run the same metastable primitive on a node quorum (one quorum per brain shard).
- **Storage**: `luxfi/database` is the Go public API, backed by `luxfi/zapdb` (internal — don't import directly). `luxcpp/zapdb` is the C++ port (same wire format).
- **Backup**: `replicate` ships SQLite WAL → S3 for the solo + small-team cases.
- **Streaming**: `vfs` for unlimited-size brains backed by S3 blocks with PQ encryption.

The multi-replica SQL primitive is in-flight — track in `~/work/lux/database` (Go) and `~/work/luxcpp` (C++). We deliberately don't pull in libSQL or Turso for this; they would force us off our own ZAP+consensus path.

Default routing:

- **Solo dev, < 100K pages** → SQLite + FTS5 (zero infra)
- **Solo dev, > 10K pages with vector** → SQLite + `sqlite-vec` (requires better-sqlite3 driver — bun:sqlite has no extension loading)
- **Durable solo (offsite backup)** → SQLite + `replicate` to S3
- **Multi-machine personal** → `luxfi/database` over ZAP + hanzo-consensus (our native distributed-SQL story; in-flight)
- **Team / Hanzo Node** → Qdrant for vectors + Meilisearch for FTS + `luxfi/database` for facts/edges (or Postgres if multi-tenant + external)
- **Org-scale streaming** → VFS-backed brain.db, lazy block-level fetch from S3, unlimited size

## Schema

```sql
CREATE TABLE pages (
  slug         TEXT PRIMARY KEY,
  content      TEXT NOT NULL,
  frontmatter  TEXT,                   -- JSON
  updated_at   TEXT NOT NULL           -- ISO 8601
);

-- FTS5 virtual table over pages.content
CREATE VIRTUAL TABLE pages_fts USING fts5(content, content='pages', content_rowid='rowid');

CREATE TABLE edges (
  source    TEXT NOT NULL,             -- page slug
  target    TEXT NOT NULL,             -- entity slug
  type      TEXT NOT NULL,             -- mentions/attended/works_at/invested_in/founded/advises
  evidence  TEXT,                      -- verbatim phrase that triggered inference
  PRIMARY KEY (source, target, type)
);

CREATE TABLE facts (
  id          TEXT PRIMARY KEY,        -- subject::predicate::ts
  subject     TEXT NOT NULL,           -- entity slug
  predicate   TEXT NOT NULL,           -- preference/status/decision/replied/…
  object      TEXT NOT NULL,
  source      TEXT,                    -- originating page slug or session id
  ts          TEXT NOT NULL,           -- ISO 8601
  confidence  REAL DEFAULT 1.0
);
```

Anyone implementing `BrainStore` for another backend should mirror this shape — `@hanzo/bot-graph-links` and `@hanzo/bot-recipes-brain` Just Work against any conforming store.

## Pluggability

```ts
import { registerBackend, open } from "@hanzo/bot-memory";

registerBackend("my-store", async (cfg) => {
  const store: BrainStore = makeMyStore(cfg);
  return store;
});

const store = await open({ backend: "my-store" });
```

Environment override: `HANZO_BRAIN_BACKEND=my-store`.

## API surface

```ts
const store = await open(); // SQLite, ~/.hanzo/brain/brain.db

await store.upsertPage("people/alice", markdown, { type: "person" });
await store.upsertEdges("people/alice", edges);
await store.upsertFact({
  subject: "people/alice",
  predicate: "preference",
  object: "replies in under 2 hours",
});

const facts = await store.recall("people/alice", { limit: 50 });
const hits = await store.hybridSearch("Acme", 5);
const out = await store.edgesFor("people/alice", "out");
```

## Config

```ts
interface MemoryConfig {
  backend?: string; // default "sqlite"
  dataDir?: string; // default ~/.hanzo/brain
  dbPath?: string; // explicit file; overrides dataDir
  embeddingModel?: string; // for the optional vector ANN path
  embeddingApiKey?: string;
}
```

## Driver

- **bun:sqlite** (canonical — already built into Bun, no install needed)
- **better-sqlite3** (fallback for Node-only deployments)

Either works. The init step tries bun:sqlite first.

## Tests

```bash
cd ~/work/hanzo/bot && bun test extensions/memory
```

Covers: upsert + read pages, upsert + read edges, upsert + recall facts, FTS hybrid search, pluggability (register a stub backend), unknown-backend error message.
