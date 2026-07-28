// Normalizes agent binding config for channels, routes, and ACP sessions.
import type { AgentAcpBinding, AgentBinding, AgentRouteBinding } from "./types.agents.js";
import type { BotConfig } from "./types.bot.js";

function normalizeBindingType(binding: AgentBinding): "route" | "acp" {
  // Missing `type` is the legacy/default route binding shape.
  return binding.type === "acp" ? "acp" : "route";
}

/** Narrows a configured binding to the channel route form. */
export function isRouteBinding(binding: AgentBinding): binding is AgentRouteBinding {
  return normalizeBindingType(binding) === "route";
}

function isAcpBinding(binding: AgentBinding): binding is AgentAcpBinding {
  return normalizeBindingType(binding) === "acp";
}

/** Returns the configured binding list, treating missing/non-array config as empty. */
export function listConfiguredBindings(cfg: BotConfig): AgentBinding[] {
  return Array.isArray(cfg.bindings) ? cfg.bindings : [];
}

/** Lists channel route bindings, including legacy bindings without an explicit type. */
export function listRouteBindings(cfg: BotConfig): AgentRouteBinding[] {
  return listConfiguredBindings(cfg).filter(isRouteBinding);
}

/** Lists ACP conversation bindings only. */
export function listAcpBindings(cfg: BotConfig): AgentAcpBinding[] {
  return listConfiguredBindings(cfg).filter(isAcpBinding);
}
