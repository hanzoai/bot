import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findExtraGatewayServices } from "./inspect.js";

const { execSchtasksMock } = vi.hoisted(() => ({
  execSchtasksMock: vi.fn(),
}));

vi.mock("./schtasks-exec.js", () => ({
  execSchtasks: (...args: unknown[]) => execSchtasksMock(...args),
}));

describe("findExtraGatewayServices (win32)", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: "win32",
    });
    execSchtasksMock.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: originalPlatform,
    });
  });

  it("skips schtasks queries unless deep mode is enabled", async () => {
    const result = await findExtraGatewayServices({});
    expect(result).toEqual([]);
    expect(execSchtasksMock).not.toHaveBeenCalled();
  });

  it("returns empty results when schtasks query fails", async () => {
    execSchtasksMock.mockResolvedValueOnce({
      code: 1,
      stdout: "",
      stderr: "error",
    });

    const result = await findExtraGatewayServices({}, { deep: true });
    expect(result).toEqual([]);
  });

  it("collects only non-bot marker tasks from schtasks output", async () => {
    execSchtasksMock.mockResolvedValueOnce({
      code: 0,
      stdout: [
        "TaskName: HanzoBot Gateway",
        "Task To Run: C:\\Program Files\\HanzoBot\\bot.exe gateway run",
        "",
        "TaskName: Clawdbot Legacy",
        "Task To Run: C:\\clawdbot\\clawdbot.exe run",
        "",
        "TaskName: Other Task",
        "Task To Run: C:\\tools\\helper.exe",
        "",
        "TaskName: MoltBot Legacy",
        "Task To Run: C:\\moltbot\\moltbot.exe run",
        "",
      ].join("\n"),
      stderr: "",
    });

    const result = await findExtraGatewayServices({}, { deep: true });
    expect(result).toEqual([
      {
        platform: "win32",
        label: "Clawdbot Legacy",
        detail: "task: Clawdbot Legacy, run: C:\\clawdbot\\clawdbot.exe run",
        scope: "system",
        marker: "clawdbot",
        legacy: true,
      },
      {
        platform: "win32",
        label: "MoltBot Legacy",
        detail: "task: MoltBot Legacy, run: C:\\moltbot\\moltbot.exe run",
        scope: "system",
        marker: "moltbot",
        legacy: true,
      },
    ]);
  });
});

describe("findExtraGatewayServices (darwin, linux)", () => {
  const originalPlatform = process.platform;
  let home: string;

  const plist = (label: string, program: string[]) =>
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<plist version="1.0"><dict>',
      `<key>Label</key><string>${label}</string>`,
      "<key>ProgramArguments</key><array>",
      ...program.map((arg) => `<string>${arg}</string>`),
      "</array></dict></plist>",
    ].join("\n");

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "bot-inspect-"));
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { configurable: true, value: originalPlatform });
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("never marks a Clawdbot-labelled launchd service that runs OpenClaw as legacy", async () => {
    Object.defineProperty(process, "platform", { configurable: true, value: "darwin" });
    const dir = path.join(home, "Library", "LaunchAgents");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "com.clawdbot.gateway.plist"),
      plist("com.clawdbot.gateway", [
        "/usr/local/bin/node",
        "/opt/openclaw/openclaw.mjs",
        "gateway",
      ]),
    );
    fs.writeFileSync(
      path.join(dir, "com.clawdbot.old.plist"),
      plist("com.clawdbot.old", ["/usr/local/bin/node", "/opt/clawdbot/clawdbot.mjs", "gateway"]),
    );
    const result = await findExtraGatewayServices({ HOME: home });
    const byLabel = Object.fromEntries(result.map((svc) => [svc.label, svc]));
    expect(byLabel["com.clawdbot.gateway"]).toMatchObject({ legacy: false, openclaw: true });
    expect(byLabel["com.clawdbot.old"]).toMatchObject({ legacy: true });
    expect(byLabel["com.clawdbot.old"]).not.toHaveProperty("openclaw");
  });

  it("never marks a systemd unit that runs OpenClaw as legacy", async () => {
    Object.defineProperty(process, "platform", { configurable: true, value: "linux" });
    const dir = path.join(home, ".config", "systemd", "user");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "clawdbot-gateway.service"),
      "[Unit]\nDescription=Clawdbot gateway\n[Service]\nExecStart=/usr/bin/node /opt/openclaw/openclaw.mjs gateway\n",
    );
    const result = await findExtraGatewayServices({ HOME: home });
    expect(result).toEqual([
      expect.objectContaining({ label: "clawdbot-gateway.service", legacy: false, openclaw: true }),
    ]);
  });
});
