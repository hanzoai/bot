// Msteams plugin module implements runtime behavior.
import os from "node:os";
import path from "node:path";
import type { OpenKeyedStoreOptions } from "bot/plugin-sdk/plugin-state-runtime";
import {
  createPluginStateKeyedStoreForTests,
  createPluginStateSyncKeyedStoreForTests,
} from "bot/plugin-sdk/plugin-state-test-runtime";
import type { PluginRuntime } from "../../runtime-api.js";

export const msteamsRuntimeStub = {
  state: {
    openKeyedStore: (options: OpenKeyedStoreOptions) =>
      createPluginStateKeyedStoreForTests("msteams", options),
    openSyncKeyedStore: (options: OpenKeyedStoreOptions) =>
      createPluginStateSyncKeyedStoreForTests("msteams", options),
    resolveStateDir: (env: NodeJS.ProcessEnv = process.env, homedir?: () => string) => {
      const override = env.BOT_STATE_DIR?.trim() || env.BOT_STATE_DIR?.trim();
      if (override) {
        return override;
      }
      const resolvedHome = homedir ? homedir() : os.homedir();
      return path.join(resolvedHome, ".bot");
    },
  },
} as unknown as PluginRuntime;
