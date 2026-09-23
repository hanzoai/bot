/**
 * How the gateway reaches cloud's commerce API as itself.
 *
 * The base is COMMERCE_API_URL, default the in-cluster cloud service. The
 * credential is the gateway's own IAM application: a client_credentials token
 * (client_secret_basic) minted at the IAM server the gateway already trusts
 * (`gateway.auth.iam.serverUrl`), cached, and replaced 60s before it expires.
 *
 * The client id is `gateway.auth.iam.clientId` and the secret
 * `gateway.auth.iam.clientSecret`; IAM_CLIENT_ID and IAM_CLIENT_SECRET override
 * them, so the secret never has to sit in a committed config file.
 */

import type { GatewayIamConfig } from "../../config/config.js";

const DEFAULT_BASE = "http://cloud.hanzo.svc:8000";
const TOKEN_PATH = "/v1/iam/oauth/token";
const REFRESH_BEFORE_MS = 60_000;
const TIMEOUT_MS = 10_000;

/** The commerce API base URL, without a trailing slash. */
export function commerceBase(): string {
  return (process.env.COMMERCE_API_URL?.trim() || DEFAULT_BASE).replace(/\/+$/, "");
}

type Token = { key: string; value: string; expiresAt: number };

let held: Token | null = null;
let minting: { key: string; token: Promise<Token> } | null = null;

/**
 * The gateway's IAM application access token. Concurrent callers share one
 * mint; a failed mint is not cached, so the next call tries again.
 */
export async function appToken(cfg: GatewayIamConfig): Promise<string> {
  const id = process.env.IAM_CLIENT_ID?.trim() || cfg.clientId;
  const secret = process.env.IAM_CLIENT_SECRET?.trim() || cfg.clientSecret?.trim();
  if (!id || !secret) {
    throw new Error(
      "gateway IAM application credential missing: set IAM_CLIENT_SECRET (client id from IAM_CLIENT_ID or gateway.auth.iam.clientId)",
    );
  }
  const url = `${cfg.serverUrl.replace(/\/+$/, "")}${TOKEN_PATH}`;
  const key = `${url} ${id}`;
  if (held?.key === key && Date.now() < held.expiresAt - REFRESH_BEFORE_MS) {
    return held.value;
  }
  let pending = minting?.key === key ? minting.token : null;
  if (!pending) {
    const token = mint(url, id, secret, key).finally(() => {
      if (minting?.token === token) {
        minting = null;
      }
    });
    minting = { key, token };
    pending = token;
  }
  held = await pending;
  return held.value;
}

/** RFC 6749 §2.3.1: each half of client_secret_basic is form-urlencoded before base64. */
function formEncode(value: string): string {
  return new URLSearchParams({ v: value }).toString().slice(2);
}

async function mint(url: string, id: string, secret: string, key: string): Promise<Token> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${formEncode(id)}:${formEncode(secret)}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`IAM token endpoint answered ${res.status}: ${text.substring(0, 200)}`);
    }
    const data = (await res.json().catch(() => null)) as {
      access_token?: unknown;
      expires_in?: unknown;
    } | null;
    if (typeof data?.access_token !== "string" || data.access_token === "") {
      throw new Error("IAM token response carries no access_token");
    }
    if (typeof data.expires_in !== "number" || !(data.expires_in > 0)) {
      throw new Error("IAM token response carries no expires_in");
    }
    return { key, value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  } finally {
    clearTimeout(timer);
  }
}
