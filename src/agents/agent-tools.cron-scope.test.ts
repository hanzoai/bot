/**
 * Tests cron-triggered tool assembly.
 * Ensures cron runs scope cron tool behavior to self-removal of the current
 * job only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnyAgentTool } from "./tools/common.js";

const mocks = vi.hoisted(() => {
  const stubTool = (name: string) =>
    ({
      name,
      label: name,
      displaySummary: name,
      description: name,
      parameters: { type: "object", properties: {} },
      execute: vi.fn(),
    }) satisfies AnyAgentTool;

  return {
    createBotToolsOptions: vi.fn(),
    stubTool,
  };
});

vi.mock("./bot-tools.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./bot-tools.js")>();
  return {
    createBotTools: (options: unknown) => {
      mocks.createBotToolsOptions(options);
      return [mocks.stubTool("cron")];
    },
    filterToolsByClientCaps: actual.filterToolsByClientCaps,
  };
});

import "./test-helpers/fast-bash-tools.js";
import "./test-helpers/fast-coding-tools.js";
import { createBotCodingTools } from "./agent-tools.js";

function firstBotToolsOptions(): { cronSelfRemoveOnlyJobId?: string } | undefined {
  return mocks.createBotToolsOptions.mock.calls[0]?.[0] as
    | { cronSelfRemoveOnlyJobId?: string }
    | undefined;
}

describe("createBotCodingTools cron scope", () => {
  beforeEach(() => {
    mocks.createBotToolsOptions.mockClear();
  });

  it("scopes cron-triggered jobs to self-removal", () => {
    const tools = createBotCodingTools({
      trigger: "cron",
      jobId: "job-current",
    });

    expect(tools.map((tool) => tool.name)).toContain("cron");
    expect(firstBotToolsOptions()?.cronSelfRemoveOnlyJobId).toBe("job-current");
  });

  it("does not scope non-cron sessions", () => {
    createBotCodingTools({
      trigger: "user",
      jobId: "job-current",
    });

    expect(firstBotToolsOptions()?.cronSelfRemoveOnlyJobId).toBeUndefined();
  });
});
