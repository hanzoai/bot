export const BOT_CLI_ENV_VAR = "BOT_CLI";
export const BOT_CLI_ENV_VALUE = "1";

export function markHanzo BotExecEnv<T extends Record<string, string | undefined>>(env: T): T {
  return {
    ...env,
    [BOT_CLI_ENV_VAR]: BOT_CLI_ENV_VALUE,
  };
}

export function ensureHanzo BotExecMarkerOnProcess(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  env[BOT_CLI_ENV_VAR] = BOT_CLI_ENV_VALUE;
  return env;
}
