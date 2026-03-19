import type { Hanzo BotConfig } from "../config/config.js";
import {
  normalizeSecretInputString,
  resolveSecretInputRef,
  type SecretRef,
} from "../config/types.secrets.js";
import { resolveSecretRefString } from "./resolve.js";

type SecretDefaults = NonNullable<Hanzo BotConfig["secrets"]>["defaults"];

export async function resolveSecretInputString(params: {
  config: Hanzo BotConfig;
  value: unknown;
  env: NodeJS.ProcessEnv;
  defaults?: SecretDefaults;
  normalize?: (value: unknown) => string | undefined;
  onResolveRefError?: (error: unknown, ref: SecretRef) => never;
}): Promise<string | undefined> {
  const normalize = params.normalize ?? normalizeSecretInputString;
  const { ref } = resolveSecretInputRef({
    value: params.value,
    defaults: params.defaults ?? params.config.secrets?.defaults,
  });
  if (!ref) {
    return normalize(params.value);
  }

  let resolved: string;
  try {
    resolved = await resolveSecretRefString(ref, {
      config: params.config,
      env: params.env,
    });
  } catch (error) {
    if (params.onResolveRefError) {
      return params.onResolveRefError(error, ref);
    }
    throw error;
  }
  return normalize(resolved);
}
