/**
 * Cloud-node detection — single source of truth.
 *
 * A "cloud node" is a bot that the Playground/visor provisions on a droplet or
 * pod, as opposed to a bot running on a user's local machine. Visor's cloud-init
 * injects `HANZO_PLAYGROUND_CLOUD_NODE=true` into the bot's environment; that
 * flag is what distinguishes the two. Read the decision through this helper —
 * never test the env var inline — so every consumer agrees on one contract.
 */

export const CLOUD_NODE_ENV = "HANZO_PLAYGROUND_CLOUD_NODE";

export function isCloudNode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[CLOUD_NODE_ENV] === "true";
}
