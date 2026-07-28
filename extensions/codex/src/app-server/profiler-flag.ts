/**
 * Resolves whether Codex app-server profiling instrumentation is enabled by
 * Bot diagnostic flags.
 */
import type { BotConfig } from "bot/plugin-sdk/config-contracts";
import { isDiagnosticFlagEnabled } from "bot/plugin-sdk/diagnostic-runtime";

const PROFILER_FLAGS = ["profiler", "codex.profiler"] as const;

/** Checks the generic and Codex-specific profiler diagnostic flags. */
export function isCodexAppServerProfilerEnabled(
  config?: BotConfig,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return PROFILER_FLAGS.some((flag) => isDiagnosticFlagEnabled(flag, config, env));
}
