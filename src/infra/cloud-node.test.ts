import { describe, expect, it } from "vitest";
import { CLOUD_NODE_ENV, isCloudNode } from "./cloud-node.js";

describe("isCloudNode", () => {
  it(`is true when ${CLOUD_NODE_ENV}=true`, () => {
    expect(isCloudNode({ [CLOUD_NODE_ENV]: "true" })).toBe(true);
  });

  it("is false when the flag is unset", () => {
    expect(isCloudNode({})).toBe(false);
  });

  it("is false for any value other than the exact string 'true'", () => {
    expect(isCloudNode({ [CLOUD_NODE_ENV]: "1" })).toBe(false);
    expect(isCloudNode({ [CLOUD_NODE_ENV]: "TRUE" })).toBe(false);
    expect(isCloudNode({ [CLOUD_NODE_ENV]: "" })).toBe(false);
  });
});
