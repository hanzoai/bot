import { describe, expect, it } from "vitest";
import {
  PROTECTED_PLUGIN_ROUTE_PREFIXES,
  buildCanonicalPathCandidates,
  canonicalizePathForSecurity,
  isPathProtectedByPrefixes,
  isProtectedPluginRoutePath,
} from "./security-path.js";

function buildRepeatedEncodedSlashPath(depth: number): string {
  let encodedSlash = "%2f";
  for (let i = 1; i < depth; i++) {
    encodedSlash = encodedSlash.replace(/%/g, "%25");
  }
  return `/v1${encodedSlash}channels${encodedSlash}nostr${encodedSlash}default${encodedSlash}profile`;
}

describe("security-path canonicalization", () => {
  it("canonicalizes decoded case/slash variants", () => {
    expect(canonicalizePathForSecurity("/V1/channels//nostr/default/profile/")).toEqual(
      expect.objectContaining({
        canonicalPath: "/v1/channels/nostr/default/profile",
        candidates: ["/v1/channels/nostr/default/profile"],
        malformedEncoding: false,
        decodePasses: 0,
        decodePassLimitReached: false,
        rawNormalizedPath: "/v1/channels/nostr/default/profile",
      }),
    );
    const encoded = canonicalizePathForSecurity("/v1/%63hannels%2Fnostr%2Fdefault%2Fprofile");
    expect(encoded.canonicalPath).toBe("/v1/channels/nostr/default/profile");
    expect(encoded.candidates).toContain("/v1/%63hannels%2fnostr%2fdefault%2fprofile");
    expect(encoded.candidates).toContain("/v1/channels/nostr/default/profile");
    expect(encoded.decodePasses).toBeGreaterThan(0);
    expect(encoded.decodePassLimitReached).toBe(false);
  });

  it("resolves traversal after repeated decoding", () => {
    expect(
      canonicalizePathForSecurity("/v1/foo/..%2fchannels/nostr/default/profile").canonicalPath,
    ).toBe("/v1/channels/nostr/default/profile");
    expect(
      canonicalizePathForSecurity("/v1/foo/%252e%252e%252fchannels/nostr/default/profile")
        .canonicalPath,
    ).toBe("/v1/channels/nostr/default/profile");
  });

  it("marks malformed encoding", () => {
    expect(canonicalizePathForSecurity("/v1/channels%2").malformedEncoding).toBe(true);
    expect(canonicalizePathForSecurity("/v1/channels%zz").malformedEncoding).toBe(true);
  });

  it("resolves 4x encoded slash path variants to protected channel routes", () => {
    const deeplyEncoded = "/v1%2525252fchannels%2525252fnostr%2525252fdefault%2525252fprofile";
    const canonical = canonicalizePathForSecurity(deeplyEncoded);
    expect(canonical.canonicalPath).toBe("/v1/channels/nostr/default/profile");
    expect(canonical.decodePasses).toBeGreaterThanOrEqual(4);
    expect(isProtectedPluginRoutePath(deeplyEncoded)).toBe(true);
  });

  it("flags decode depth overflow and fails closed for protected prefix checks", () => {
    const excessiveDepthPath = buildRepeatedEncodedSlashPath(40);
    const candidates = buildCanonicalPathCandidates(excessiveDepthPath, 32);
    expect(candidates.decodePassLimitReached).toBe(true);
    expect(candidates.malformedEncoding).toBe(false);
    expect(isProtectedPluginRoutePath(excessiveDepthPath)).toBe(true);
  });
});

describe("security-path protected-prefix matching", () => {
  const channelVariants = [
    "/V1/channels/nostr/default/profile",
    "/v1/channels%2Fnostr%2Fdefault%2Fprofile",
    "/v1/%63hannels/nostr/default/profile",
    "/v1/foo/..%2fchannels/nostr/default/profile",
    "/v1/foo/%2e%2e%2fchannels/nostr/default/profile",
    "/v1/foo/%252e%252e%252fchannels/nostr/default/profile",
    "/v1%2525252fchannels%2525252fnostr%2525252fdefault%2525252fprofile",
    "/v1/channels%2",
    "/v1/channels%zz",
  ];

  for (const path of channelVariants) {
    it(`protects plugin channel path variant: ${path}`, () => {
      expect(isProtectedPluginRoutePath(path)).toBe(true);
      expect(isPathProtectedByPrefixes(path, PROTECTED_PLUGIN_ROUTE_PREFIXES)).toBe(true);
    });
  }

  it("does not protect unrelated paths", () => {
    expect(isProtectedPluginRoutePath("/plugin/public")).toBe(false);
    expect(isProtectedPluginRoutePath("/v1/channels-public")).toBe(false);
    expect(isProtectedPluginRoutePath("/v1/foo/..%2fchannels-public")).toBe(false);
    expect(isProtectedPluginRoutePath("/v1/channel")).toBe(false);
  });
});
