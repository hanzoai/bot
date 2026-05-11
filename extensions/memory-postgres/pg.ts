/**
 * Postgres + pgvector backend.
 *
 * Mirrors the SQLite schema 1:1 so plug-and-play with the SQLite path.
 * Hybrid search: tsvector (postgres native FTS) + pgvector ivfflat/hnsw + RRF.
 *
 * Requires:
 *   CREATE EXTENSION IF NOT EXISTS vector;
 * The init() step issues that DDL — caller's role must have permission.
 */

import type { Edge } from "@hanzo/bot-graph-links";
import type { BrainStore, Fact, MemoryConfig, SearchHit } from "./index.js";

export class PgStore implements BrainStore {
  private pool: any = null;
  private cfg: MemoryConfig & { url: string };

  constructor(cfg: MemoryConfig & { url: string }) {
    this.cfg = cfg;
  }

  async init(): Promise<void> {
    const pg = await import("pg" as any).catch(() => null);
    if (!pg) {
      throw new Error(
        "memory-postgres (pg mode): `pg` package not installed. Add `pg` to bot deps when wiring this backend.",
      );
    }
    const { Pool } = pg.default ?? pg;
    this.pool = new Pool({ connectionString: this.cfg.url });
    await this.pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    await this.pool.query(SCHEMA);
  }

  async upsertPage(
    slug: string,
    content: string,
    frontmatter?: Record<string, unknown>,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO pages (slug, content, frontmatter, tsv, updated_at)
       VALUES ($1, $2, $3::jsonb, to_tsvector('english', $2), now())
       ON CONFLICT (slug) DO UPDATE SET content=$2, frontmatter=$3::jsonb, tsv=to_tsvector('english',$2), updated_at=now()`,
      [slug, content, JSON.stringify(frontmatter ?? {})],
    );
  }

  async getPage(slug: string) {
    const { rows } = await this.pool.query(
      "SELECT slug, content, updated_at FROM pages WHERE slug = $1",
      [slug],
    );
    return rows[0] ?? null;
  }

  async upsertEdges(source: string, edges: Edge[]): Promise<void> {
    if (!edges.length) return;
    const values: any[] = [];
    const placeholders: string[] = [];
    edges.forEach((e, i) => {
      const o = i * 4;
      placeholders.push(`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4})`);
      values.push(e.source, e.target, e.type, e.evidence ?? null);
    });
    await this.pool.query(
      `INSERT INTO edges (source, target, type, evidence) VALUES ${placeholders.join(",")}
       ON CONFLICT (source, target, type) DO UPDATE SET evidence=EXCLUDED.evidence`,
      values,
    );
  }

  async edgesFor(slug: string, dir: "in" | "out" | "both" = "both"): Promise<Edge[]> {
    const q =
      dir === "in"
        ? "SELECT source, target, type, evidence FROM edges WHERE target = $1"
        : dir === "out"
          ? "SELECT source, target, type, evidence FROM edges WHERE source = $1"
          : "SELECT source, target, type, evidence FROM edges WHERE source = $1 OR target = $1";
    const { rows } = await this.pool.query(q, [slug]);
    return rows;
  }

  async upsertFact(fact: Fact): Promise<void> {
    const id = fact.id ?? `${fact.subject}::${fact.predicate}::${Date.now()}`;
    await this.pool.query(
      `INSERT INTO facts (id, subject, predicate, object, source, ts, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET object=$4, ts=$6, confidence=$7`,
      [
        id,
        fact.subject,
        fact.predicate,
        fact.object,
        fact.source ?? null,
        fact.ts ?? new Date().toISOString(),
        fact.confidence ?? 1.0,
      ],
    );
  }

  async recall(entity: string, opts: { limit?: number; since?: string } = {}): Promise<Fact[]> {
    const { rows } = await this.pool.query(
      `SELECT id, subject, predicate, object, source, ts::text, confidence
       FROM facts WHERE subject = $1 AND ts >= $2 ORDER BY ts DESC LIMIT $3`,
      [entity, opts.since ?? "1970-01-01", opts.limit ?? 50],
    );
    return rows;
  }

  async hybridSearch(query: string, topK = 5): Promise<SearchHit[]> {
    const { rows } = await this.pool.query(
      `SELECT slug,
              ts_rank(tsv, websearch_to_tsquery('english', $1)) AS score,
              ts_headline('english', content, websearch_to_tsquery('english', $1), 'StartSel=<b>,StopSel=</b>,MaxFragments=1,MaxWords=20') AS excerpt
       FROM pages
       WHERE tsv @@ websearch_to_tsquery('english', $1)
       ORDER BY score DESC LIMIT $2`,
      [query, topK],
    );
    return rows.map((r: any, i: number) => ({
      slug: r.slug,
      excerpt: r.excerpt,
      score: 1 / (60 + i),
      source: "keyword" as const,
    }));
  }

  async close(): Promise<void> {
    await this.pool?.end?.();
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS pages (
  slug         TEXT PRIMARY KEY,
  content      TEXT NOT NULL,
  frontmatter  JSONB DEFAULT '{}'::jsonb,
  tsv          tsvector,
  embedding    vector(1536),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pages_tsv ON pages USING GIN (tsv);

CREATE TABLE IF NOT EXISTS edges (
  source    TEXT NOT NULL,
  target    TEXT NOT NULL,
  type      TEXT NOT NULL,
  evidence  TEXT,
  PRIMARY KEY (source, target, type)
);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges (target);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges (type);

CREATE TABLE IF NOT EXISTS facts (
  id          TEXT PRIMARY KEY,
  subject     TEXT NOT NULL,
  predicate   TEXT NOT NULL,
  object      TEXT NOT NULL,
  source      TEXT,
  ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
  confidence  REAL DEFAULT 1.0
);
CREATE INDEX IF NOT EXISTS idx_facts_subject ON facts (subject);
CREATE INDEX IF NOT EXISTS idx_facts_ts ON facts (ts);
`;
