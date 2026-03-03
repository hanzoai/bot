import { isLoopbackHost, normalizeHostHeader } from "./net.js";

type OriginCheckResult =
  | {
      ok: true;
      matchedBy: "allowlist" | "host-header-fallback" | "local-loopback";
    }
  | { ok: false; reason: string };

/**
 * Runtime-added origins (e.g. from tunnel startup).
 * These supplement the config-based allowedOrigins without modifying the config file.
 */
const runtimeAllowedOrigins = new Set<string>();

export function addRuntimeAllowedOrigin(origin: string): void {
  runtimeAllowedOrigins.add(origin.trim().toLowerCase());
}

export function removeRuntimeAllowedOrigin(origin: string): void {
  runtimeAllowedOrigins.delete(origin.trim().toLowerCase());
}

export function clearRuntimeAllowedOrigins(): void {
  runtimeAllowedOrigins.clear();
}

function parseOrigin(
  originRaw?: string,
): { origin: string; host: string; hostname: string } | null {
  const trimmed = (originRaw ?? "").trim();
  if (!trimmed || trimmed === "null") {
    return null;
  }
  try {
    const url = new URL(trimmed);
    return {
      origin: url.origin.toLowerCase(),
      host: url.host.toLowerCase(),
      hostname: url.hostname.toLowerCase(),
    };
  } catch {
    return null;
  }
}

export function checkBrowserOrigin(params: {
  requestHost?: string;
  origin?: string;
  allowedOrigins?: string[];
  allowHostHeaderOriginFallback?: boolean;
  isLocalClient?: boolean;
}): OriginCheckResult {
  const parsedOrigin = parseOrigin(params.origin);
  if (!parsedOrigin) {
    return { ok: false, reason: "origin missing or invalid" };
  }

  const allowlist = new Set(
    (params.allowedOrigins ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean),
  );
  if (allowlist.has("*") || allowlist.has(parsedOrigin.origin)) {
    return { ok: true, matchedBy: "allowlist" };
  }

  // Check runtime-added origins (e.g. from tunnel or cloud playground)
  if (runtimeAllowedOrigins.has(parsedOrigin.origin)) {
    return { ok: true };
  }

  const requestHost = normalizeHostHeader(params.requestHost);
  // Same-origin check: accept when the origin host matches the request Host header.
  // Gated behind allowHostHeaderOriginFallback to avoid trusting spoofable Host headers
  // in environments that haven't opted in. Covers tailscale serve (.ts.net) etc.
  if (params.allowHostHeaderOriginFallback && requestHost && parsedOrigin.host === requestHost) {
    return { ok: true };
  }

  // Dev fallback only for genuinely local socket clients, not Host-header claims.
  if (params.isLocalClient && isLoopbackHost(parsedOrigin.hostname)) {
    return { ok: true, matchedBy: "local-loopback" };
  }

  return { ok: false, reason: "origin not allowed" };
}
