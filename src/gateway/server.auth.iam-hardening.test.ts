import crypto from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { rawDataToString } from "../infra/ws.js";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../utils/message-channel.js";
import { clearJwksCache } from "./auth-iam.js";
import { PROTOCOL_VERSION } from "./protocol/index.js";
import {
  getFreePort,
  installGatewayTestHooks,
  startGatewayServer,
  testState,
} from "./test-helpers.js";

installGatewayTestHooks({ scope: "suite" });

type WsConnectOutcome = {
  res?: {
    ok?: boolean;
    error?: { code?: string; message?: string };
    payload?: { protocol?: number };
  };
  closeCode?: number;
  closeReason?: string;
};

async function wsConnectAttempt(params: {
  port: number;
  token?: string;
  headers?: Record<string, string>;
  client?: { id: string; version: string; platform: string; mode: string };
  withDeviceIdentity?: boolean;
}): Promise<WsConnectOutcome> {
  return await new Promise<WsConnectOutcome>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${params.port}/`, {
      headers: params.headers,
    });
    const out: WsConnectOutcome = {};
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(out);
      }
    };
    const timer = setTimeout(() => {
      ws.terminate();
      finish();
    }, 8_000);

    const client = params.client ?? {
      id: GATEWAY_CLIENT_NAMES.GATEWAY_CLIENT,
      version: "1.0.0",
      platform: "linux",
      mode: GATEWAY_CLIENT_MODES.BACKEND,
    };

    const sendConnect = (nonce: string) => {
      const scopes = ["operator.read"];
      let device:
        | { id: string; publicKey: string; signature: string; signedAt: number; nonce: string }
        | undefined;
      if (params.withDeviceIdentity) {
        const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
        const pubDer = publicKey.export({ type: "spki", format: "der" });
        const rawPub = pubDer.subarray(pubDer.length - 32);
        const deviceId = crypto.createHash("sha256").update(rawPub).digest("hex");
        const signedAt = Date.now();
        const payload = [
          "v2",
          deviceId,
          client.id,
          client.mode,
          "operator",
          scopes.join(","),
          String(signedAt),
          params.token ?? "",
          nonce,
        ].join("|");
        const signature = crypto
          .sign(null, Buffer.from(payload, "utf8"), privateKey)
          .toString("base64url");
        device = {
          id: deviceId,
          publicKey: rawPub.toString("base64url"),
          signature,
          signedAt,
          nonce,
        };
      }
      ws.send(
        JSON.stringify({
          type: "req",
          id: "connect-1",
          method: "connect",
          params: {
            minProtocol: PROTOCOL_VERSION,
            maxProtocol: PROTOCOL_VERSION,
            client,
            role: "operator",
            scopes,
            ...(params.token !== undefined ? { auth: { token: params.token } } : {}),
            ...(device ? { device } : {}),
          },
        }),
      );
    };

    ws.on("message", (raw) => {
      const msg = JSON.parse(rawDataToString(raw)) as {
        type?: string;
        event?: string;
        ok?: boolean;
        error?: { code?: string; message?: string };
        payload?: { nonce?: string; protocol?: number };
      };
      if (msg.type === "event" && msg.event === "connect.challenge") {
        sendConnect(msg.payload?.nonce ?? "");
        return;
      }
      if (msg.type === "res") {
        out.res = { ok: msg.ok, error: msg.error, payload: msg.payload };
        if (msg.ok) {
          ws.close(1000, "test complete");
        }
      }
    });

    ws.on("close", (code, reason) => {
      out.closeCode = code;
      out.closeReason = reason.toString();
      finish();
    });

    ws.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    });
  });
}

describe("gateway IAM hardening regression", () => {
  let jwksServer: Server;
  let jwksUrl = "";
  let upstreamServer: Server;
  let upstreamUrl = "";
  let validPrivateKey: CryptoKey;
  let forgedPrivateKey: CryptoKey;
  let gatewayPort = 0;
  let closeGateway: (() => Promise<void>) | undefined;
  let prevEnv: Record<string, string | undefined>;

  function signJwt(
    key: CryptoKey,
    claims: Record<string, unknown>,
    opts: { iss: string; exp?: string | number; kid?: string },
  ) {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: opts.kid ?? "k-primary" })
      .setIssuer(opts.iss)
      .setAudience("hanzo-bot")
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "5m")
      .sign(key);
  }

  beforeAll(async () => {
    prevEnv = {
      BOT_GATEWAY_TOKEN: process.env.BOT_GATEWAY_TOKEN,
      LLM_BASE_URL: process.env.LLM_BASE_URL,
      LLM_API_KEY: process.env.LLM_API_KEY,
      OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    };
    delete process.env.BOT_GATEWAY_TOKEN;

    const primaryPair = await generateKeyPair("RS256");
    validPrivateKey = primaryPair.privateKey;
    const primaryJwk = {
      ...(await exportJWK(primaryPair.publicKey)),
      kid: "k-primary",
      alg: "RS256",
      use: "sig",
    };

    const forgedPair = await generateKeyPair("RS256");
    forgedPrivateKey = forgedPair.privateKey;

    jwksServer = createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(req.url === "/v1/iam/.well-known/jwks" ? { keys: [primaryJwk] } : {}));
    });
    await new Promise<void>((resolve) => jwksServer.listen(0, "127.0.0.1", resolve));
    const jwksPort = (jwksServer.address() as AddressInfo).port;
    jwksUrl = `http://127.0.0.1:${jwksPort}/v1/iam/.well-known/jwks`;
    clearJwksCache();

    upstreamServer = createServer((req, res) => {
      if (req.url === "/v1/models" && req.method === "GET") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ object: "list", data: [{ id: "hanzo/zen6", object: "model" }] }));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    });
    await new Promise<void>((resolve) => upstreamServer.listen(0, "127.0.0.1", resolve));
    upstreamUrl = `http://127.0.0.1:${(upstreamServer.address() as AddressInfo).port}`;
    process.env.LLM_BASE_URL = upstreamUrl;
    process.env.LLM_API_KEY = "test-upstream-key";

    testState.gatewayAuth = {
      mode: "iam",
      iam: {
        serverUrl: "https://hanzo.id",
        issuers: ["https://hanzo.ai", "https://hanzo.id"],
        jwksUrl,
        clientId: "hanzo-bot",
        orgName: "hanzo",
        appName: "hanzo-bot",
      },
    };
    testState.gatewayControlUi = {
      enabled: false,
      allowedOrigins: ["https://hanzo.bot"],
      allowInsecureAuth: false,
      dangerouslyDisableDeviceAuth: false,
      basePath: "/__bot__",
    };

    gatewayPort = await getFreePort();
    const server = await startGatewayServer(gatewayPort, {
      controlUiEnabled: false,
      openAiChatCompletionsEnabled: true,
      openResponsesEnabled: true,
    });
    closeGateway = () => server.close({ reason: "iam hardening regression complete" });
  });

  afterAll(async () => {
    await closeGateway?.();
    await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
    await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
    clearJwksCache();
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  });

  it("rejects unauthenticated HTTP requests to /v1/models, /v1/chat/completions, and /v1/responses", async () => {
    const base = `http://127.0.0.1:${gatewayPort}`;
    const modelsRes = await fetch(`${base}/v1/models`);
    expect(modelsRes.status).toBe(401);

    const spoofedRes = await fetch(`${base}/v1/models`, {
      headers: { "X-Forwarded-For": "127.0.0.1", "X-Real-IP": "127.0.0.1" },
    });
    expect(spoofedRes.status).toBe(401);

    const chatRes = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "hanzo/zen6", messages: [{ role: "user", content: "hi" }] }),
    });
    expect(chatRes.status).toBe(401);

    const responsesRes = await fetch(`${base}/v1/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "hanzo/zen6", input: "hi" }),
    });
    expect(responsesRes.status).toBe(401);
  });

  it("rejects forged, expired, and unknown-issuer JWTs on HTTP /v1/models", async () => {
    const base = `http://127.0.0.1:${gatewayPort}`;

    const forgedToken = await signJwt(
      forgedPrivateKey,
      { sub: "attacker", orgs: [{ org: "admin" }] },
      { iss: "https://hanzo.id" },
    );
    expect(
      (await fetch(`${base}/v1/models`, { headers: { Authorization: `Bearer ${forgedToken}` } }))
        .status,
    ).toBe(401);

    const expiredToken = await signJwt(
      validPrivateKey,
      { sub: "user-expired", orgs: [{ org: "hanzo" }] },
      { iss: "https://hanzo.id", exp: Math.floor(Date.now() / 1000) - 120 },
    );
    expect(
      (await fetch(`${base}/v1/models`, { headers: { Authorization: `Bearer ${expiredToken}` } }))
        .status,
    ).toBe(401);

    for (const badIssuer of ["https://lux.id", "https://hanzo.ai/acme", "https://evil.example"]) {
      const wrongIssToken = await signJwt(
        validPrivateKey,
        { sub: "user-wrong-iss", orgs: [{ org: "hanzo" }] },
        { iss: badIssuer },
      );
      expect(
        (
          await fetch(`${base}/v1/models`, {
            headers: { Authorization: `Bearer ${wrongIssToken}` },
          })
        ).status,
      ).toBe(401);
    }
  });

  it("accepts valid JWTs from both https://hanzo.id and https://hanzo.ai on HTTP /v1/models", async () => {
    const base = `http://127.0.0.1:${gatewayPort}`;

    for (const iss of ["https://hanzo.id", "https://hanzo.ai"]) {
      const token = await signJwt(
        validPrivateKey,
        { sub: `user-${iss}`, orgs: [{ org: "hanzo" }] },
        { iss },
      );
      const res = await fetch(`${base}/v1/models`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const json = (await res.json()) as { object?: string; data?: Array<{ id?: string }> };
      expect(json.object).toBe("list");
      expect(json.data?.[0]?.id).toBe("hanzo/zen6");
    }
  });

  it("rejects unauthenticated, forged, expired, and unknown-issuer WS connects with close 1008", async () => {
    const unauthWithDevice = await wsConnectAttempt({
      port: gatewayPort,
      withDeviceIdentity: true,
    });
    expect(unauthWithDevice.res?.ok).toBe(false);
    expect(unauthWithDevice.closeCode).toBe(1008);

    const forgedToken = await signJwt(
      forgedPrivateKey,
      { sub: "attacker", orgs: [{ org: "admin" }] },
      { iss: "https://hanzo.id" },
    );
    const forgedAttempt = await wsConnectAttempt({
      port: gatewayPort,
      token: forgedToken,
    });
    expect(forgedAttempt.res?.ok).toBe(false);
    expect(forgedAttempt.closeCode).toBe(1008);

    const expiredToken = await signJwt(
      validPrivateKey,
      { sub: "user-expired", orgs: [{ org: "hanzo" }] },
      { iss: "https://hanzo.id", exp: Math.floor(Date.now() / 1000) - 120 },
    );
    const expiredAttempt = await wsConnectAttempt({
      port: gatewayPort,
      token: expiredToken,
    });
    expect(expiredAttempt.res?.ok).toBe(false);
    expect(expiredAttempt.closeCode).toBe(1008);

    const unknownIssToken = await signJwt(
      validPrivateKey,
      { sub: "user-unknown-iss", orgs: [{ org: "hanzo" }] },
      { iss: "https://evil.example" },
    );
    const unknownIssAttempt = await wsConnectAttempt({
      port: gatewayPort,
      token: unknownIssToken,
    });
    expect(unknownIssAttempt.res?.ok).toBe(false);
    expect(unknownIssAttempt.closeCode).toBe(1008);
  });

  it("accepts valid https://hanzo.id and https://hanzo.ai JWTs on WS connect", async () => {
    for (const iss of ["https://hanzo.id", "https://hanzo.ai"]) {
      const token = await signJwt(
        validPrivateKey,
        { sub: `ws-user-${iss}`, orgs: [{ org: "hanzo" }] },
        { iss },
      );
      const outcome = await wsConnectAttempt({
        port: gatewayPort,
        token,
      });
      expect(outcome.res?.ok).toBe(true);
      expect(outcome.res?.payload?.protocol).toBe(PROTOCOL_VERSION);
    }
  });

  it("enforces controlUi.enabled=false and allowInsecureAuth=false / dangerouslyDisableDeviceAuth=false", async () => {
    const base = `http://127.0.0.1:${gatewayPort}`;
    const uiRes = await fetch(`${base}/__bot__/`);
    expect(uiRes.status).toBe(404);

    // Control UI client with an allowed origin and no device identity must be rejected
    // when allowInsecureAuth=false and dangerouslyDisableDeviceAuth=false.
    const controlUiAttempt = await wsConnectAttempt({
      port: gatewayPort,
      headers: { Origin: "https://hanzo.bot" },
      client: {
        id: GATEWAY_CLIENT_NAMES.CONTROL_UI,
        version: "1.0.0",
        platform: "web",
        mode: GATEWAY_CLIENT_MODES.WEBCHAT,
      },
      withDeviceIdentity: false,
    });
    expect(controlUiAttempt.res?.ok).toBe(false);
    expect(controlUiAttempt.closeCode).toBe(1008);
  });
});
