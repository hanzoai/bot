import { describe, expect, it } from "vitest";
import {
  createBotTestState as createBotTestStateDirect,
  withBotTestState as withBotTestStateDirect,
} from "../test-utils/bot-test-state.js";
import { createBotTestState, withBotTestState } from "./test-state.js";

describe("test-state SDK seam", () => {
  it("re-exports the canonical isolated state lifecycle", () => {
    expect(createBotTestState).toBe(createBotTestStateDirect);
    expect(withBotTestState).toBe(withBotTestStateDirect);
  });
});
