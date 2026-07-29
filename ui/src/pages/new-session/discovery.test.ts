// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readDraftCloudProfiles } from "./discovery.ts";

describe("readDraftCloudProfiles", () => {
  it("keeps closed profile summaries in stable order", () => {
    expect(
      readDraftCloudProfiles([
        null,
        42,
        { id: " zeta ", providerId: " static-ssh ", settings: { token: "hidden" } },
        { id: "aws", providerId: "botbox" },
        { id: "", providerId: "botbox" },
        { id: "missing-provider" },
      ]),
    ).toEqual([
      { id: "aws", providerId: "botbox" },
      { id: "zeta", providerId: "static-ssh" },
    ]);
  });
});
