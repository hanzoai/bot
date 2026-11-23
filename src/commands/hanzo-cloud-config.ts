import path from "node:path";

/** Hanzo API proxy endpoint — accepts IAM tokens, proxies to model providers. */
export const HANZO_API_BASE_URL = "https://api.hanzo.ai";

/** Unified local `hanzod` daemon origin (`127.0.0.1:3690`). */
export const HANZOD_LOCAL_ORIGIN = "http://127.0.0.1:3690";

/** The auth profile holding the IAM token that the first-run Anthropic route sends to the proxy. */
export const HANZO_IAM_ANTHROPIC_PROFILE = "anthropic:hanzo-iam";

/**
 * The config Run Locally writes on a machine with no bot.json: a loopback
 * gateway, Anthropic through the Hanzo API proxy (the IAM token is accepted
 * there, not at Anthropic), and a workspace of its own. `migrate openclaw`
 * recognizes these values and lets OpenClaw's settings replace them.
 */
export function hanzoCloudConfig(home: string) {
  return {
    gateway: {
      mode: "local" as const,
      bind: "loopback" as const,
    },
    models: {
      providers: {
        anthropic: {
          baseUrl: HANZO_API_BASE_URL,
          models: [] as unknown[],
        },
      },
    },
    agents: {
      defaults: {
        workspace: path.join(home, ".hanzo", "bot", "workspace"),
      },
    },
  };
}

/**
 * Local `hanzod`-backed config (`http://127.0.0.1:3690/v1/engine` + `/v1/bot/*`)
 * so `@hanzo/bot` runs offline or against a `hanzod`-orchestrated local `k3s` Cloud.
 */
export function hanzodLocalConfig(home: string, origin = HANZOD_LOCAL_ORIGIN) {
  const normalized = origin.replace(/\/+$/, "");
  return {
    gateway: {
      mode: "local" as const,
      bind: "loopback" as const,
    },
    models: {
      providers: {
        hanzo: {
          baseUrl: `${normalized}/v1/engine`,
          models: [] as unknown[],
        },
      },
    },
    agents: {
      defaults: {
        workspace: path.join(home, ".hanzo", "bot", "workspace"),
      },
    },
  };
}
