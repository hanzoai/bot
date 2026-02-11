type StateDirEnvSnapshot = {
  hanzoBotStateDir: string | undefined;
  legacyStateDir: string | undefined;
};

export function snapshotStateDirEnv(): StateDirEnvSnapshot {
  return {
    hanzoBotStateDir: process.env.BOT_STATE_DIR,
    legacyStateDir: process.env.BOT_STATE_DIR,
  };
}

export function restoreStateDirEnv(snapshot: StateDirEnvSnapshot): void {
  if (snapshot.hanzoBotStateDir === undefined) {
    delete process.env.BOT_STATE_DIR;
  } else {
    process.env.BOT_STATE_DIR = snapshot.hanzoBotStateDir;
  }
  if (snapshot.legacyStateDir === undefined) {
    delete process.env.BOT_STATE_DIR;
  } else {
    process.env.BOT_STATE_DIR = snapshot.legacyStateDir;
  }
}

export function setStateDirEnv(stateDir: string): void {
  process.env.BOT_STATE_DIR = stateDir;
  delete process.env.BOT_STATE_DIR;
}
