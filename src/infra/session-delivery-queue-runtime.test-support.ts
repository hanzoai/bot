type SessionDeliveryQueueRuntimeTesting = {
  reset(): void;
};

function getTesting(): SessionDeliveryQueueRuntimeTesting {
  return (globalThis as Record<PropertyKey, unknown>)[
    Symbol.for("bot.sessionDeliveryQueueRuntimeTestApi")
  ] as SessionDeliveryQueueRuntimeTesting;
}

export const testing: SessionDeliveryQueueRuntimeTesting = {
  reset: () => getTesting().reset(),
};
