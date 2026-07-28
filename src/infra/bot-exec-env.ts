/** Process env key that marks child commands as launched by the Bot CLI. */
export const BOT_CLI_ENV_VAR = "BOT_CLI";

/** Stable marker value used for Bot-launched subprocess detection. */
const BOT_CLI_ENV_VALUE = "1";

/** Returns a cloned env object with the Bot CLI marker set. */
export function markBotExecEnv<T extends Record<string, string | undefined>>(
  /** Source environment to clone before adding the subprocess marker. */
  env: T,
): T {
  return {
    ...env,
    [BOT_CLI_ENV_VAR]: BOT_CLI_ENV_VALUE,
  };
}

/** Mutates an existing process env object so current-process children inherit the marker. */
export function ensureBotExecMarkerOnProcess(
  /** Process env object to mutate; defaults to the current process environment. */
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  env[BOT_CLI_ENV_VAR] = BOT_CLI_ENV_VALUE;
  return env;
}
