/**
 * Gateway agent-list RPC regression tests.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BotConfig } from "../config/config.js";
import { withStateDirEnv } from "../test-helpers/state-dir-env.js";
import { listGatewayAgentsBasic } from "./agent-list.js";

describe("listGatewayAgentsBasic", () => {
  it("retains disk system agents without treating regular disk dirs as roster members", async () => {
    await withStateDirEnv("bot-agent-list-", async ({ stateDir }) => {
      await Promise.all(
        ["bot", "crestodian", "research"].map((id) =>
          fs.mkdir(path.join(stateDir, "agents", id), { recursive: true }),
        ),
      );

      const result = listGatewayAgentsBasic({
        agents: { entries: { main: { default: true } } },
      });

      expect(result.agents).toEqual([
        { id: "main", kind: "agent", name: undefined },
        { id: "crestodian", kind: "system", name: undefined },
        { id: "bot", kind: "system", name: undefined },
      ]);
    });
  });

  it("does not add owner entries without a roster membership source", async () => {
    await withStateDirEnv("bot-agent-list-", async () => {
      expect(
        listGatewayAgentsBasic({
          agents: { entries: { main: { default: true } } },
        }).agents,
      ).toEqual([{ id: "main", kind: "agent", name: undefined }]);
    });
  });

  it("lets configured ownership override disk system metadata", async () => {
    await withStateDirEnv("bot-agent-list-", async ({ stateDir }) => {
      await fs.mkdir(path.join(stateDir, "agents", "bot"), { recursive: true });
      const cfg: BotConfig = {
        agents: {
          list: [
            { id: "main", default: true },
            { id: "bot", name: "Bot" },
          ],
        },
      };

      expect(listGatewayAgentsBasic(cfg).agents).toEqual([
        { id: "main", kind: "agent", name: undefined },
        { id: "bot", kind: "agent", name: "Bot" },
      ]);
    });
  });

  it("retains disk-backed system agents beside an explicit roster", async () => {
    await withStateDirEnv("bot-agent-list-", async ({ stateDir }) => {
      await Promise.all(
        ["bot", "research"].map((id) =>
          fs.mkdir(path.join(stateDir, "agents", id), { recursive: true }),
        ),
      );

      expect(
        listGatewayAgentsBasic({
          agents: { entries: { main: { default: true } } },
        }).agents,
      ).toEqual([
        { id: "main", kind: "agent", name: undefined },
        { id: "bot", kind: "system", name: undefined },
      ]);
    });
  });

  it("falls back to identity.name when the configured agent name is missing", () => {
    const cfg: BotConfig = {
      session: { mainKey: "main" },
      agents: {
        list: [{ id: "main", default: true, identity: { name: "小金" } }],
      },
    };

    const result = listGatewayAgentsBasic(cfg);

    expect(result.agents).toEqual([{ id: "main", kind: "agent", name: "小金" }]);
  });

  it("prefers the explicit configured name over identity.name", () => {
    const cfg: BotConfig = {
      session: { mainKey: "main" },
      agents: {
        list: [
          {
            id: "main",
            default: true,
            name: "Ops",
            identity: { name: "开发助手" },
          },
        ],
      },
    };

    const result = listGatewayAgentsBasic(cfg);

    expect(result.agents).toEqual([{ id: "main", kind: "agent", name: "Ops" }]);
  });

  it("leaves the name unset when neither agents.list[].name nor identity.name is present", () => {
    const cfg: BotConfig = {
      session: { mainKey: "main" },
      agents: {
        list: [{ id: "main", default: true, identity: {} }],
      },
    };

    const result = listGatewayAgentsBasic(cfg);

    expect(result.agents).toEqual([{ id: "main", kind: "agent", name: undefined }]);
  });
});
