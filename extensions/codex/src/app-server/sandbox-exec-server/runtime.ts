/**
 * Runtime guards for sandbox exec-server handlers that need backend-specific
 * execution and filesystem bridges.
 */
import type { SandboxContext } from "bot/plugin-sdk/sandbox";
import type { BotExecServer } from "./types.js";

/** Returns the configured sandbox backend or fails the current JSON-RPC request. */
export function requireBackend(
  execServer: BotExecServer,
): NonNullable<SandboxContext["backend"]> {
  const backend = execServer.sandbox.backend;
  if (!backend) {
    throw new Error("Bot sandbox backend is unavailable.");
  }
  return backend;
}

/** Returns the configured filesystem bridge or fails the current JSON-RPC request. */
export function requireFsBridge(
  execServer: BotExecServer,
): NonNullable<SandboxContext["fsBridge"]> {
  const fsBridge = execServer.sandbox.fsBridge;
  if (!fsBridge) {
    throw new Error("Sandbox filesystem bridge is unavailable.");
  }
  return fsBridge;
}
