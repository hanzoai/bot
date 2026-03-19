import type { HanzoBotConfig } from "./config.js";

export function ensurePluginAllowlisted(cfg: HanzoBotConfig, pluginId: string): HanzoBotConfig {
  const allow = cfg.plugins?.allow;
  if (!Array.isArray(allow) || allow.includes(pluginId)) {
    return cfg;
  }
  return {
    ...cfg,
    plugins: {
      ...cfg.plugins,
      allow: [...allow, pluginId],
    },
  };
}
