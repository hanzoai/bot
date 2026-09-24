import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authorizeGatewayConnect } from "./auth.js";
import { callerOrg } from "./bots-http.js";
import type { NodeSession } from "./node-registry.js";
import { mayWatch } from "./vnc-tickets.js";

// A hanzo.id token as hanzoai/iam mints it (internal/oidc/jwt.go claims(),
// token.go subjectOf): `sub` is the opaque user id (u.Id, a UUID), `owner` is the
// org of the APPLICATION the user logged in through, and the user's own org is the
// first entry of the signed membership set `orgs` (mirrored in `groups`) — cloud's
// idClaims.homeOrg(). The org every tenant boundary on this branch keys on
// (callerOrg, nodeOwner, mayWatch) is the GatewayAuthResult.owner derived from it.

let server: Server;
let issuer = "";
let sign: (
  claims: Record<string, unknown>,
  opts?: { iss?: string; aud?: string },
) => Promise<string>;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/.well-known/openid-configuration") {
      res.end(JSON.stringify({ issuer, jwks_uri: `${issuer}/v1/iam/.well-known/jwks` }));
      return;
    }
    if (req.url === "/v1/iam/.well-known/jwks") {
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  sign = (claims, opts = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(opts.iss ?? issuer)
      .setAudience(opts.aud ?? "hanzo-bot")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

// The live bot-gateway config (universe charts/app/values/hanzo/bot-gateway.yaml).
const auth = () =>
  ({
    mode: "iam",
    iam: { serverUrl: issuer, clientId: "hanzo-bot", orgName: "hanzo", appName: "hanzo-bot" },
  }) as never;

async function login(home: string, sub: string, appOrg = "hanzo") {
  const token = await sign({
    sub,
    owner: appOrg,
    organization: appOrg,
    name: "u",
    orgs: [{ org: home, role: "member" }],
    groups: [home],
  });
  const r = await authorizeGatewayConnect({ auth: auth(), connectAuth: { token }, req: undefined });
  expect(r.ok).toBe(true);
  return r;
}

describe("red: the org a hanzo.id login acts in", () => {
  it("is the user's home org (orgs[0]), not orgName or the app's owner", async () => {
    const acme = await login("acme", "5b0f7a52-0f1c-4d7e-9b7b-acme00000001");
    const evil = await login("evil", "9c1e2d33-7a4b-4c8d-8e9f-evil00000002");
    // Both collapse to config.orgName ("hanzo") because @hanzo/iam validateToken
    // derives owner from sub.split("/")[0] and a UUID sub has no "/".
    expect(acme.owner).toBe("acme");
    expect(evil.owner).toBe("evil");
  });

  it("does not let one org list or stop another org's runs", async () => {
    const acme = await login("acme", "5b0f7a52-0f1c-4d7e-9b7b-acme00000001");
    const evil = await login("evil", "9c1e2d33-7a4b-4c8d-8e9f-evil00000002");
    expect(callerOrg(evil, null)).not.toBe(callerOrg(acme, null));
  });

  it("does not let one org open another org's node screen", async () => {
    const acme = await login("acme", "5b0f7a52-0f1c-4d7e-9b7b-acme00000001");
    const evil = await login("evil", "9c1e2d33-7a4b-4c8d-8e9f-evil00000002");
    const id = (r: typeof acme) =>
      ({ identity: { orgId: r.orgId!, owner: r.owner, bearer: "b", method: "iam" } }) as never;
    const acmeNode = { nodeId: "n1", client: id(acme) } as unknown as NodeSession;
    const decision = mayWatch({
      client: id(evil),
      nodeId: "n1",
      registry: { get: (n: string) => (n === "n1" ? acmeNode : undefined) },
      multiTenant: true,
    });
    expect(decision.ok).toBe(false);
  });
});

describe("red: SuperAdmin is the user's home org, never the app's", () => {
  it("does not open the gateway's own screen to an acme user of an admin-org app", async () => {
    const r = await login("acme", "5b0f7a52-0f1c-4d7e-9b7b-acme00000001", "admin");
    const client = {
      identity: { orgId: r.orgId!, owner: r.owner, bearer: "b", method: "iam" },
    } as never;
    const d = mayWatch({
      client,
      nodeId: null,
      registry: { get: () => undefined },
      multiTenant: true,
    });
    expect(d.ok).toBe(false);
  });
});

describe("red: a token minted for another IAM app", () => {
  // Same IAM signing keys, another brand's issuer (hanzoai/iam issues per-host:
  // internal/oidc/issuer.go) and another application's audience.
  it("is refused by the hanzo-bot gateway", async () => {
    const token = await sign(
      { sub: "5b0f7a52-0f1c-4d7e-9b7b-acme00000001", owner: "hanzo", orgs: [{ org: "acme" }] },
      { iss: "https://lux.id", aud: "some-other-app" },
    );
    const r = await authorizeGatewayConnect({
      auth: auth(),
      connectAuth: { token },
      req: undefined,
    });
    expect(r.ok).toBe(false);
  });
});
