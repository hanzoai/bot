# @hanzo/bot-memory

> The Hanzo Brain memory layer. Pluggable BrainStore contract. SQLite default — single file, zero infra.

## What ships

- **SQLite backend** (canonical default) — `~/.hanzo-bot/brain/brain.db`. FTS5 keyword. Optional sqlite-vec for ANN.
- **Pluggable interface** — `registerBackend("name", factory)`. Anyone can ship Postgres / LanceDB / D1 / libSQL as a sibling extension.

No Postgres in core. Solo devs run one binary. Teams that want managed Postgres install a separate `@hanzo/bot-memory-postgres` extension (not shipped here).

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
const store = await open(); // SQLite, ~/.hanzo-bot/brain/brain.db

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
  dataDir?: string; // default ~/.hanzo-bot/brain
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
