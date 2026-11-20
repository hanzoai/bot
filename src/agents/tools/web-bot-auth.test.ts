import { afterEach, describe, expect, it, vi } from "vitest";
import { webBotAuthSigner } from "./web-bot-auth.js";

const iam = { serverUrl: "https://iam.hanzo.test/", clientId: "hanzo-bot", clientSecret: "s3cret" };

const signed = {
  signatureAgent: '"https://api.hanzo.test/.well-known/http-message-signatures-directory"',
  signatureInput: 'sig1=("@authority" "signature-agent");tag="web-bot-auth"',
  signature: "sig1=:c2ln:",
  expires: 1_900_000_000,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** A stand-in for IAM's token endpoint and cloud's sign op, recording every call. */
function cloud(
  sign: (body: { authority: string; scheme: string }) => Response = () => json(signed),
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    if (url.endsWith("/v1/iam/oauth/token")) {
      return json({ access_token: "app-token", expires_in: 3600 });
    }
    return sign(JSON.parse(String(init?.body)));
  });
  return { fetchImpl, calls };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("webBotAuthSigner", () => {
  it("asks cloud for the hop's host only, as the gateway's own IAM application", async () => {
    vi.stubEnv("IAM_CLIENT_ID", "");
    vi.stubEnv("IAM_CLIENT_SECRET", "");
    const { fetchImpl, calls } = cloud();
    const sign = webBotAuthSigner(iam, { fetchImpl, base: "http://cloud.test:8000/" });
    expect(sign).toBeDefined();

    const headers = await sign!(new URL("https://Example.com:443/private/path?q=secret#f"));
    expect(headers).toEqual({
      "Signature-Agent": signed.signatureAgent,
      "Signature-Input": signed.signatureInput,
      Signature: signed.signature,
    });

    const [token, ask] = calls;
    expect(token.url).toBe("https://iam.hanzo.test/v1/iam/oauth/token");
    expect(token.init.body).toBe("grant_type=client_credentials");
    expect(new Headers(token.init.headers).get("authorization")).toBe(
      `Basic ${Buffer.from("hanzo-bot:s3cret").toString("base64")}`,
    );
    expect(ask.url).toBe("http://cloud.test:8000/v1/crawl/sign");
    expect(new Headers(ask.init.headers).get("authorization")).toBe("Bearer app-token");
    // The default port is dropped, and nothing of the page but its host is sent.
    expect(JSON.parse(String(ask.init.body))).toEqual({
      authority: "example.com",
      scheme: "https",
    });
    expect(String(ask.init.body)).not.toContain("secret");

    // A second page reuses the token and asks again: one signature per request.
    await sign!(new URL("http://example.org:8080/"));
    expect(calls.map((c) => c.url)).toEqual([
      "https://iam.hanzo.test/v1/iam/oauth/token",
      "http://cloud.test:8000/v1/crawl/sign",
      "http://cloud.test:8000/v1/crawl/sign",
    ]);
    expect(JSON.parse(String(calls[2].init.body))).toEqual({
      authority: "example.org:8080",
      scheme: "http",
    });
  });

  it("reads unsigned and stops asking for a while when cloud refuses or lacks the op", async () => {
    for (const status of [401, 403, 404, 501]) {
      const { fetchImpl, calls } = cloud(() => json({ error: "no" }, status));
      const sign = webBotAuthSigner(iam, { fetchImpl, base: "http://cloud.test" });
      expect(await sign!(new URL("https://example.com/"))).toBeNull();
      expect(await sign!(new URL("https://example.com/other"))).toBeNull();
      expect(calls.filter((c) => c.url.endsWith("/v1/crawl/sign"))).toHaveLength(1);
    }
  });

  it("reads unsigned when the answer is not three header values, or nothing answers", async () => {
    const bad = cloud(() => json({ signature: "sig1=:x:" }));
    expect(
      await webBotAuthSigner(iam, { fetchImpl: bad.fetchImpl })!(new URL("https://a.test/")),
    ).toBeNull();

    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(
      await webBotAuthSigner(iam, { fetchImpl: down })!(new URL("https://a.test/")),
    ).toBeNull();

    const tokenRefused = vi.fn(async () => json({ error: "invalid_client" }, 401));
    expect(
      await webBotAuthSigner(iam, { fetchImpl: tokenRefused })!(new URL("https://a.test/")),
    ).toBeNull();
  });

  it("is absent with no application credential, or when switched off", () => {
    vi.stubEnv("IAM_CLIENT_SECRET", "");
    expect(webBotAuthSigner({ serverUrl: iam.serverUrl, clientId: "hanzo-bot" })).toBeUndefined();
    expect(webBotAuthSigner(undefined)).toBeUndefined();
    vi.stubEnv("IAM_CLIENT_SECRET", "from-env");
    expect(webBotAuthSigner({ serverUrl: iam.serverUrl, clientId: "hanzo-bot" })).toBeDefined();
    vi.stubEnv("HANZO_WEB_BOT_AUTH", "off");
    expect(webBotAuthSigner(iam)).toBeUndefined();
  });
});
