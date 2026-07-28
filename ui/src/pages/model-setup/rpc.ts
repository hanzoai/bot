import type { GatewayBrowserClient } from "../../api/gateway.ts";
import type {
  SystemAgentSetupDetectResult,
  SystemAgentSetupVerifyResult,
} from "../../api/types.ts";
import { MODEL_SETUP_DETECT_TIMEOUT_MS, MODEL_SETUP_VERIFY_TIMEOUT_MS } from "./state.ts";

export function detectModelSetup(
  client: GatewayBrowserClient,
  signal?: AbortSignal,
): Promise<SystemAgentSetupDetectResult> {
  return client.request<SystemAgentSetupDetectResult>(
    "bot.setup.detect",
    {},
    { timeoutMs: MODEL_SETUP_DETECT_TIMEOUT_MS, ...(signal ? { signal } : {}) },
  );
}

export function verifyModelSetup(
  client: GatewayBrowserClient,
  signal?: AbortSignal,
): Promise<SystemAgentSetupVerifyResult> {
  return client.request<SystemAgentSetupVerifyResult>(
    "bot.setup.verify",
    {},
    { timeoutMs: MODEL_SETUP_VERIFY_TIMEOUT_MS, ...(signal ? { signal } : {}) },
  );
}
