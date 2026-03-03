import { describe, expect, it, vi } from "vitest";
import { registerSlackPinEvents } from "./pins.js";
import {
  createSlackSystemEventTestHarness as buildPinHarness,
  type SlackSystemEventTestOverrides as PinOverrides,
} from "./system-event-test-harness.js";

const pinEnqueueMock = vi.hoisted(() => vi.fn());
const pinAllowMock = vi.hoisted(() => vi.fn());

vi.mock("../../../infra/system-events.js", () => {
  return { enqueueSystemEvent: pinEnqueueMock };
});
vi.mock("../../../pairing/pairing-store.js", () => ({
  readChannelAllowFromStore: pinAllowMock,
}));

type PinHandler = (args: { event: Record<string, unknown>; body: unknown }) => Promise<void>;

function createPinContext(params?: {
  overrides?: SlackSystemEventTestOverrides;
  trackEvent?: () => void;
  shouldDropMismatchedSlackEvent?: (body: unknown) => boolean;
}) {
  const harness = createSlackSystemEventTestHarness(params?.overrides);
  if (params?.shouldDropMismatchedSlackEvent) {
    harness.ctx.shouldDropMismatchedSlackEvent = params.shouldDropMismatchedSlackEvent;
  }
  registerSlackPinEvents({ ctx: harness.ctx, trackEvent: params?.trackEvent });
  return {
    getAddedHandler: () => harness.getHandler("pin_added") as SlackPinHandler | null,
    getRemovedHandler: () => harness.getHandler("pin_removed") as SlackPinHandler | null,
  };
}

function makePinEvent(overrides?: { channel?: string; user?: string }) {
  return {
    type: "pin_added",
    user: overrides?.user ?? "U1",
    channel_id: overrides?.channel ?? "D1",
    event_ts: "123.456",
    item: {
      type: "message",
      message: { ts: "123.456" },
    },
  };
}

function installPinHandlers(args: {
  overrides?: PinOverrides;
  trackEvent?: () => void;
  shouldDropMismatchedSlackEvent?: (body: unknown) => boolean;
}) {
  const harness = buildPinHarness(args.overrides);
  if (args.shouldDropMismatchedSlackEvent) {
    harness.ctx.shouldDropMismatchedSlackEvent = args.shouldDropMismatchedSlackEvent;
  }
  registerSlackPinEvents({ ctx: harness.ctx, trackEvent: args.trackEvent });
  return {
    added: harness.getHandler("pin_added") as PinHandler | null,
    removed: harness.getHandler("pin_removed") as PinHandler | null,
  };
}

async function runPinCase(input: PinCase = {}): Promise<void> {
  pinEnqueueMock.mockClear();
  pinAllowMock.mockReset().mockResolvedValue([]);
  const { added, removed } = installPinHandlers({
    overrides: input.overrides,
    trackEvent: input.trackEvent,
    shouldDropMismatchedSlackEvent: input.shouldDropMismatchedSlackEvent,
  });
  const handlerKey = input.handler ?? "added";
  const handler = handlerKey === "removed" ? removed : added;
  expect(handler).toBeTruthy();
  const event = (input.event ?? makePinEvent()) as Record<string, unknown>;
  const body = input.body ?? {};
  await handler!({
    body,
    event,
  });
}

describe("registerSlackPinEvents", () => {
  it("enqueues DM pin system events when dmPolicy is open", async () => {
    enqueueSystemEventMock.mockClear();
    readAllowFromStoreMock.mockReset().mockResolvedValue([]);
    const { getAddedHandler } = createPinContext({ overrides: { dmPolicy: "open" } });
    const addedHandler = getAddedHandler();
    expect(addedHandler).toBeTruthy();

    await addedHandler!({
      event: makePinEvent(),
      body: {},
    });

    expect(enqueueSystemEventMock).toHaveBeenCalledTimes(1);
  });

  it("blocks DM pin system events when dmPolicy is disabled", async () => {
    enqueueSystemEventMock.mockClear();
    readAllowFromStoreMock.mockReset().mockResolvedValue([]);
    const { getAddedHandler } = createPinContext({ overrides: { dmPolicy: "disabled" } });
    const addedHandler = getAddedHandler();
    expect(addedHandler).toBeTruthy();

    await addedHandler!({
      event: makePinEvent(),
      body: {},
    });

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("blocks DM pin system events for unauthorized senders in allowlist mode", async () => {
    enqueueSystemEventMock.mockClear();
    readAllowFromStoreMock.mockReset().mockResolvedValue([]);
    const { getAddedHandler } = createPinContext({
      overrides: { dmPolicy: "allowlist", allowFrom: ["U2"] },
    });
    const addedHandler = getAddedHandler();
    expect(addedHandler).toBeTruthy();

    await addedHandler!({
      event: makePinEvent({ user: "U1" }),
      body: {},
    });

    expect(enqueueSystemEventMock).not.toHaveBeenCalled();
  });

  it("allows DM pin system events for authorized senders in allowlist mode", async () => {
    enqueueSystemEventMock.mockClear();
    readAllowFromStoreMock.mockReset().mockResolvedValue([]);
    const { getAddedHandler } = createPinContext({
      overrides: { dmPolicy: "allowlist", allowFrom: ["U1"] },
    });
    const addedHandler = getAddedHandler();
    expect(addedHandler).toBeTruthy();

    await addedHandler!({
      event: makePinEvent({ user: "U1" }),
      body: {},
    });

    expect(enqueueSystemEventMock).toHaveBeenCalledTimes(1);
  });

  it("blocks channel pin events for users outside channel users allowlist", async () => {
    enqueueSystemEventMock.mockClear();
    readAllowFromStoreMock.mockReset().mockResolvedValue([]);
    const { getAddedHandler } = createPinContext({
      overrides: {
        dmPolicy: "open",
        channelType: "channel",
        channelUsers: ["U_OWNER"],
      },
    });
    const addedHandler = getAddedHandler();
    expect(addedHandler).toBeTruthy();

    await addedHandler!({
      event: makePinEvent({ channel: "C1", user: "U_ATTACKER" }),
      body: {},
    });

    expect(enqueueSystemEventMock).not.toHaveBeenCalled();
  });

  it("does not track mismatched events", async () => {
    const trackEvent = vi.fn();
    const { getAddedHandler } = createPinContext({
      trackEvent,
      shouldDropMismatchedSlackEvent: () => true,
    });
    const addedHandler = getAddedHandler();
    expect(addedHandler).toBeTruthy();

    await addedHandler!({
      event: makePinEvent(),
      body: { api_app_id: "A_OTHER" },
    });

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("tracks accepted pin events", async () => {
    const trackEvent = vi.fn();
    const { getAddedHandler } = createPinContext({ trackEvent });
    const addedHandler = getAddedHandler();
    expect(addedHandler).toBeTruthy();

    await addedHandler!({
      event: makePinEvent(),
      body: {},
    });

    expect(trackEvent).toHaveBeenCalledTimes(1);
  });
});
