/**
 * Read-through to the cloud agent registry (the ONE registry-of-record).
 *
 * hanzo.team projects the cloud `/v1/agents` registry 1:1 as workspace members;
 * this makes the SAME agents visible in hanzo.bot without a second store. The
 * gateway's `agents.list` merges these rows alongside its local config/disk
 * agents and live runtime nodes.
 *
 * PER-VIEWER, NEVER POD-FIXED. This gateway is a shared, multi-tenant singleton:
 * one process serves IAM viewers from many orgs (hanzo, lux, zoo, customers).
 * cloud `/v1/agents` is per-org-private (HIP-0026) — it scopes the query to the
 * org resolved SERVER-SIDE from the presented bearer's `owner` claim. So we
 * present the VIEWER'S OWN bearer and NO client X-Org-Id: org A's viewer only
 * ever sees org A's agents. There is NO pod-fixed credential fallback — a single
 * shared token would leak its org's agents to every other org's viewer.
 *
 * A viewer without an IAM bearer (shared BOT_GATEWAY_TOKEN nodes, tailscale,
 * trusted-proxy) has no per-viewer org, so the read-through no-ops and the
 * listing stays local-only.
 *
 * PER-ORG CACHE. Rows are cached under the viewer's `orgKey`; an entry fetched
 * with org A's bearer is NEVER served to any other org. This is defense-in-depth
 * on top of the server-side re-scoping above.
 *
 * READ-ONLY + FAIL-SOFT. The gateway never mutates cloud agents. Any failure
 * (network, auth, timeout) degrades to that org's last known rows, else an empty
 * list — `agents.list` must never break because the cloud is unreachable.
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

// Per-org cache. Keyed by the viewer's orgKey so org A's rows can never be
// served to org B. TTL bounds staleness; a failed refresh serves the last
// known rows for THAT org only.
const cacheByOrg = new Map<string, CacheEntry>();

/** Reset the module cache. Test-only seam. */
export function resetCloudAgentsCache(): void {
  cacheByOrg.clear();
}

/** Base URL of the cloud data plane hosting `/v1/agents` (org-neutral). */
function resolveCloudApiUrl(): string {
  const raw = (
    process.env.CLOUD_AGENTS_URL ??
    process.env.CLOUD_API_URL ??
    DEFAULT_CLOUD_API_URL
  ).trim();
  return raw.replace(/\/+$/, "");
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

async function fetchCloudAgentsUncached(base: string, bearer: string): Promise<GatewayAgentRow[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/v1/agents`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${bearer}`,
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

export type FetchCloudAgentRowsParams = {
  /** The viewer's own IAM bearer JWT. cloud resolves the org from its `owner` claim. */
  bearer?: string;
  /** The viewer's resolved org; the per-org cache partition key. */
  orgKey?: string;
  logger?: MinimalLogger;
};

/**
 * Fetch the VIEWER'S org cloud agents as `GatewayAgentRow[]` (tagged
 * `source: "cloud"`), cached briefly per org. Never throws.
 *
 * Returns `[]` (local-only) when there is no per-viewer bearer/org — there is no
 * pod-fixed credential fallback, so a non-IAM viewer never surfaces cloud
 * agents and no other org's agents can leak through this shared gateway.
 */
export async function fetchCloudAgentRows(
  params?: FetchCloudAgentRowsParams,
): Promise<GatewayAgentRow[]> {
  const bearer = params?.bearer?.trim();
  const orgKey = params?.orgKey?.trim();
  if (!bearer || !orgKey) {
    return [];
  }
  const now = Date.now();
  const cached = cacheByOrg.get(orgKey);
  if (cached && cached.expiresAt > now) {
    return cached.rows;
  }
  try {
    const rows = await fetchCloudAgentsUncached(resolveCloudApiUrl(), bearer);
    cacheByOrg.set(orgKey, { rows, expiresAt: now + CACHE_TTL_MS });
    return rows;
  } catch (err) {
    params?.logger?.warn?.(
      `cloud agents read-through failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    // Degrade to THIS org's last known rows (best-effort), else local-only.
    return cached?.rows ?? [];
  }
}
