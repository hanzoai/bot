/**
 * Canonical Hanzo IAM (HIP-0111) OIDC endpoints — the single place any bot
 * OAuth flow reads them from.
 *
 * These are exactly what https://hanzo.id/.well-known/openid-configuration
 * advertises. The bare `/oauth/*` forms were served ONLY by the hanzo.id-worker
 * shim (IAM itself 401s them), so they die with it. IAM also answers any
 * unregistered path with a 200 HTML SPA catch-all, so a wrong path is silent
 * breakage rather than a 404 — hence one constant, never a per-call string.
 */

const IAM_ORIGIN = "https://hanzo.id";

export const IAM_AUTHORIZE_ENDPOINT = `${IAM_ORIGIN}/v1/iam/oauth/authorize`;
export const IAM_TOKEN_ENDPOINT = `${IAM_ORIGIN}/v1/iam/oauth/token`;
