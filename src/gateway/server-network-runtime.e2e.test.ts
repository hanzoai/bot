// Server network runtime e2e tests verify gateway startup isolation, proxy env handling, and runtime cleanup.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Agent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearConfigCache, clearRuntimeConfigSnapshot } from "../config/config.js";
import { clearSessionStoreCacheForTest } from "../config/sessions/store-writer-state.js";
import { resetAgentEventsForTest } from "../infra/agent-events.js";
import { PROXY_ENV_KEYS } from "../infra/net/proxy-env.js";
import { clearGatewaySubagentRuntime } from "../plugins/runtime/gateway-bindings.test-fixtures.js";
import { captureEnv, deleteTestEnvValue, setTestEnvValue } from "../test-utils/env.js";
import { startGatewayServer } from "./server.js";
import { getFreeGatewayPort } from "./test-helpers.e2e.js";

const NETWORK_GATEWAY_ENV_KEYS = [
  "HOME",
  "BOT_STATE_DIR",
  "BOT_CONFIG_PATH",
  "BOT_GATEWAY_TOKEN",
  "BOT_SKIP_CHANNELS",
  "BOT_SKIP_GMAIL_WATCHER",
  "BOT_SKIP_CRON",
  "BOT_SKIP_CANVAS_HOST",
  "BOT_SKIP_BROWSER_CONTROL_SERVER",
  "BOT_SKIP_PROVIDERS",
  "BOT_BUNDLED_PLUGINS_DIR",
  "BOT_TEST_MINIMAL_GATEWAY",
  ...PROXY_ENV_KEYS,
  "NO_PROXY",
  "no_proxy",
] as const;

function isEnvHttpProxyDispatcher(dispatcher: unknown): boolean {
  return (
    (dispatcher as { constructor?: { name?: string } } | undefined)?.constructor?.name ===
    "EnvHttpProxyAgent"
  );
}

async function closeTestDispatcher(dispatcher: unknown): Promise<void> {
  const close = (dispatcher as { close?: () => Promise<void> | void } | undefined)?.close;
  if (typeof close !== "function") {
    return;
  }
  await close.call(dispatcher);
}

describe("gateway network runtime", () => {
  beforeEach(() => {
    resetAgentEventsForTest({ preserveListeners: true });
    clearRuntimeConfigSnapshot();
    clearConfigCache();
    clearSessionStoreCacheForTest();
    clearGatewaySubagentRuntime();
  });

  afterEach(() => {
    resetAgentEventsForTest({ preserveListeners: true });
    clearRuntimeConfigSnapshot();
    clearConfigCache();
    clearSessionStoreCacheForTest();
    clearGatewaySubagentRuntime();
  });

  it("bootstraps env proxy dispatching when the gateway starts directly", async () => {
    const envSnapshot = captureEnv([...NETWORK_GATEWAY_ENV_KEYS]);
    const originalDispatcher = getGlobalDispatcher();
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "bot-gw-proxy-home-"));
    let server: Awaited<ReturnType<typeof startGatewayServer>> | undefined;

    try {
      const testDispatcher = new Agent();
      setGlobalDispatcher(testDispatcher);
      for (const key of NETWORK_GATEWAY_ENV_KEYS) {
        deleteTestEnvValue(key);
      }
      process.env.HTTPS_PROXY = "http://127.0.0.1:9";

      setTestEnvValue("HOME", tempHome);
      setTestEnvValue("BOT_STATE_DIR", path.join(tempHome, ".bot"));
      process.env.BOT_SKIP_CHANNELS = "1";
      process.env.BOT_SKIP_GMAIL_WATCHER = "1";
      process.env.BOT_SKIP_CRON = "1";
      process.env.BOT_SKIP_CANVAS_HOST = "1";
      process.env.BOT_SKIP_BROWSER_CONTROL_SERVER = "1";
      process.env.BOT_SKIP_PROVIDERS = "1";
      process.env.BOT_TEST_MINIMAL_GATEWAY = "1";
      process.env.BOT_BUNDLED_PLUGINS_DIR = path.join(tempHome, "empty-bundled-plugins");
      await fs.mkdir(process.env.BOT_BUNDLED_PLUGINS_DIR, { recursive: true });

      const token = `proxy-token-${process.pid}-${process.env.VITEST_POOL_ID ?? "0"}`;
      process.env.BOT_GATEWAY_TOKEN = token;
      const configPath = path.join(tempHome, ".bot", "bot.json");
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(
        configPath,
        `${JSON.stringify({ gateway: { auth: { mode: "token", token } } }, null, 2)}\n`,
      );
      setTestEnvValue("BOT_CONFIG_PATH", configPath);

      server = await startGatewayServer(await getFreeGatewayPort(), {
        bind: "loopback",
        auth: { mode: "token", token },
        controlUiEnabled: false,
      });

      expect(isEnvHttpProxyDispatcher(getGlobalDispatcher())).toBe(true);
    } finally {
      await server?.close({ reason: "gateway proxy bootstrap test complete" });
      const dispatcherToClose = getGlobalDispatcher();
      setGlobalDispatcher(originalDispatcher);
      if (dispatcherToClose !== originalDispatcher) {
        await closeTestDispatcher(dispatcherToClose);
      }
      await fs.rm(tempHome, { recursive: true, force: true });
      envSnapshot.restore();
    }
  });
});
