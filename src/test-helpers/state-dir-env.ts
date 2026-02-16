import { captureEnv } from "../test-utils/env.js";

export function snapshotStateDirEnv() {
  return captureEnv(["BOT_STATE_DIR"]);
}

export function restoreStateDirEnv(snapshot: ReturnType<typeof snapshotStateDirEnv>): void {
  snapshot.restore();
}

export function setStateDirEnv(stateDir: string): void {
  process.env.BOT_STATE_DIR = stateDir;
}
