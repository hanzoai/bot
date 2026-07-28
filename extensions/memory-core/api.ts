// Memory Core API module exposes the plugin public contract.
export type { BotConfig } from "bot/plugin-sdk/config-contracts";
export type {
  MemoryEmbeddingProbeResult,
  MemoryProviderStatus,
  MemorySyncProgressUpdate,
} from "bot/plugin-sdk/memory-core-host-engine-storage";
export {
  dedupeDreamDiaryEntries,
  removeBackfillDiaryEntries,
  writeBackfillDiaryEntries,
} from "./src/dreaming-narrative.js";
export { previewGroundedRemMarkdown } from "./src/rem-evidence.js";
export { filterRecallEntriesWithinLookback } from "./src/dreaming-phases.js";
export { previewRemHarness } from "./src/rem-harness.js";
export type { PreviewRemHarnessOptions, PreviewRemHarnessResult } from "./src/rem-harness.js";
export { configureMemoryCoreDreamingState } from "./src/dreaming-state.js";
