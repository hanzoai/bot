/**
 * Read-through to the cloud agent registry (the ONE registry-of-record).
 *
 * hanzo.team projects the cloud `/v1/agents` registry 1:1 as workspace members;
 * this makes the SAME agents visible in hanzo.bot without a second store. The
 * gateway's `agents.list` merges these rows alongside its local config/disk
 * agents and live runtime nodes.
 *
 * TRUST / SCOPE. The org is resolved SERVER-SIDE from the bearer we present:
 * cloud's identity boundary (SanitizeIdentity) validates the IAM JWT and mints
 * X-User-Id + X-Org-Id from its `owner` claim, then `principal.Org` scopes the
 * query to that org. We therefore pass NO client X-Org-Id — a forged one is
 * refused anyway. An opaque hk-/sk- key never validates to a principal, so the
 * call 401/403s and we degrade to local; only a real JWT surfaces cloud agents.
 *
 * READ-ONLY + FAIL-SOFT. The gateway never mutates cloud agents. Any failure
 * (no creds, network, auth, timeout) degrades to the last known rows, else an
 * empty list — `agents.list` must never break because the cloud is unreachable.
 * A short TTL keeps the merged listing fast.
 */

import type { GatewayAgentRow } from "../shared/session-types.js";

const DEFAULT_CLOUD_API_URL = "https://api.cloud.hanzo.ai";
const FETCH_TIMEOUT_MS = 3_000;
const CACHE_TTL_MS = 30_000;

type CloudAgentDto = {
  id?: unknown;
  name?: unknown;
  model?: unknown;
  description?: unknown;
};

type CacheEntry = { rows: GatewayAgentRow[]; expiresAt: number };
let cache: CacheEntry | null = null;

/** Reset the module cache. Test-only seam. */
export function resetCloudAgentsCache(): void {
  cache = null;
}

/** Base URL of the cloud data plane hosting `/v1/agents`. */
function resolveCloudApiUrl(): string {
  const raw = (
    process.env.CLOUD_AGENTS_URL ??
    process.env.CLOUD_API_URL ??
    DEFAULT_CLOUD_API_URL
  ).trim();
  return raw.replace(/\/+$/, "");
}

/**
 * Bearer the gateway presents to cloud. Prefers an explicit registry token,
 * else the IAM JWT the node already holds (`HANZO_API_KEY`, set by the node
 * host's OAuth flow). Returns undefined when the node has no cloud credential —
 * the read-through then no-ops and the listing stays local-only.
 */
function resolveCloudToken(): string | undefined {
  for (const candidate of [process.env.CLOUD_AGENTS_TOKEN, process.env.HANZO_API_KEY]) {
    const token = candidate?.trim();
    if (token) {
      return token;
    }
  }
  return undefined;
}

function normalizeCloudAgents(agents: CloudAgentDto[]): GatewayAgentRow[] {
  const rows: GatewayAgentRow[] = [];
  for (const agent of agents) {
    const id = typeof agent.id === "string" ? agent.id.trim() : "";
    if (!id) {
      continue;
    }
    const name = typeof agent.name === "string" && agent.name.trim() ? agent.name.trim() : id;
    rows.push({ id, name, source: "cloud", identity: { name } });
  }
  return rows;
}

async function fetchCloudAgentsUncached(base: string, token: string): Promise<GatewayAgentRow[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/v1/agents`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`cloud /v1/agents responded ${res.status}`);
    }
    const body = (await res.json()) as { agents?: CloudAgentDto[] } | null;
    return normalizeCloudAgents(Array.isArray(body?.agents) ? body.agents : []);
  } finally {
    clearTimeout(timer);
  }
}

type MinimalLogger = { warn?: (message: string, meta?: Record<string, unknown>) => void };

/**
 * Fetch the org's cloud agents as `GatewayAgentRow[]` (tagged `source: "cloud"`),
 * cached briefly. Never throws: returns the last known rows on failure, or an
 * empty list when there is no credential or nothing cached.
 */
export async function fetchCloudAgentRows(logger?: MinimalLogger): Promise<GatewayAgentRow[]> {
  const token = resolveCloudToken();
  if (!token) {
    return [];
  }
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.rows;
  }
  try {
    const rows = await fetchCloudAgentsUncached(resolveCloudApiUrl(), token);
    cache = { rows, expiresAt: now + CACHE_TTL_MS };
    return rows;
  } catch (err) {
    logger?.warn?.(
      `cloud agents read-through failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    // Degrade to the last known rows (best-effort visibility), else local-only.
    return cache?.rows ?? [];
  }
}
