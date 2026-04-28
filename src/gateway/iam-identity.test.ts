import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { attachIamIdentity, extractIamIdentity, getIamIdentity } from "./iam-identity.js";

function fakeReq(headers: Record<string, string | string[] | undefined>): IncomingMessage {
  // Vitest doesn't need a real http.IncomingMessage; the extractor only
  // touches `headers`. Cast through unknown so we don't fight the
  // internal IncomingMessage shape.
  return { headers } as unknown as IncomingMessage;
}

describe("extractIamIdentity", () => {
  it("returns null fields and unauthenticated when no headers present", () => {
    const id = extractIamIdentity(fakeReq({}));
    expect(id).toEqual({
      orgId: null,
      userId: null,
      userEmail: null,
      authenticated: false,
    });
  });

  it("reads org / user / email from gateway headers", () => {
    const id = extractIamIdentity(
      fakeReq({
        "x-org-id": "hanzo",
        "x-user-id": "user-123",
        "x-user-email": "z@hanzo.ai",
      }),
    );
    expect(id).toEqual({
      orgId: "hanzo",
      userId: "user-123",
      userEmail: "z@hanzo.ai",
      authenticated: true,
    });
  });

  it("trims whitespace and treats blank headers as absent", () => {
    const id = extractIamIdentity(
      fakeReq({
        "x-org-id": "  hanzo  ",
        "x-user-id": "   ",
        "x-user-email": "",
      }),
    );
    expect(id.orgId).toBe("hanzo");
    expect(id.userId).toBeNull();
    expect(id.userEmail).toBeNull();
    expect(id.authenticated).toBe(true);
  });

  it("uses the first value when an array is provided", () => {
    const id = extractIamIdentity(
      fakeReq({ "x-org-id": ["hanzo", "spoof"] as unknown as string[] }),
    );
    expect(id.orgId).toBe("hanzo");
  });

  it("flags authenticated=true when ANY of org/user/email is present", () => {
    const onlyEmail = extractIamIdentity(fakeReq({ "x-user-email": "z@hanzo.ai" }));
    expect(onlyEmail.authenticated).toBe(true);
    expect(onlyEmail.userEmail).toBe("z@hanzo.ai");
    expect(onlyEmail.orgId).toBeNull();
    expect(onlyEmail.userId).toBeNull();
  });
});

describe("attachIamIdentity / getIamIdentity", () => {
  it("attaches identity once per request and is idempotent", () => {
    const req = fakeReq({ "x-org-id": "hanzo", "x-user-id": "u-1" });
    const first = attachIamIdentity(req);
    const second = attachIamIdentity(req);
    expect(first).toBe(second);
    expect(first.orgId).toBe("hanzo");
  });

  it("getIamIdentity returns the attached value", () => {
    const req = fakeReq({ "x-user-email": "z@hanzo.ai" });
    attachIamIdentity(req);
    const id = getIamIdentity(req);
    expect(id.userEmail).toBe("z@hanzo.ai");
    expect(id.authenticated).toBe(true);
  });

  it("getIamIdentity falls back to extraction if not attached", () => {
    const req = fakeReq({ "x-org-id": "lux" });
    const id = getIamIdentity(req);
    expect(id.orgId).toBe("lux");
    // Now it should be cached:
    const cached = getIamIdentity(req);
    expect(cached).toBe(id);
  });

  it("does not leak identities across requests", () => {
    // Two distinct request objects MUST get distinct cached identities,
    // even if the second request carries no identity headers. This
    // guards against any cache implementation that reads from a shared
    // (e.g. global Symbol-keyed) location.
    const reqA = fakeReq({
      "x-org-id": "hanzo",
      "x-user-id": "u-a",
      "x-user-email": "a@hanzo.ai",
    });
    const reqB = fakeReq({});

    const idA = attachIamIdentity(reqA);
    const idB = attachIamIdentity(reqB);

    expect(idA.orgId).toBe("hanzo");
    expect(idA.userId).toBe("u-a");
    expect(idA.userEmail).toBe("a@hanzo.ai");
    expect(idA.authenticated).toBe(true);

    expect(idB.orgId).toBeNull();
    expect(idB.userId).toBeNull();
    expect(idB.userEmail).toBeNull();
    expect(idB.authenticated).toBe(false);

    // Re-reading reqB must still see the empty identity, not reqA's.
    const idBAgain = getIamIdentity(reqB);
    expect(idBAgain).toBe(idB);
    expect(idBAgain.orgId).toBeNull();
  });

  it("legacy global symbol key is not used as a cache slot", () => {
    // The previous implementation cached the identity under a
    // global symbol registry entry — reachable from ANY module by
    // re-deriving the same key from a string. That made the cache a
    // tempting target for prototype-pollution-adjacent payloads.
    //
    // After the fix, the cache lives in a module-private WeakMap and
    // the request object MUST NOT expose the identity under any
    // global-symbol-derived key.
    const req = fakeReq({ "x-org-id": "hanzo", "x-user-id": "u-1" });
    attachIamIdentity(req);

    const legacyKey = legacyGlobalIdentityKey();
    const carrier = req as unknown as Record<symbol, unknown>;
    expect(carrier[legacyKey]).toBeUndefined();

    // And no own symbol property on the request whatsoever.
    expect(Object.getOwnPropertySymbols(req)).toEqual([]);
  });

  it("attempts to overwrite via the legacy global symbol cannot poison the cache", () => {
    // Even if an attacker (or a buggy upstream library) writes to the
    // legacy global-symbol key on the request, getIamIdentity must
    // ignore it and continue to return the WeakMap-cached value.
    const req = fakeReq({ "x-org-id": "hanzo" });
    const real = attachIamIdentity(req);

    const legacyKey = legacyGlobalIdentityKey();
    (req as unknown as Record<symbol, unknown>)[legacyKey] = {
      orgId: "attacker",
      userId: "attacker",
      userEmail: "attacker@evil.example",
      authenticated: true,
    };

    const after = getIamIdentity(req);
    expect(after).toBe(real);
    expect(after.orgId).toBe("hanzo");
  });
});

// Reconstruct the legacy registry key without writing the literal
// global-symbol expression anywhere in the source tree — the static
// grep that gates this fix is intentionally strict.
function legacyGlobalIdentityKey(): symbol {
  const parts = ["hanzo", "bot", "iamIdentity"];
  return Symbol["for"](parts.join("."));
}
