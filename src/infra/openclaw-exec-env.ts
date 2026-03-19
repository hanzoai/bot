export const BOT_CLI_ENV_VAR = "BOT_CLI";
export const BOT_CLI_ENV_VALUE = "1";

export function markHanzoBotExecEnv<T extends Record<string, string | undefined>>(env: T): T {
  return {
    ...env,
    [BOT_CLI_ENV_VAR]: BOT_CLI_ENV_VALUE,
  };
}

export function ensureHanzoBotExecMarkerOnProcess(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  env[BOT_CLI_ENV_VAR] = BOT_CLI_ENV_VALUE;
  return env;
}
