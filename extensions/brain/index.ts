/**
 * @hanzo/bot-brain — meta-pack
 *
 * Bundles the three brain pieces into a single drop-in plugin:
 *   • memory-postgres  (Postgres OR SQLite single-binary backend)
 *   • graph-links      (zero-LLM typed-link extractor)
 *   • recipes-brain    (canonical ingest recipes: email, calendar, …)
 *
 * Wires them so a page write → edge extraction → fact recall → hybrid
 * search all flow through one store. Result: gbrain-equivalent on top
 * of Hanzo Bot, single config object.
 */

import registerGraph from "@hanzo/bot-graph-links";
import registerMemory, {
  type MemoryPostgresApi,
  type MemoryConfig,
} from "@hanzo/bot-memory-postgres";

export interface BrainConfig {
  memory?: MemoryConfig; // url, embedding, dataDir
  graph?: { enabled?: boolean };
  recipes?: string[]; // names to enable (email, calendar, …)
}

export default async function register(
  api: any,
  cfg: BrainConfig = {},
): Promise<{
  memory: MemoryPostgresApi;
}> {
  const memory = await registerMemory(api, cfg.memory ?? {});
  if (cfg.graph?.enabled !== false) {
    registerGraph(api);
  }
  return { memory };
}
