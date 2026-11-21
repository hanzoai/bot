import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clearJwksCache, validateIamToken } from "./auth-iam.js";

// A stand-in for hanzo.id: OIDC discovery plus the JWKS it publishes, served on a
// loopback port so validateIamToken runs its real path (SDK discovery, JWKS fetch,
// jose verification) with nothing mocked.
//
// The gateway's IAM client is "hanzo-bot", but a person reaches it with whatever
// hanzo.id sign-in they hold: cloud relays the caller's own token to /v1/bots, and
// the hanzo CLI signs in as "hanzo-cli". Those tokens must pass the gate (#780);
// what the gate still holds is WHO signed them and that they are current.

const GATEWAY_CLIENT = "hanzo-bot";
const KID = "hanzo-id-test";

let server: Server;
let issuer: string;
let signingKey: CryptoKey;
let strangerKey: CryptoKey;

beforeAll(async () => {
  const published = await generateKeyPair("RS256", { extractable: true });
  signingKey = published.privateKey;
  strangerKey = (await generateKeyPair("RS256")).privateKey;
  const jwk: JWK = {
    ...(await exportJWK(published.publicKey)),
    kid: KID,
    alg: "RS256",
    use: "sig",
  };

  server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/.well-known/openid-configuration") {
      res.end(JSON.stringify({ issuer, jwks_uri: `${issuer}/.well-known/jwks` }));
      return;
    }
    if (req.url === "/.well-known/jwks" || req.url === "/internal/jwks") {
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  clearJwksCache();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function config() {
  return { serverUrl: issuer, clientId: GATEWAY_CLIENT };
}

async function tokenFor(
  audience: string,
  opts: { key?: CryptoKey; expiresIn?: string | number; iss?: string } = {},
): Promise<string> {
  return new SignJWT({ owner: "acme", name: "alice", email: "alice@acme.test" })
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setSubject("acme/alice")
    .setIssuer(opts.iss ?? issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? "5m")
    .sign(opts.key ?? signingKey);
}

describe("validateIamToken", () => {
  it("accepts a hanzo.id token issued to the gateway's own client", async () => {
    const result = await validateIamToken(await tokenFor(GATEWAY_CLIENT), config());
    expect(result).toMatchObject({ ok: true, userId: "acme/alice", owner: "acme" });
  });

  it("accepts a hanzo.id token issued to another hanzo client, such as the CLI", async () => {
    const result = await validateIamToken(await tokenFor("hanzo-cli"), config());
    expect(result).toMatchObject({ ok: true, userId: "acme/alice", owner: "acme" });
  });

  it("accepts the CLI's token with an in-cluster jwksUrl set, as production runs", async () => {
    const result = await validateIamToken(await tokenFor("hanzo-cli"), {
      ...config(),
      jwksUrl: `${issuer}/internal/jwks`,
    });
    expect(result).toMatchObject({ ok: true, userId: "acme/alice", owner: "acme" });
  });

  it("still refuses a token signed by a key hanzo.id does not publish", async () => {
    const result = await validateIamToken(
      await tokenFor("hanzo-cli", { key: strangerKey }),
      config(),
    );
    expect(result.ok).toBe(false);
  });

  it("still refuses an expired token", async () => {
    const result = await validateIamToken(
      await tokenFor("hanzo-cli", { expiresIn: Math.floor(Date.now() / 1000) - 600 }),
      config(),
    );
    expect(result).toEqual({ ok: false, reason: "iam_token_expired" });
  });

  it("accepts exactly the issuers the config names, and no other string", async () => {
    const both = { ...config(), issuers: ["https://hanzo.ai"] };
    const named = await validateIamToken(
      await tokenFor("hanzo-cli", { iss: "https://hanzo.ai" }),
      both,
    );
    expect(named).toMatchObject({ ok: true, userId: "acme/alice" });

    for (const iss of [
      "https://hanzo.ai/acme",
      "https://hanzo.ai/",
      "https://hanzo.ai.evil.test",
      "http://hanzo.ai",
      "https://iam.hanzo.ai",
    ]) {
      const refused = await validateIamToken(await tokenFor("hanzo-cli", { iss }), both);
      expect(refused.ok, iss).toBe(false);
    }
  });

  it("refuses a second platform issuer the config does not name", async () => {
    const result = await validateIamToken(
      await tokenFor("hanzo-cli", { iss: "https://hanzo.ai" }),
      config(),
    );
    expect(result.ok).toBe(false);
  });

  it("a named issuer still needs a key hanzo.id publishes", async () => {
    const result = await validateIamToken(
      await tokenFor("hanzo-cli", { iss: "https://hanzo.ai", key: strangerKey }),
      { ...config(), issuers: ["https://hanzo.ai"] },
    );
    expect(result.ok).toBe(false);
  });
});
