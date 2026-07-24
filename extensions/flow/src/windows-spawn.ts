import {
  applyWindowsSpawnProgramPolicy,
  materializeWindowsSpawnProgram,
  resolveWindowsSpawnProgramCandidate,
} from "bot/plugin-sdk";

type SpawnTarget = {
  command: string;
  argv: string[];
  windowsHide?: boolean;
};

export function resolveWindowsRunbookSpawn(
  execPath: string,
  argv: string[],
  env: NodeJS.ProcessEnv,
): SpawnTarget {
  const candidate = resolveWindowsSpawnProgramCandidate({
    command: execPath,
    env,
    packageName: "runbook",
  });
  const program = applyWindowsSpawnProgramPolicy({
    candidate,
    allowShellFallback: false,
  });
  const resolved = materializeWindowsSpawnProgram(program, argv);
  if (resolved.shell) {
    throw new Error("runbook wrapper resolved to shell fallback unexpectedly");
  }
  return {
    command: resolved.command,
    argv: resolved.argv,
    windowsHide: resolved.windowsHide,
  };
}
