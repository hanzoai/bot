import type {
  BotPluginApi,
  BotPluginNodeHostCommand,
} from "bot/plugin-sdk/plugin-entry";
import { describe, expect, it } from "vitest";
import plugin from "./index.js";

describe("cua-computer plugin registration", () => {
  it("registers the screen and dangerous computer node-host commands", () => {
    const commands: BotPluginNodeHostCommand[] = [];
    plugin.register({
      pluginConfig: { driverPath: "cua-driver" },
      registerNodeHostCommand: (command: BotPluginNodeHostCommand) => commands.push(command),
    } as unknown as BotPluginApi);

    expect(commands.map(({ command, cap, dangerous }) => ({ command, cap, dangerous }))).toEqual([
      { command: "screen.snapshot", cap: "screen", dangerous: false },
      { command: "computer.act", cap: "computer", dangerous: true },
    ]);
  });
});
