import { describe, expect, it, vi } from "vitest";
import { registerSlackMemberEvents } from "./members.js";
import {
  createSlackSystemEventTestHarness as initSlackHarness,
  type SlackSystemEventTestOverrides as MemberOverrides,
} from "./system-event-test-harness.js";

const memberMocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  readAllow: vi.fn(),
}));

vi.mock("../../../infra/system-events.js", () => ({
  enqueueSystemEvent: memberMocks.enqueue,
}));

vi.mock("../../../pairing/pairing-store.js", () => ({
  readChannelAllowFromStore: memberMocks.readAllow,
}));

type MemberHandler = (args: { event: Record<string, unknown>; body: unknown }) => Promise<void>;

function createMembersContext(params?: {
  overrides?: SlackSystemEventTestOverrides;
  trackEvent?: () => void;
  shouldDropMismatchedSlackEvent?: (body: unknown) => boolean;
}) {
  const harness = createSlackSystemEventTestHarness(params?.overrides);
  if (params?.shouldDropMismatchedSlackEvent) {
    harness.ctx.shouldDropMismatchedSlackEvent = params.shouldDropMismatchedSlackEvent;
  }
  registerSlackMemberEvents({ ctx: harness.ctx, trackEvent: params?.trackEvent });
  return {
    getJoinedHandler: () =>
      harness.getHandler("member_joined_channel") as SlackMemberHandler | null,
    getLeftHandler: () => harness.getHandler("member_left_channel") as SlackMemberHandler | null,
  };
}

function makeMemberEvent(overrides?: { channel?: string; user?: string }) {
  return {
    type: "member_joined_channel",
    user: overrides?.user ?? "U1",
    channel: overrides?.channel ?? "D1",
    event_ts: "123.456",
  };
}

function getMemberHandlers(params: {
  overrides?: MemberOverrides;
  trackEvent?: () => void;
  shouldDropMismatchedSlackEvent?: (body: unknown) => boolean;
}) {
  const harness = initSlackHarness(params.overrides);
  if (params.shouldDropMismatchedSlackEvent) {
    harness.ctx.shouldDropMismatchedSlackEvent = params.shouldDropMismatchedSlackEvent;
  }
  registerSlackMemberEvents({ ctx: harness.ctx, trackEvent: params.trackEvent });
  return {
    joined: harness.getHandler("member_joined_channel") as MemberHandler | null,
    left: harness.getHandler("member_left_channel") as MemberHandler | null,
  };
}

async function runMemberCase(args: MemberCaseArgs = {}): Promise<void> {
  memberMocks.enqueue.mockClear();
  memberMocks.readAllow.mockReset().mockResolvedValue([]);
  const handlers = getMemberHandlers({
    overrides: args.overrides,
    trackEvent: args.trackEvent,
    shouldDropMismatchedSlackEvent: args.shouldDropMismatchedSlackEvent,
  });
  const key = args.handler ?? "joined";
  const handler = handlers[key];
  expect(handler).toBeTruthy();
  await handler!({
    event: (args.event ?? makeMemberEvent()) as Record<string, unknown>,
    body: args.body ?? {},
  });
}

describe("registerSlackMemberEvents", () => {
  it("enqueues DM member events when dmPolicy is open", async () => {
    enqueueSystemEventMock.mockClear();
    readAllowFromStoreMock.mockReset().mockResolvedValue([]);
    const { getJoinedHandler } = createMembersContext({ overrides: { dmPolicy: "open" } });
    const joinedHandler = getJoinedHandler();
    expect(joinedHandler).toBeTruthy();

    await joinedHandler!({
      event: makeMemberEvent(),
      body: {},
    });

    expect(enqueueSystemEventMock).toHaveBeenCalledTimes(1);
  });

  it("blocks DM member events when dmPolicy is disabled", async () => {
    enqueueSystemEventMock.mockClear();
    readAllowFromStoreMock.mockReset().mockResolvedValue([]);
    const { getJoinedHandler } = createMembersContext({ overrides: { dmPolicy: "disabled" } });
    const joinedHandler = getJoinedHandler();
    expect(joinedHandler).toBeTruthy();

    await joinedHandler!({
      event: makeMemberEvent(),
      body: {},
    });

    expect(enqueueSystemEventMock).not.toHaveBeenCalled();
  });

  it("blocks DM member events for unauthorized senders in allowlist mode", async () => {
    enqueueSystemEventMock.mockClear();
    readAllowFromStoreMock.mockReset().mockResolvedValue([]);
    const { getJoinedHandler } = createMembersContext({
      overrides: { dmPolicy: "allowlist", allowFrom: ["U2"] },
    });
    const joinedHandler = getJoinedHandler();
    expect(joinedHandler).toBeTruthy();

    await joinedHandler!({
      event: makeMemberEvent({ user: "U1" }),
      body: {},
    });

    expect(enqueueSystemEventMock).not.toHaveBeenCalled();
  });

  it("allows DM member events for authorized senders in allowlist mode", async () => {
    enqueueSystemEventMock.mockClear();
    readAllowFromStoreMock.mockReset().mockResolvedValue([]);
    const { getLeftHandler } = createMembersContext({
      overrides: { dmPolicy: "allowlist", allowFrom: ["U1"] },
    });
    const leftHandler = getLeftHandler();
    expect(leftHandler).toBeTruthy();

    await leftHandler!({
      event: {
        ...makeMemberEvent({ user: "U1" }),
        type: "member_left_channel",
      },
      calls: 0,
    },
    {
      name: "allows DM member events for authorized senders in allowlist mode",
      args: {
        handler: "left" as const,
        overrides: { dmPolicy: "allowlist", allowFrom: ["U1"] },
        event: { ...makeMemberEvent({ user: "U1" }), type: "member_left_channel" },
      },
      calls: 1,
    },
    {
      name: "blocks channel member events for users outside channel users allowlist",
      args: {
        overrides: {
          dmPolicy: "open",
          channelType: "channel",
          channelUsers: ["U_OWNER"],
        },
        event: makeMemberEvent({ channel: "C1", user: "U_ATTACKER" }),
      },
      calls: 0,
    },
  ];
  it.each(cases)("$name", async ({ args, calls }) => {
    await runMemberCase(args);
    expect(memberMocks.enqueue).toHaveBeenCalledTimes(calls);
  });

  it("blocks channel member events for users outside channel users allowlist", async () => {
    enqueueSystemEventMock.mockClear();
    readAllowFromStoreMock.mockReset().mockResolvedValue([]);
    const { getJoinedHandler } = createMembersContext({
      overrides: {
        dmPolicy: "open",
        channelType: "channel",
        channelUsers: ["U_OWNER"],
      },
    });
    const joinedHandler = getJoinedHandler();
    expect(joinedHandler).toBeTruthy();

    await joinedHandler!({
      event: makeMemberEvent({ channel: "C1", user: "U_ATTACKER" }),
      body: {},
    });

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("tracks accepted member events", async () => {
    const trackEvent = vi.fn();
    await runMemberCase({ trackEvent });

    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it("does not track mismatched events", async () => {
    const trackEvent = vi.fn();
    const { getJoinedHandler } = createMembersContext({
      trackEvent,
      shouldDropMismatchedSlackEvent: () => true,
    });
    const joinedHandler = getJoinedHandler();
    expect(joinedHandler).toBeTruthy();

    await joinedHandler!({
      event: makeMemberEvent(),
      body: { api_app_id: "A_OTHER" },
    });

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("tracks accepted member events", async () => {
    const trackEvent = vi.fn();
    const { getJoinedHandler } = createMembersContext({ trackEvent });
    const joinedHandler = getJoinedHandler();
    expect(joinedHandler).toBeTruthy();

    await joinedHandler!({
      event: makeMemberEvent(),
      body: {},
    });

    expect(trackEvent).toHaveBeenCalledTimes(1);
  });
});
