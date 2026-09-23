import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CFG = { serverUrl: "https://hanzo.id/", clientId: "hanzo-bot" };

function tokenResponse(token: string, expiresIn = 3600): Response {
  return new Response(
    JSON.stringify({ access_token: token, token_type: "Bearer", expires_in: expiresIn }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

async function load() {
  vi.resetModules();
  return await import("./commerce.js");
}

/** The two halves of a Basic header, form-unescaped the way IAM reads them. */
function basicHalves(header: string): [string, string] {
  const raw = Buffer.from(header.replace(/^Basic /, ""), "base64").toString();
  const colon = raw.indexOf(":");
  const unescape = (v: string) => decodeURIComponent(v.replaceAll("+", " "));
  return [unescape(raw.slice(0, colon)), unescape(raw.slice(colon + 1))];
}

beforeEach(() => {
  vi.stubEnv("IAM_CLIENT_ID", "");
  vi.stubEnv("IAM_CLIENT_SECRET", "s3cret");
  vi.stubEnv("COMMERCE_API_URL", "");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("appToken", () => {
  it("mints with client_credentials over client_secret_basic", async () => {
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse("t1"));
    vi.stubGlobal("fetch", fetchMock);
    const { appToken } = await load();

    await expect(appToken(CFG)).resolves.toBe("t1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://hanzo.id/v1/iam/oauth/token");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from("hanzo-bot:s3cret").toString("base64")}`,
    );
    expect(init.body).toBe("grant_type=client_credentials");
  });

  it("form-encodes both halves so IAM's form-unescape reads them back", async () => {
    const secret = "a+b/c=d:e%f g";
    vi.stubEnv("IAM_CLIENT_ID", "bot:x+y");
    vi.stubEnv("IAM_CLIENT_SECRET", secret);
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse("t1"));
    vi.stubGlobal("fetch", fetchMock);
    const { appToken } = await load();

    await appToken(CFG);

    const header = fetchMock.mock.calls[0][1].headers.Authorization as string;
    const raw = Buffer.from(header.replace(/^Basic /, ""), "base64").toString();
    expect(raw).toBe("bot%3Ax%2By:a%2Bb%2Fc%3Dd%3Ae%25f+g");
    expect(basicHalves(header)).toEqual(["bot:x+y", secret]);
  });

  it("caches the token and shares one mint between concurrent callers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse("t1"));
    vi.stubGlobal("fetch", fetchMock);
    const { appToken } = await load();

    const [a, b] = await Promise.all([appToken(CFG), appToken(CFG)]);
    const c = await appToken(CFG);

    expect([a, b, c]).toEqual(["t1", "t1", "t1"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("replaces the token 60s before it expires", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-23T00:00:00Z"));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("t1", 3600))
      .mockResolvedValueOnce(tokenResponse("t2", 3600));
    vi.stubGlobal("fetch", fetchMock);
    const { appToken } = await load();

    await expect(appToken(CFG)).resolves.toBe("t1");
    vi.setSystemTime(new Date("2026-09-23T00:58:59Z")); // 61s left
    await expect(appToken(CFG)).resolves.toBe("t1");
    vi.setSystemTime(new Date("2026-09-23T00:59:01Z")); // 59s left
    await expect(appToken(CFG)).resolves.toBe("t2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("takes IAM_CLIENT_ID and IAM_CLIENT_SECRET over the config", async () => {
    vi.stubEnv("IAM_CLIENT_ID", "env-id");
    vi.stubEnv("IAM_CLIENT_SECRET", "env-secret");
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse("t1"));
    vi.stubGlobal("fetch", fetchMock);
    const { appToken } = await load();

    await appToken({ ...CFG, clientSecret: "cfg-secret" });

    expect(basicHalves(fetchMock.mock.calls[0][1].headers.Authorization)).toEqual([
      "env-id",
      "env-secret",
    ]);
  });

  it("uses the config secret when the env has none", async () => {
    vi.stubEnv("IAM_CLIENT_SECRET", "");
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse("t1"));
    vi.stubGlobal("fetch", fetchMock);
    const { appToken } = await load();

    await appToken({ ...CFG, clientSecret: "cfg-secret" });

    expect(basicHalves(fetchMock.mock.calls[0][1].headers.Authorization)).toEqual([
      "hanzo-bot",
      "cfg-secret",
    ]);
  });

  it("refuses without a secret and sends nothing", async () => {
    vi.stubEnv("IAM_CLIENT_SECRET", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { appToken } = await load();

    await expect(appToken(CFG)).rejects.toThrow(/IAM_CLIENT_SECRET/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not cache a failed mint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(tokenResponse("t1"));
    vi.stubGlobal("fetch", fetchMock);
    const { appToken } = await load();

    await expect(appToken(CFG)).rejects.toThrow(/401/);
    await expect(appToken(CFG)).resolves.toBe("t1");
  });

  it("rejects a response without access_token or expires_in", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ expires_in: 3600 })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "t1" })))
      .mockResolvedValueOnce(new Response("<html>spa</html>"));
    vi.stubGlobal("fetch", fetchMock);
    const { appToken } = await load();

    await expect(appToken(CFG)).rejects.toThrow(/access_token/);
    await expect(appToken(CFG)).rejects.toThrow(/expires_in/);
    await expect(appToken(CFG)).rejects.toThrow(/access_token/);
  });
});

describe("commerceBase", () => {
  it("defaults to in-cluster cloud", async () => {
    const { commerceBase } = await load();
    expect(commerceBase()).toBe("http://cloud.hanzo.svc:8000");
  });

  it("reads COMMERCE_API_URL without a trailing slash", async () => {
    vi.stubEnv("COMMERCE_API_URL", "https://api.hanzo.ai/");
    const { commerceBase } = await load();
    expect(commerceBase()).toBe("https://api.hanzo.ai");
  });
});
