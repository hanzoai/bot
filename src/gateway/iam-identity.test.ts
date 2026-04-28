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
});
