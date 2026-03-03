import chokidar from "chokidar";
import type { BotConfig, ConfigFileSnapshot, GatewayReloadMode } from "../config/config.js";
import { type ChannelId, listChannelPlugins } from "../channels/plugins/index.js";
import { getActivePluginRegistry } from "../plugins/runtime.js";
import { isPlainObject } from "../utils.js";
import { buildGatewayReloadPlan, type GatewayReloadPlan } from "./config-reload-plan.js";

export { buildGatewayReloadPlan };
export type { GatewayReloadPlan } from "./config-reload-plan.js";

export type GatewayReloadSettings = {
  mode: GatewayReloadMode;
  debounceMs: number;
};

const DEFAULT_RELOAD_SETTINGS: GatewayReloadSettings = {
  mode: "hybrid",
  debounceMs: 300,
};

export function diffConfigPaths(prev: unknown, next: unknown, prefix = ""): string[] {
  if (prev === next) {
    return [];
  }
  if (isPlainObject(prev) && isPlainObject(next)) {
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    const paths: string[] = [];
    for (const key of keys) {
      const prevValue = prev[key];
      const nextValue = next[key];
      if (prevValue === undefined && nextValue === undefined) {
        continue;
      }
      const childPrefix = prefix ? `${prefix}.${key}` : key;
      const childPaths = diffConfigPaths(prevValue, nextValue, childPrefix);
      if (childPaths.length > 0) {
        paths.push(...childPaths);
      }
    }
    return paths;
  }
  if (Array.isArray(prev) && Array.isArray(next)) {
    if (prev.length === next.length && JSON.stringify(prev) === JSON.stringify(next)) {
      return [];
    }
  }
  return [prefix || "<root>"];
}

export function resolveGatewayReloadSettings(cfg: BotConfig): GatewayReloadSettings {
  const rawMode = cfg.gateway?.reload?.mode;
  const mode =
    rawMode === "off" || rawMode === "restart" || rawMode === "hot" || rawMode === "hybrid"
      ? rawMode
      : DEFAULT_RELOAD_SETTINGS.mode;
  const debounceRaw = cfg.gateway?.reload?.debounceMs;
  const debounceMs =
    typeof debounceRaw === "number" && Number.isFinite(debounceRaw)
      ? Math.max(0, Math.floor(debounceRaw))
      : DEFAULT_RELOAD_SETTINGS.debounceMs;
  return { mode, debounceMs };
}

export type GatewayConfigReloader = {
  stop: () => Promise<void>;
};

export function startGatewayConfigReloader(opts: {
  initialConfig: BotConfig;
  readSnapshot: () => Promise<ConfigFileSnapshot>;
  onHotReload: (plan: GatewayReloadPlan, nextConfig: BotConfig) => Promise<void>;
  onRestart: (plan: GatewayReloadPlan, nextConfig: BotConfig) => void;
  log: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
  watchPath: string;
}): GatewayConfigReloader {
  let currentConfig = opts.initialConfig;
  let settings = resolveGatewayReloadSettings(currentConfig);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  let running = false;
  let stopped = false;
  let restartQueued = false;

  const schedule = () => {
    if (stopped) {
      return;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    const wait = settings.debounceMs;
    debounceTimer = setTimeout(() => {
      void runReload();
    }, wait);
  };

  const MISSING_FILE_MAX_RETRIES = 2;
  const MISSING_FILE_RETRY_DELAY_MS = 100;

  const runReload = async () => {
    if (stopped) {
      return;
    }
    if (running) {
      pending = true;
      return;
    }
    running = true;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    try {
      let snapshot = await opts.readSnapshot();

      // Retry logic for missing config files (editor save race, atomic rename).
      if (!snapshot.exists) {
        let retries = 0;
        while (!snapshot.exists && retries < MISSING_FILE_MAX_RETRIES) {
          retries++;
          opts.log.info(
            `config reload retry (${retries}/${MISSING_FILE_MAX_RETRIES}): config file not found`,
          );
          await new Promise<void>((resolve) => setTimeout(resolve, MISSING_FILE_RETRY_DELAY_MS));
          if (stopped) {
            return;
          }
          snapshot = await opts.readSnapshot();
        }
        if (!snapshot.exists) {
          opts.log.warn("config reload skipped (config file not found)");
          return;
        }
      }

      if (!snapshot.valid) {
        const issues = snapshot.issues.map((issue) => `${issue.path}: ${issue.message}`).join(", ");
        opts.log.warn(`config reload skipped (invalid config): ${issues}`);
        return;
      }
      const nextConfig = snapshot.config;
      const changedPaths = diffConfigPaths(currentConfig, nextConfig);
      currentConfig = nextConfig;
      settings = resolveGatewayReloadSettings(nextConfig);
      if (changedPaths.length === 0) {
        return;
      }

      opts.log.info(`config change detected; evaluating reload (${changedPaths.join(", ")})`);
      const plan = buildGatewayReloadPlan(changedPaths);
      if (settings.mode === "off") {
        opts.log.info("config reload disabled (gateway.reload.mode=off)");
        return;
      }
      if (settings.mode === "restart") {
        if (!restartQueued) {
          restartQueued = true;
          try {
            await Promise.resolve(opts.onRestart(plan, nextConfig));
          } catch (err) {
            opts.log.error(`config restart failed: ${String(err)}`);
          }
        }
        return;
      }
      if (plan.restartGateway) {
        if (settings.mode === "hot") {
          opts.log.warn(
            `config reload requires gateway restart; hot mode ignoring (${plan.restartReasons.join(
              ", ",
            )})`,
          );
          return;
        }
        if (!restartQueued) {
          restartQueued = true;
          try {
            await Promise.resolve(opts.onRestart(plan, nextConfig));
          } catch (err) {
            restartQueued = false;
            opts.log.error(`config restart failed: ${String(err)}`);
          }
        }
        return;
      }

      await opts.onHotReload(plan, nextConfig);
    } catch (err) {
      opts.log.error(`config reload failed: ${String(err)}`);
    } finally {
      running = false;
      if (pending) {
        pending = false;
        schedule();
      }
    }
  };

  const watcher = chokidar.watch(opts.watchPath, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    usePolling: Boolean(process.env.VITEST),
  });

  watcher.on("add", schedule);
  watcher.on("change", schedule);
  watcher.on("unlink", schedule);
  let watcherClosed = false;
  watcher.on("error", (err) => {
    if (watcherClosed) {
      return;
    }
    watcherClosed = true;
    opts.log.warn(`config watcher error: ${String(err)}`);
    void watcher.close().catch(() => {});
  });

  return {
    stop: async () => {
      stopped = true;
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = null;
      watcherClosed = true;
      await watcher.close().catch(() => {});
    },
  };
}
