export * from "./subagent-announce-output.js";

type OutputRuntime = typeof import("./subagent-announce.runtime.js");
type OutputDeps = Pick<
  OutputRuntime,
  | "callGateway"
  | "getRuntimeConfig"
  | "readSessionEntry"
  | "readSessionMessagesAsync"
  | "resolveAgentIdFromSessionKey"
  | "resolveStorePath"
>;

type Testing = {
  setDepsForTest(overrides?: Partial<OutputDeps>): void;
};

function getTesting(): Testing {
  return (globalThis as Record<PropertyKey, unknown>)[
    Symbol.for("bot.subagentAnnounceOutputTestApi")
  ] as Testing;
}

export const testing: Testing = {
  setDepsForTest: (overrides) => getTesting().setDepsForTest(overrides),
};
