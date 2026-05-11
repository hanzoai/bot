/**
 * Hanzo Brain — Memory (Postgres + pgvector OR SQLite + sqlite-vec)
 *
 * Dual-mode memory backend. Auto-selects:
 *   - SQLite + sqlite-vec when no DATABASE_URL is set (single-binary solo dev)
 *   - Postgres + pgvector when DATABASE_URL points at a real PG instance
 *
 * Schema mirrors gbrain's brain shape (subjects/pages/embeddings/edges/facts)
 * so the extractor in `@hanzo/bot-graph-links` and recipes in
 * `@hanzo/bot-recipes-brain` work identically against either backend.
 *
 * Hybrid search: vector ANN + tsvector keyword + RRF fusion + compiled-truth
 * boost + backlink boost (when graph edges are present).
 */

import type { Edge } from "@hanzo/bot-graph-links";

// ── Backend abstraction ─────────────────────────────────────────────

export interface BrainStore {
  init(): Promise<void>;
  upsertPage(slug: string, content: string, frontmatter?: Record<string, unknown>): Promise<void>;
  getPage(slug: string): Promise<{ slug: string; content: string; updated_at: string } | null>;
  upsertEdges(source: string, edges: Edge[]): Promise<void>;
  edgesFor(slug: string, dir?: "in" | "out" | "both"): Promise<Edge[]>;
  upsertFact(fact: Fact): Promise<void>;
  recall(entity: string, opts?: { limit?: number; since?: string }): Promise<Fact[]>;
  hybridSearch(query: string, topK?: number): Promise<SearchHit[]>;
  close(): Promise<void>;
}

export interface Fact {
  id?: string;
  subject: string; // entity slug (e.g. "people/alice")
  predicate: string; // e.g. "preference", "status", "decision"
  object: string; // value
  source?: string; // page slug or session id
  ts?: string; // ISO; defaults to now
  confidence?: number; // 0..1
}

export interface SearchHit {
  slug: string;
  excerpt: string;
  score: number;
  source: "vector" | "keyword" | "fused";
}

// ── Selector ────────────────────────────────────────────────────────

export interface MemoryConfig {
  url?: string; // "postgres://..." or "sqlite:///path/to/brain.db"
  embeddingModel?: string; // default text-embedding-3-small
  embeddingApiKey?: string;
  dataDir?: string; // default ~/.hanzo-bot/brain
}

export async function open(cfg: MemoryConfig = {}): Promise<BrainStore> {
  const url = cfg.url ?? process.env.HANZO_BRAIN_URL ?? process.env.DATABASE_URL ?? "";
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    const { PgStore } = await import("./pg.js");
    const store = new PgStore({ url, ...cfg });
    await store.init();
    return store;
  }
  // Default — embedded SQLite. Single-binary, zero infra.
  const { SqliteStore } = await import("./sqlite.js");
  const store = new SqliteStore({ url: url.replace(/^sqlite:\/\//, ""), ...cfg });
  await store.init();
  return store;
}

// ── OpenClaw plugin contract ────────────────────────────────────────

export interface MemoryPostgresApi {
  store: BrainStore;
}

export default async function register(
  api: any,
  cfg: MemoryConfig = {},
): Promise<MemoryPostgresApi> {
  const store = await open(cfg);

  // Wire bot lifecycle hooks. Each is a soft contract — if the bot core
  // doesn't expose the hook, this plugin is inert for that surface.
  if (typeof api?.memory?.registerBackend === "function") {
    api.memory.registerBackend("hanzo-brain", store);
  }
  if (typeof api?.memory?.onUpsertEdges === "function") {
    api.memory.onUpsertEdges((src: string, edges: Edge[]) => store.upsertEdges(src, edges));
  }
  if (typeof api?.tools?.register === "function") {
    api.tools.register({
      name: "brain.recall",
      description: "Recall facts about an entity from the Hanzo Brain.",
      input: { entity: "string", limit: "number?" },
      handler: ({ entity, limit }: { entity: string; limit?: number }) =>
        store.recall(entity, { limit }),
    });
    api.tools.register({
      name: "brain.search",
      description: "Hybrid search across all brain pages.",
      input: { query: "string", topK: "number?" },
      handler: ({ query, topK }: { query: string; topK?: number }) =>
        store.hybridSearch(query, topK),
    });
  }
  return { store };
}
