import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clearJwksCache, validateIamToken } from "./auth-iam.js";

// The platform issuer is moving from https://hanzo.id to https://hanzo.ai. The gateway keeps
// verifying against the platform's own key set (jwksUrl, in cluster); a token it did not mint
// under its configured issuer is accepted under the issuer it names when, and only when, a key
// the platform publishes signed it. So a hanzo.ai token passes, and nothing an organization
// publishes does: an organization's cert is in its own key set, which this one never reads.

const KID = "platform-test";

let server: Server;
let base: string;
let published: CryptoKey;
let tenant: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  published = pair.privateKey;
  tenant = (await generateKeyPair("RS256")).privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: "RS256", use: "sig" };
  server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/internal/jwks") {
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  clearJwksCache();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const config = () => ({
  serverUrl: "https://hanzo.id",
  clientId: "hanzo-bot",
  jwksUrl: `${base}/internal/jwks`,
});

function tokenFor(issuer: string, key: CryptoKey, kid = KID): Promise<string> {
  return new SignJWT({ owner: "acme", name: "alice" })
    .setProtectedHeader({ alg: "RS256", kid })
    .setSubject("acme/alice")
    .setIssuer(issuer)
    .setAudience("hanzo-bot")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);
}

describe("validateIamToken while the platform issuer moves", () => {
  it.each(["https://hanzo.id", "https://hanzo.ai"])(
    "accepts a platform-signed token under %s",
    async (issuer) => {
      const result = await validateIamToken(await tokenFor(issuer, published), config());
      expect(result).toMatchObject({ ok: true, userId: "acme/alice", owner: "acme" });
    },
  );

  it.each(["https://hanzo.ai", "https://hanzo.ai/acme"])(
    "refuses a token under %s signed by an organization's own key",
    async (issuer) => {
      const result = await validateIamToken(
        await tokenFor(issuer, tenant, "acme-signing"),
        config(),
      );
      expect(result.ok).toBe(false);
    },
  );

  it("refuses a token under an organization's issuer that borrows a platform kid", async () => {
    const result = await validateIamToken(
      await tokenFor("https://hanzo.ai/acme", tenant),
      config(),
    );
    expect(result.ok).toBe(false);
  });
});
