// Bundled-discovery compatibility is machine-owned upgrade state.
import { readConfigMachineState } from "../state/config-machine-state.js";
import type { BotStateDatabaseOptions } from "../state/bot-state-db.js";

export function readBundledDiscoveryMode(
  options: BotStateDatabaseOptions = {},
): "compat" | "allowlist" | undefined {
  const value = readConfigMachineState<unknown>("plugins.bundledDiscovery", options);
  return value === "compat" || value === "allowlist" ? value : undefined;
}
