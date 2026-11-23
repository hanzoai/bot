import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Unified local `hanzod` daemon origin (superseding legacy `:18789` and `:36900`). */
export const DEFAULT_HANZOD_ORIGIN = "http://127.0.0.1:3690";

/** Hosted Hanzo Cloud API origin. */
export const DEFAULT_HANZO_CLOUD_ORIGIN = "https://api.hanzo.ai";

export interface GatewayStatus {
  connected: boolean;
  url: string;
  version?: string;
  sole_desktop_backend?: boolean;
  tasks_linked?: boolean;
  cluster_state?: string;
  error?: string;
}

export interface HanzodBinaryDeps {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  execPath?: string;
  resourcesPath?: string;
  homeDir?: string;
  exists?: (candidate: string) => boolean;
}

export interface HanzodRuntimeDeps extends HanzodBinaryDeps {
  fetchImpl?: typeof fetch;
  spawnDaemon?: (binPath: string, origin: string) => void;
  execDevFallback?: (workspacePath: string, prompt: string) => { ok: boolean; output: string };
  sleep?: (ms: number) => Promise<void>;
  startupAttempts?: number;
}

export type { HanzodBotTarget, HanzodChatMessage } from "./hanzod-bot-client.js";
export { HanzodBotClient } from "./hanzod-bot-client.js";

function isLoopbackUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    return (
      u.hostname === "127.0.0.1" ||
      u.hostname === "localhost" ||
      u.hostname === "::1" ||
      u.hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

export function resolveHanzodOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.HANZOD_URL?.trim();
  if (!raw) {
    return DEFAULT_HANZOD_ORIGIN;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
  } catch {
    // Fall back to canonical loopback hanzod origin.
  }
  return DEFAULT_HANZOD_ORIGIN;
}

export function candidateHanzodPaths(deps: HanzodBinaryDeps = {}): string[] {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  const home = deps.homeDir ?? os.homedir();
  const joiner = platform === "win32" ? path.win32 : path.posix;
  const binName = platform === "win32" ? "hanzod.exe" : "hanzod";
  const out: string[] = [];

  const explicit = env.HANZOD_BIN?.trim();
  if (explicit) {
    out.push(explicit);
  }

  if (deps.resourcesPath) {
    out.push(joiner.join(deps.resourcesPath, "binaries", binName));
    out.push(joiner.join(deps.resourcesPath, binName));
  }

  const exe = deps.execPath ?? process.execPath;
  if (exe) {
    const execDir = joiner.dirname(exe);
    out.push(joiner.join(execDir, "binaries", binName));
    out.push(joiner.join(execDir, binName));
    const parent = joiner.dirname(execDir);
    out.push(joiner.join(parent, "Resources", binName));
    out.push(joiner.join(parent, "Resources", "binaries", binName));
  }

  if (home) {
    out.push(joiner.join(home, ".hanzo", "bin", binName));
    out.push(joiner.join(home, ".local", "bin", binName));
  }

  if (platform !== "win32") {
    out.push(`/usr/local/bin/${binName}`);
    out.push(`/opt/homebrew/bin/${binName}`);
  }

  const sep = platform === "win32" ? ";" : ":";
  for (const entry of (env.PATH ?? "").split(sep)) {
    const trimmed = entry.trim();
    if (trimmed) {
      out.push(joiner.join(trimmed, binName));
    }
  }

  return [...new Set(out)];
}

export function discoverHanzodBinary(deps: HanzodBinaryDeps = {}): string | null {
  const exists = deps.exists ?? existsSync;
  for (const candidate of candidateHanzodPaths(deps)) {
    if (exists(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function resolveSharedHanzoToken(
  deps: { env?: NodeJS.ProcessEnv; homeDir?: string; readText?: (p: string) => string | null } = {},
): string | null {
  const env = deps.env ?? process.env;
  for (const key of ["HANZO_API_KEY", "HANZO_TOKEN"] as const) {
    const val = env[key]?.trim();
    if (val) {
      return val;
    }
  }

  const home = deps.homeDir ?? os.homedir();
  const readText =
    deps.readText ??
    ((filePath: string) => {
      try {
        return readFileSync(filePath, "utf8");
      } catch {
        return null;
      }
    });

  const dirs = [
    ...(env.HANZO_DATA_DIR?.trim() ? [env.HANZO_DATA_DIR.trim()] : []),
    ...(home
      ? [
          path.join(home, ".hanzo"),
          path.join(home, ".local", "share", "hanzo"),
          path.join(home, "Library", "Application Support", "hanzo"),
        ]
      : []),
  ];

  for (const dir of dirs) {
    for (const file of ["credentials.json", "auth.json", "token.json"]) {
      const raw = readText(path.join(dir, file));
      if (!raw) {
        continue;
      }
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        for (const field of ["access_token", "token", "api_key", "apiKey"]) {
          const val = parsed[field];
          if (typeof val === "string" && val.trim()) {
            return val.trim();
          }
        }
      } catch {
        // Ignore malformed local JSON files.
      }
    }
    const bare = readText(path.join(dir, "token"))?.trim();
    if (bare) {
      return bare;
    }
  }

  return null;
}

async function probeEndpointJson(
  url: string,
  fetchImpl: typeof fetch,
  token?: string | null,
): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetchImpl(url, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) {
      return { ok: false, data: null };
    }
    const json = (await res.json().catch(() => ({}))) as unknown;
    return {
      ok: true,
      data: typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {},
    };
  } catch {
    return { ok: false, data: null };
  }
}

export async function ensureHanzodRunning(deps: HanzodRuntimeDeps = {}): Promise<boolean> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const origin = resolveHanzodOrigin(deps.env);
  const token = resolveSharedHanzoToken({ env: deps.env, homeDir: deps.homeDir });

  if ((await probeEndpointJson(`${origin}/v1/hanzod`, fetchImpl, token)).ok) {
    return true;
  }

  const bin = discoverHanzodBinary(deps);
  if (!bin) {
    return false;
  }

  const spawnDaemon =
    deps.spawnDaemon ??
    ((binPath: string, targetOrigin: string) => {
      const parsed = new URL(targetOrigin);
      const child = spawn(binPath, [], {
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
          ...(targetOrigin !== DEFAULT_HANZOD_ORIGIN ? { HANZOD_HTTP_ADDR: parsed.host } : {}),
        },
      });
      child.unref();
    });

  spawnDaemon(bin, origin);

  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const attempts = deps.startupAttempts ?? 25;
  for (let i = 0; i < attempts; i++) {
    await sleep(80);
    if ((await probeEndpointJson(`${origin}/v1/hanzod`, fetchImpl, token)).ok) {
      return true;
    }
  }
  return false;
}

/**
 * Checks unified `hanzod` gateway health (defaulting to `http://127.0.0.1:3690`,
 * never legacy `:18789`), auto-starting `hanzod` when targeting loopback `3690`
 * and probing `/v1/bot/health` -> `/v1/hanzod` -> `/v1/dev/health`.
 */
export async function botCheckGateway(
  url?: string,
  deps: HanzodRuntimeDeps = {},
): Promise<GatewayStatus> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const targetUrl = (url?.trim() || resolveHanzodOrigin(deps.env)).replace(/\/+$/, "");
  const token = resolveSharedHanzoToken({ env: deps.env, homeDir: deps.homeDir });

  if (isLoopbackUrl(targetUrl) && targetUrl.endsWith(":3690")) {
    await ensureHanzodRunning(deps);
  }

  const [botProbe, manifestProbe, devProbe, workerProbe, clusterProbe] = await Promise.all([
    probeEndpointJson(`${targetUrl}/v1/bot/health`, fetchImpl, token),
    probeEndpointJson(`${targetUrl}/v1/hanzod`, fetchImpl, token),
    probeEndpointJson(`${targetUrl}/v1/dev/health`, fetchImpl, token),
    probeEndpointJson(`${targetUrl}/v1/hanzod/worker`, fetchImpl, token),
    probeEndpointJson(`${targetUrl}/v1/cluster/health`, fetchImpl, token),
  ]);

  if (!botProbe.ok && !manifestProbe.ok && !devProbe.ok) {
    return {
      connected: false,
      url: targetUrl,
      error: `hanzod is not reachable at ${targetUrl}`,
    };
  }

  const manifest = manifestProbe.data ?? {};
  const botHealth = botProbe.data ?? {};
  const devHealth = devProbe.data ?? {};
  const worker = workerProbe.data ?? {};
  const cluster = clusterProbe.data ?? {};

  const version =
    (typeof manifest.version === "string" && manifest.version) ||
    (typeof botHealth.version === "string" && botHealth.version) ||
    (typeof devHealth.version === "string" && devHealth.version) ||
    undefined;

  const tasksWorker =
    typeof manifest.tasks_worker === "object" && manifest.tasks_worker !== null
      ? (manifest.tasks_worker as Record<string, unknown>)
      : worker;
  const tasksLinked =
    typeof tasksWorker.linked === "boolean"
      ? tasksWorker.linked
      : typeof manifest.tasks_linked === "boolean"
        ? manifest.tasks_linked
        : undefined;

  const clusterState =
    (typeof cluster.state === "string" && cluster.state) ||
    (typeof cluster.status === "string" && cluster.status) ||
    (typeof manifest.cluster_state === "string" && manifest.cluster_state) ||
    undefined;

  return {
    connected: true,
    url: targetUrl,
    version,
    sole_desktop_backend:
      typeof manifest.sole_desktop_backend === "boolean"
        ? manifest.sole_desktop_backend
        : undefined,
    tasks_linked: tasksLinked,
    cluster_state: clusterState,
  };
}

async function hanzodJsonRequest(
  method: "GET" | "POST" | "PUT",
  routePath: string,
  body?: Record<string, unknown>,
  deps: HanzodRuntimeDeps = {},
): Promise<Record<string, unknown>> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  await ensureHanzodRunning(deps);
  const origin = resolveHanzodOrigin(deps.env);
  const token = resolveSharedHanzoToken({ env: deps.env, homeDir: deps.homeDir });

  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined || method === "POST" || method === "PUT") {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetchImpl(`${origin}${routePath}`, {
    method,
    headers,
    body:
      body !== undefined
        ? JSON.stringify(body)
        : method === "POST" || method === "PUT"
          ? "{}"
          : undefined,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `hanzod ${method} ${routePath} failed (${res.status})${detail ? `: ${detail.slice(0, 256)}` : ""}`,
    );
  }

  const parsed = (await res.json().catch(() => ({ ok: true }))) as unknown;
  return typeof parsed === "object" && parsed !== null
    ? (parsed as Record<string, unknown>)
    : { ok: true, value: parsed };
}

export async function hanzodStatus(deps: HanzodRuntimeDeps = {}): Promise<Record<string, unknown>> {
  return hanzodJsonRequest("GET", "/v1/hanzod", undefined, deps);
}

export async function hanzodWorkerStatus(
  deps: HanzodRuntimeDeps = {},
): Promise<Record<string, unknown>> {
  return hanzodJsonRequest("GET", "/v1/hanzod/worker", undefined, deps);
}

export async function hanzodClusterUp(
  mode?: string,
  deps: HanzodRuntimeDeps = {},
): Promise<Record<string, unknown>> {
  const payload = mode?.trim() ? { mode: mode.trim() } : {};
  return hanzodJsonRequest("POST", "/v1/cluster/up", payload, deps);
}

export async function hanzodClusterDown(
  deps: HanzodRuntimeDeps = {},
): Promise<Record<string, unknown>> {
  return hanzodJsonRequest("POST", "/v1/cluster/down", {}, deps);
}

/**
 * Routes a local workspace Dev prompt through unified `hanzod` first
 * (`/v1/bot/bots/dev/run` -> `/v1/dev/sessions` -> `/v1/research/runs`),
 * falling back to legacy `dev exec` CLI only when `allowLegacyExec === true`.
 */
export async function localWorkspaceRunDev(params: {
  workspacePath: string;
  prompt: string;
  allowLegacyExec?: boolean;
  deps?: HanzodRuntimeDeps;
}): Promise<Record<string, unknown>> {
  const deps = params.deps ?? {};
  const fetchImpl = deps.fetchImpl ?? fetch;
  await ensureHanzodRunning(deps);
  const origin = resolveHanzodOrigin(deps.env);
  const token = resolveSharedHanzoToken({ env: deps.env, homeDir: deps.homeDir });

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const routes: Array<{ path: string; body: Record<string, unknown> }> = [
    {
      path: "/v1/bot/bots/dev/run",
      body: { workspace_path: params.workspacePath, prompt: params.prompt },
    },
    {
      path: "/v1/dev/sessions",
      body: { workspace_path: params.workspacePath, prompt: params.prompt },
    },
    {
      path: "/v1/research/runs",
      body: { workspace_path: params.workspacePath, prompt: params.prompt },
    },
  ];

  let lastError = "hanzod dev endpoints unavailable";
  for (const route of routes) {
    try {
      const res = await fetchImpl(`${origin}${route.path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(route.body),
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) {
        const json = (await res.json().catch(() => ({ ok: true }))) as unknown;
        return typeof json === "object" && json !== null
          ? { backend: "hanzod", route: route.path, ...(json as Record<string, unknown>) }
          : {
              backend: "hanzod",
              route: route.path,
              ok: true,
              output: typeof json === "string" ? json : JSON.stringify(json),
            };
      }
      lastError = `HTTP ${res.status} on ${route.path}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  if (params.allowLegacyExec) {
    const execFallback =
      deps.execDevFallback ??
      ((cwd: string, prompt: string) => {
        const proc = spawnSync("dev", ["exec", prompt], {
          cwd,
          encoding: "utf8",
          timeout: 120_000,
        });
        return {
          ok: proc.status === 0,
          output: (proc.stdout || proc.stderr || "").trim(),
        };
      });
    const fallback = execFallback(params.workspacePath, params.prompt);
    if (fallback.ok) {
      return { backend: "dev-exec-fallback", ok: true, output: fallback.output };
    }
    throw new Error(
      `hanzod failed (${lastError}) and dev exec fallback failed: ${fallback.output}`,
    );
  }

  throw new Error(`Failed running workspace task via hanzod (${origin}): ${lastError}`);
}
