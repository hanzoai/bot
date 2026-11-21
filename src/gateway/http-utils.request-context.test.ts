import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { resolveGatewayRequestContext, resolveNamedModel } from "./http-utils.js";

function createReq(headers: Record<string, string> = {}): IncomingMessage {
  return { headers } as IncomingMessage;
}

describe("resolveGatewayRequestContext", () => {
  it("uses normalized x-bot-message-channel when enabled", () => {
    const result = resolveGatewayRequestContext({
      req: createReq({ "x-bot-message-channel": " Custom-Channel " }),
      model: "bot",
      sessionPrefix: "openai",
      defaultMessageChannel: "webchat",
      useMessageChannelHeader: true,
    });

    expect(result.messageChannel).toBe("custom-channel");
  });

  it("uses default messageChannel when header support is disabled", () => {
    const result = resolveGatewayRequestContext({
      req: createReq({ "x-bot-message-channel": "custom-channel" }),
      model: "bot",
      sessionPrefix: "openresponses",
      defaultMessageChannel: "webchat",
      useMessageChannelHeader: false,
    });

    expect(result.messageChannel).toBe("webchat");
  });

  it("includes session prefix and user in generated session key", () => {
    const result = resolveGatewayRequestContext({
      req: createReq(),
      model: "bot",
      user: "alice",
      sessionPrefix: "openresponses",
      defaultMessageChannel: "webchat",
    });

    expect(result.sessionKey).toContain("openresponses-user:alice");
  });
});

describe("resolveNamedModel", () => {
  it("is undefined when the field only selects an agent", () => {
    for (const model of ["bot", "BOT", "bot:main", "bot/ops", "agent:main", "", "  ", undefined]) {
      expect(resolveNamedModel(model), String(model)).toBeUndefined();
    }
  });

  it("is the model a request names", () => {
    expect(resolveNamedModel("enso-auto")).toBe("enso-auto");
    expect(resolveNamedModel(" hanzo/zen6 ")).toBe("hanzo/zen6");
  });
});
