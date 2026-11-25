import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  clearJwksCache,
  deriveIamOperatorScopes,
  isIamSuperAdmin,
  resolveIamBoundedScopes,
  validateIamToken,
} from "./auth-iam.js";

// validateIamToken against a JWKS this test serves and tokens shaped the way
// hanzoai/iam mints them: `owner` is the org of the APP signed in through, the
// person's tenancy is `orgs` (home first), and a client_credentials token carries
// type "application" and no membership.

let server: Server;
let issuer = "";
let key: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  key = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(req.url === "/v1/iam/.well-known/jwks" ? { keys: [jwk] } : {}));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  clearJwksCache();
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const config = () => ({ serverUrl: `${issuer}/`, clientId: "hanzo-bot", orgName: "hanzo" });

function sign(
  claims: Record<string, unknown>,
  opts: { iss?: string; aud?: string; exp?: string | number } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(opts.iss ?? issuer)
    .setAudience(opts.aud ?? "hanzo-bot")
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "5m")
    .sign(key);
}

describe("validateIamToken", () => {
  it("a person acts in their home org and may name any org of their membership", async () => {
    const r = await validateIamToken(
      await sign({
        sub: "0b5e-uuid",
        owner: "hanzo",
        orgs: [{ org: "acme", role: "owner" }, { org: "globex" }],
      }),
      config(),
    );
    expect(r).toMatchObject({
      ok: true,
      userId: "0b5e-uuid",
      owner: "acme",
      orgIds: ["acme", "globex"],
    });
  });

  it("a person whose token states no membership acts in no org — never the app's, never orgName", async () => {
    const r = await validateIamToken(await sign({ sub: "u-1", owner: "hanzo" }), config());
    expect(r.ok).toBe(true);
    expect(r.ok && r.owner).toBeUndefined();
    expect(r.ok && r.orgIds).toEqual([]);
  });

  it("an application token acts in its own org", async () => {
    const r = await validateIamToken(
      await sign({ owner: "acme", name: "acme-ci", type: "application" }),
      config(),
    );
    expect(r).toMatchObject({ ok: true, userId: "acme/acme-ci", owner: "acme", orgIds: ["acme"] });
  });

  it("the org of the app a person signed in through is not theirs, even when it is admin", async () => {
    const r = await validateIamToken(
      await sign({ sub: "u-2", owner: "admin", orgs: [{ org: "acme" }] }),
      config(),
    );
    expect(r.ok && r.owner).toBe("acme");
    expect(r.ok && r.orgIds).not.toContain("admin");
  });

  it("the issuer is pinned: another brand's token on the same keys is refused", async () => {
    const r = await validateIamToken(
      await sign({ sub: "u-3", orgs: [{ org: "acme" }] }, { iss: "https://lux.id" }),
      config(),
    );
    expect(r).toEqual({ ok: false, reason: "iam_signature_invalid" });
  });

  it("the platform's issuers, when the config names both, pass; an organization's issuer never does", async () => {
    const both = {
      ...config(),
      serverUrl: "https://hanzo.id",
      issuers: ["https://hanzo.ai"],
      jwksUrl: `${issuer}/v1/iam/.well-known/jwks`,
    };
    for (const iss of ["https://hanzo.id", "https://hanzo.ai"]) {
      const r = await validateIamToken(
        await sign({ sub: "u-5", orgs: [{ org: "acme" }] }, { iss }),
        both,
      );
      expect(r.ok && r.owner).toBe("acme");
    }
    for (const iss of [
      "https://hanzo.ai/acme",
      "https://hanzo.ai/",
      "https://hanzo.ai.evil.test",
      "http://hanzo.ai",
    ]) {
      const r = await validateIamToken(
        await sign({ sub: "u-5", orgs: [{ org: "acme" }] }, { iss }),
        both,
      );
      expect(r).toEqual({ ok: false, reason: "iam_signature_invalid" });
    }
    const one = { ...both, issuers: undefined };
    expect(
      await validateIamToken(
        await sign({ sub: "u-6", orgs: [{ org: "acme" }] }, { iss: "https://hanzo.ai" }),
        one,
      ),
    ).toEqual({ ok: false, reason: "iam_signature_invalid" });
  });

  it("the audience is the minting app's and not a gate — a token cloud relays still validates", async () => {
    const r = await validateIamToken(
      await sign({ sub: "u-4", orgs: [{ org: "acme" }] }, { aud: "hanzo-console" }),
      config(),
    );
    expect(r.ok && r.owner).toBe("acme");
  });

  it("an expired token, a foreign signature and a non-token are refused", async () => {
    expect(
      await validateIamToken(await sign({ sub: "u", orgs: [{ org: "a" }] }, { exp: 1 }), config()),
    ).toEqual({ ok: false, reason: "iam_token_expired" });
    const other = await generateKeyPair("RS256");
    const forged = await new SignJWT({ sub: "u", orgs: [{ org: "a" }] })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(issuer)
      .setExpirationTime("5m")
      .sign(other.privateKey);
    expect((await validateIamToken(forged, config())).ok).toBe(false);
    expect((await validateIamToken("not-a-jwt", config())).ok).toBe(false);
  });

  it("enforces audienceAllowList when explicitly configured", async () => {
    const restricted = { ...config(), audienceAllowList: ["hanzo-bot", "hanzo-bot-client"] };
    const allowed = await validateIamToken(
      await sign({ sub: "u-aud-ok", orgs: [{ org: "acme" }] }, { aud: "hanzo-bot-client" }),
      restricted,
    );
    expect(allowed).toMatchObject({ ok: true, userId: "u-aud-ok", owner: "acme" });

    const denied = await validateIamToken(
      await sign({ sub: "u-aud-bad", orgs: [{ org: "acme" }] }, { aud: "other-app" }),
      restricted,
    );
    expect(denied).toEqual({ ok: false, reason: "iam_signature_invalid" });
  });

  it("rejects non-application tokens without sub even when owner and name are present", async () => {
    const r = await validateIamToken(
      await sign({ owner: "acme", name: "alice", orgs: [{ org: "acme" }] }),
      config(),
    );
    expect(r).toEqual({ ok: false, reason: "iam_subject_missing" });
  });

  it("derives operator scopes from verified IAM claims only (org admin is never SuperAdmin)", () => {
    // Non-SuperAdmin with org admin role cannot escalate to operator.admin
    expect(isIamSuperAdmin({ owner: "acme" })).toBe(false);
    expect(
      resolveIamBoundedScopes({
        requestedScopes: ["operator.admin", "operator.read", "operator.write"],
        iam: { owner: "acme", roles: ["admin", "owner"] },
      }),
    ).toEqual(["operator.read", "operator.write"]);

    // Non-SuperAdmin requesting only operator.admin gets empty scopes
    expect(
      resolveIamBoundedScopes({
        requestedScopes: ["operator.admin"],
        iam: { owner: "acme", roles: [] },
      }),
    ).toEqual([]);

    // Non-SuperAdmin with signed pairing role receives operator.pairing
    expect(deriveIamOperatorScopes({ owner: "acme", roles: ["operator.pairing"] })).toContain(
      "operator.pairing",
    );
    expect(
      resolveIamBoundedScopes({
        requestedScopes: ["operator.pairing", "operator.admin"],
        iam: { owner: "acme", roles: ["operator.pairing"] },
      }),
    ).toEqual(["operator.pairing"]);

    // Canonical SuperAdmin (verified home org === "admin") receives operator.admin
    expect(isIamSuperAdmin({ owner: "admin" })).toBe(true);
    expect(
      resolveIamBoundedScopes({
        requestedScopes: ["operator.admin"],
        iam: { owner: "admin", roles: [] },
      }),
    ).toEqual(["operator.admin"]);
  });
});
