/**
 * Web Bot Auth for the pages the gateway's agents read (hanzo-inc/cloud#423).
 *
 * Every page a Hanzo agent reads carries an HTTP Message Signature (RFC 9421)
 * made with Hanzo's Ed25519 key, so a site can tell a Hanzo agent from anything
 * that copies its User-Agent. The key stays in cloud's KMS: cloud signs for this
 * gateway at POST /v1/crawl/sign, which admits only the gateway's own IAM
 * application (hanzo-bot, a client_credentials token minted with the
 * IAM_CLIENT_SECRET the pod already holds) and answers the three headers for one
 * host. Only the host crosses: never the path, query
 * or body of what the agent reads.
 *
 * A signature binds one host, so the guarded fetch asks once per hop
 * (`signHop`). Anything that goes wrong leaves the request unsigned, exactly as
 * it was before: a signature is an identity assertion, never a reason to drop a
 * fetch. A cloud that refuses or does not serve the op is not asked again for a
 * while, so an unsigned deployment costs one round trip per pause, not per page.
 */

import type { GatewayIamConfig } from "../../config/types.gateway.js";
import type { HopSigner } from "../../infra/net/fetch-guard.js";
import { logWarn } from "../../logger.js";

const DEFAULT_CLOUD = "http://cloud.hanzo.svc:8000";
const SIGN_PATH = "/v1/crawl/sign";
const TOKEN_PATH = "/v1/iam/oauth/token";
const TIMEOUT_MS = 3_000;
const TOKEN_TIMEOUT_MS = 10_000;
/** A held token is replaced this long before it expires. */
const REFRESH_BEFORE_MS = 60_000;
/** How long a refusal (401/403/404/501) stops asking: the deployment is not set up. */
const REFUSED_PAUSE_MS = 10 * 60_000;
/** How long any other failure stops asking: cloud is busy or unreachable. */
const FAILED_PAUSE_MS = 30_000;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type SignedHeaders = {
  signatureAgent?: unknown;
  signatureInput?: unknown;
  signature?: unknown;
};

type Token = { value: string; expiresAt: number };

/** RFC 6749 §2.3.1: each half of client_secret_basic is form-urlencoded before base64. */
function formEncode(value: string): string {
  return new URLSearchParams({ v: value }).toString().slice(2);
}

/**
 * The gateway's IAM application access token (client_credentials, client_secret_basic)
 * from the IAM server it already trusts, held until a minute before it expires.
 * Concurrent callers share one mint; a failed mint is not kept.
 */
function appTokenSource(
  serverUrl: string,
  id: string,
  secret: string,
  fetcher: FetchLike,
): () => Promise<string> {
  const url = `${serverUrl.replace(/\/+$/, "")}${TOKEN_PATH}`;
  const basic = Buffer.from(`${formEncode(id)}:${formEncode(secret)}`).toString("base64");
  let held: Token | null = null;
  let minting: Promise<Token> | null = null;

  const mint = async (): Promise<Token> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);
    try {
      const res = await fetcher(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          Authorization: `Basic ${basic}`,
        },
        body: "grant_type=client_credentials",
        signal: controller.signal,
      });
      if (!res.ok) {
        void res.body?.cancel();
        throw new Error(`IAM token endpoint answered ${res.status}`);
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
      return { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    } finally {
      clearTimeout(timer);
    }
  };

  return async () => {
    if (held && Date.now() < held.expiresAt - REFRESH_BEFORE_MS) {
      return held.value;
    }
    if (!minting) {
      minting = mint().finally(() => {
        minting = null;
      });
    }
    held = await minting;
    return held.value;
  };
}

/** The cloud base URL, without a trailing slash. */
function cloudBase(): string {
  return (process.env.CLOUD_API_URL?.trim() || DEFAULT_CLOUD).replace(/\/+$/, "");
}

/**
 * The signer for this gateway, or undefined when it cannot sign: Web Bot Auth is
 * switched off (HANZO_WEB_BOT_AUTH=off), or the gateway has no IAM application
 * credential to ask cloud with.
 */
export function webBotAuthSigner(
  iam: GatewayIamConfig | undefined,
  opts: { fetchImpl?: FetchLike; base?: string; token?: () => Promise<string> } = {},
): HopSigner | undefined {
  if (process.env.HANZO_WEB_BOT_AUTH?.trim().toLowerCase() === "off") {
    return undefined;
  }
  // Asked at call time: the signer is shared for the life of the process.
  const fetcher: FetchLike = (input, init) => (opts.fetchImpl ?? globalThis.fetch)(input, init);
  let token = opts.token;
  if (!token) {
    const id = process.env.IAM_CLIENT_ID?.trim() || iam?.clientId?.trim();
    const secret = process.env.IAM_CLIENT_SECRET?.trim() || iam?.clientSecret?.trim();
    if (!iam?.serverUrl || !id || !secret) {
      return undefined;
    }
    token = appTokenSource(iam.serverUrl, id, secret, fetcher);
  }
  const bearer = token;
  const url = `${(opts.base ?? cloudBase()).replace(/\/+$/, "")}${SIGN_PATH}`;
  let pausedUntil = 0;

  return async (target: URL): Promise<Record<string, string> | null> => {
    if (Date.now() < pausedUntil) {
      return null;
    }
    const scheme = target.protocol.replace(/:$/, "");
    if ((scheme !== "https" && scheme !== "http") || !target.host) {
      return null;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetcher(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${await bearer()}`,
        },
        // URL.host is the authority: lowercase, with the scheme's default port dropped.
        body: JSON.stringify({ authority: target.host, scheme }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const refused = [401, 403, 404, 501].includes(res.status);
        pausedUntil = Date.now() + (refused ? REFUSED_PAUSE_MS : FAILED_PAUSE_MS);
        if (refused) {
          logWarn(
            `web-bot-auth: cloud answered ${res.status} at ${SIGN_PATH}; pages are read unsigned for ${REFUSED_PAUSE_MS / 60_000} minutes`,
          );
        }
        void res.body?.cancel();
        return null;
      }
      const data = (await res.json().catch(() => null)) as SignedHeaders | null;
      const agent = data?.signatureAgent;
      const input = data?.signatureInput;
      const signature = data?.signature;
      if (typeof agent !== "string" || typeof input !== "string" || typeof signature !== "string") {
        pausedUntil = Date.now() + FAILED_PAUSE_MS;
        return null;
      }
      return { "Signature-Agent": agent, "Signature-Input": input, Signature: signature };
    } catch {
      // No token, a timeout or an unreachable cloud: read unsigned, ask again soon.
      pausedUntil = Date.now() + FAILED_PAUSE_MS;
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
}

const shared = new Map<string, HopSigner | undefined>();

/**
 * The process's signer for this IAM configuration: one per process, so the
 * token and the pause after a refusal are kept across every web_fetch tool the
 * gateway builds.
 */
export function sharedWebBotAuthSigner(iam: GatewayIamConfig | undefined): HopSigner | undefined {
  const key = [
    process.env.HANZO_WEB_BOT_AUTH ?? "",
    iam?.serverUrl ?? "",
    process.env.IAM_CLIENT_ID?.trim() || iam?.clientId || "",
    process.env.IAM_CLIENT_SECRET?.trim() || iam?.clientSecret || "",
    cloudBase(),
  ].join("\n");
  if (!shared.has(key)) {
    shared.set(key, webBotAuthSigner(iam));
  }
  return shared.get(key);
}
