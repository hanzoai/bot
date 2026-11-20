import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as ssrf from "../../infra/net/ssrf.js";
import { type FetchMock, withFetchPreconnect } from "../../test-utils/fetch-mock.js";

const lookupMock = vi.fn();
const resolvePinnedHostname = ssrf.resolvePinnedHostname;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("web_fetch Web Bot Auth", () => {
  const priorFetch = global.fetch;

  beforeEach(() => {
    vi.spyOn(ssrf, "resolvePinnedHostname").mockImplementation((hostname) =>
      resolvePinnedHostname(hostname, lookupMock),
    );
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    vi.stubEnv("CLOUD_API_URL", "http://cloud.test:8000");
    vi.stubEnv("IAM_CLIENT_ID", "");
    vi.stubEnv("IAM_CLIENT_SECRET", "");
  });

  afterEach(() => {
    global.fetch = priorFetch;
    lookupMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("sends each page request with the headers cloud signed for that host", async () => {
    const asked: string[] = [];
    const page: Headers[] = [];
    const fetchSpy = vi.fn<FetchMock>(async (input, init) => {
      const url = String(input);
      if (url === "https://iam.web-fetch.test/v1/iam/oauth/token") {
        return json({ access_token: "app-token", expires_in: 3600 });
      }
      if (url === "http://cloud.test:8000/v1/crawl/sign") {
        const { authority } = JSON.parse(String(init?.body)) as { authority: string };
        asked.push(authority);
        return json({
          signatureAgent: '"https://api.hanzo.test/.well-known/http-message-signatures-directory"',
          signatureInput: `sig1=("@authority" "signature-agent");tag="web-bot-auth";host="${authority}"`,
          signature: `sig1=:${authority}:`,
        });
      }
      page.push(new Headers(init?.headers));
      if (url === "https://example.com/start") {
        return new Response(null, {
          status: 302,
          headers: { location: "https://www.example.com/" },
        });
      }
      return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
    });
    global.fetch = withFetchPreconnect(fetchSpy);

    const { createWebFetchTool } = await import("./web-tools.js");
    const tool = createWebFetchTool({
      config: {
        gateway: {
          auth: {
            mode: "iam",
            iam: {
              serverUrl: "https://iam.web-fetch.test",
              clientId: "hanzo-bot",
              clientSecret: "s3cret",
            },
          },
        },
        tools: { web: { fetch: { cacheTtlMinutes: 0, firecrawl: { enabled: false } } } },
      },
    });

    const result = await tool?.execute?.("call", { url: "https://example.com/start" });
    expect(result?.details).toMatchObject({ status: 200 });
    expect(asked).toEqual(["example.com", "www.example.com"]);
    expect(page.map((h) => h.get("signature"))).toEqual([
      "sig1=:example.com:",
      "sig1=:www.example.com:",
    ]);
    expect(page[1].get("signature-agent")).toContain("http-message-signatures-directory");
  });
});
