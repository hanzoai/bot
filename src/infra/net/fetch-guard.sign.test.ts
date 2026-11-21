import { describe, expect, it, vi } from "vitest";
import { fetchWithSsrFGuard, type HopSigner } from "./fetch-guard.js";

type LookupFn = NonNullable<Parameters<typeof fetchWithSsrFGuard>[0]["lookupFn"]>;

const publicLookup = (): LookupFn =>
  vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]) as unknown as LookupFn;

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

function headersOf(fetchImpl: ReturnType<typeof vi.fn>, call: number): Headers {
  const [, init] = fetchImpl.mock.calls[call] as [string, RequestInit];
  return new Headers(init.headers);
}

/** A signer that signs each host with its own name, so a test can see which hop got which. */
const byHost: HopSigner = async (url) => ({
  "Signature-Agent": '"https://api.hanzo.test/.well-known/http-message-signatures-directory"',
  "Signature-Input": `sig1=("@authority" "signature-agent");tag="web-bot-auth";for="${url.host}"`,
  Signature: `sig1=:${url.host}:`,
});

describe("fetchWithSsrFGuard signHop (Web Bot Auth)", () => {
  it("signs every hop for its own host, and never carries one hop's signature to the next", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(redirect("https://www.example.com/next"))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const init = { headers: { Accept: "text/html", "User-Agent": "Hanzo" } };
    const sign = vi.fn(byHost);

    const result = await fetchWithSsrFGuard({
      url: "https://example.com/start",
      fetchImpl,
      lookupFn: publicLookup(),
      init,
      signHop: sign,
    });
    await result.release();

    expect(sign.mock.calls.map(([url]) => url.host)).toEqual(["example.com", "www.example.com"]);
    const first = headersOf(fetchImpl, 0);
    const second = headersOf(fetchImpl, 1);
    expect(first.get("signature")).toBe("sig1=:example.com:");
    expect(second.get("signature")).toBe("sig1=:www.example.com:");
    expect(second.get("signature-input")).toContain('for="www.example.com"');
    // The caller's own headers ride on every hop, and its init is not changed.
    expect(first.get("user-agent")).toBe("Hanzo");
    expect(second.get("accept")).toBe("text/html");
    expect(init.headers).toEqual({ Accept: "text/html", "User-Agent": "Hanzo" });
  });

  it("sends the hop unsigned when the signer answers null or throws", async () => {
    for (const sign of [
      vi.fn(async () => null),
      vi.fn(async () => {
        throw new Error("cloud unreachable");
      }),
    ]) {
      const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
      const result = await fetchWithSsrFGuard({
        url: "https://example.com/",
        fetchImpl,
        lookupFn: publicLookup(),
        init: { headers: { Accept: "text/html" } },
        signHop: sign,
      });
      await result.release();
      expect(sign).toHaveBeenCalledTimes(1);
      const sent = headersOf(fetchImpl, 0);
      expect(sent.get("signature")).toBeNull();
      expect(sent.get("accept")).toBe("text/html");
    }
  });

  it("asks for no signature for a host the SSRF policy refuses", async () => {
    const fetchImpl = vi.fn();
    const sign = vi.fn(byHost);
    await expect(
      fetchWithSsrFGuard({
        url: "http://127.0.0.1/admin",
        fetchImpl,
        lookupFn: publicLookup(),
        signHop: sign,
      }),
    ).rejects.toThrow();
    expect(sign).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
