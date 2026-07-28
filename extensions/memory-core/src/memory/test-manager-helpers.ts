import { createLazyRuntimeModule } from "bot/plugin-sdk/lazy-runtime";
// Memory Core helper module supports test manager helpers behavior.
import type { BotConfig } from "bot/plugin-sdk/memory-core-host-engine-foundation";
import type { MemoryIndexManager } from "./index.js";

const ensureEmbeddingMocksLoaded = createLazyRuntimeModule(() =>
  import("./embedding.test-mocks.js").then(() => undefined),
);

const loadGetMemorySearchManager = createLazyRuntimeModule(() =>
  import("./index.js").then((mod) => mod.getMemorySearchManager),
);

export async function getRequiredMemoryIndexManager(params: {
  cfg: BotConfig;
  agentId?: string;
  purpose?: "default" | "status" | "cli";
}): Promise<MemoryIndexManager> {
  await ensureEmbeddingMocksLoaded();
  const getMemorySearchManager = await loadGetMemorySearchManager();
  const result = await getMemorySearchManager({
    cfg: params.cfg,
    agentId: params.agentId ?? "main",
    purpose: params.purpose,
  });
  if (!result.manager) {
    throw new Error("manager missing");
  }
  if (!("sync" in result.manager) || typeof result.manager.sync !== "function") {
    throw new Error("manager does not support sync");
  }
  return result.manager as unknown as MemoryIndexManager;
}
