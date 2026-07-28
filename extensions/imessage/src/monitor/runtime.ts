// Imessage plugin module implements runtime behavior.
import { createNonExitingRuntime, type RuntimeEnv } from "bot/plugin-sdk/runtime-env";
import { normalizeStringEntries } from "bot/plugin-sdk/string-coerce-runtime";
import type { MonitorIMessageOpts } from "./types.js";

export function resolveRuntime(opts: MonitorIMessageOpts): RuntimeEnv {
  return opts.runtime ?? createNonExitingRuntime();
}

export function normalizeAllowList(list?: Array<string | number>) {
  return normalizeStringEntries(list);
}
