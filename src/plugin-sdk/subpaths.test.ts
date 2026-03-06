import * as compatSdk from "@hanzo/bot/plugin-sdk/compat";
import * as discordSdk from "@hanzo/bot/plugin-sdk/discord";
import * as imessageSdk from "@hanzo/bot/plugin-sdk/imessage";
import * as lineSdk from "@hanzo/bot/plugin-sdk/line";
import * as msteamsSdk from "@hanzo/bot/plugin-sdk/msteams";
import * as signalSdk from "@hanzo/bot/plugin-sdk/signal";
import * as slackSdk from "@hanzo/bot/plugin-sdk/slack";
import * as telegramSdk from "@hanzo/bot/plugin-sdk/telegram";
import * as whatsappSdk from "@hanzo/bot/plugin-sdk/whatsapp";
import { describe, expect, it } from "vitest";

const bundledExtensionSubpathLoaders = [
  { id: "acpx", load: () => import("@hanzo/bot/plugin-sdk/acpx") },
  { id: "bluebubbles", load: () => import("@hanzo/bot/plugin-sdk/bluebubbles") },
  { id: "copilot-proxy", load: () => import("@hanzo/bot/plugin-sdk/copilot-proxy") },
  { id: "device-pair", load: () => import("@hanzo/bot/plugin-sdk/device-pair") },
  { id: "diagnostics-otel", load: () => import("@hanzo/bot/plugin-sdk/diagnostics-otel") },
  { id: "diffs", load: () => import("@hanzo/bot/plugin-sdk/diffs") },
  { id: "feishu", load: () => import("@hanzo/bot/plugin-sdk/feishu") },
  {
    id: "google-gemini-cli-auth",
    load: () => import("@hanzo/bot/plugin-sdk/google-gemini-cli-auth"),
  },
  { id: "googlechat", load: () => import("@hanzo/bot/plugin-sdk/googlechat") },
  { id: "irc", load: () => import("@hanzo/bot/plugin-sdk/irc") },
  { id: "llm-task", load: () => import("@hanzo/bot/plugin-sdk/llm-task") },
  { id: "lobster", load: () => import("@hanzo/bot/plugin-sdk/lobster") },
  { id: "matrix", load: () => import("@hanzo/bot/plugin-sdk/matrix") },
  { id: "mattermost", load: () => import("@hanzo/bot/plugin-sdk/mattermost") },
  { id: "memory-core", load: () => import("@hanzo/bot/plugin-sdk/memory-core") },
  { id: "memory-lancedb", load: () => import("@hanzo/bot/plugin-sdk/memory-lancedb") },
  {
    id: "minimax-portal-auth",
    load: () => import("@hanzo/bot/plugin-sdk/minimax-portal-auth"),
  },
  { id: "nextcloud-talk", load: () => import("@hanzo/bot/plugin-sdk/nextcloud-talk") },
  { id: "nostr", load: () => import("@hanzo/bot/plugin-sdk/nostr") },
  { id: "open-prose", load: () => import("@hanzo/bot/plugin-sdk/open-prose") },
  { id: "phone-control", load: () => import("@hanzo/bot/plugin-sdk/phone-control") },
  { id: "qwen-portal-auth", load: () => import("@hanzo/bot/plugin-sdk/qwen-portal-auth") },
  { id: "synology-chat", load: () => import("@hanzo/bot/plugin-sdk/synology-chat") },
  { id: "talk-voice", load: () => import("@hanzo/bot/plugin-sdk/talk-voice") },
  { id: "test-utils", load: () => import("@hanzo/bot/plugin-sdk/test-utils") },
  { id: "thread-ownership", load: () => import("@hanzo/bot/plugin-sdk/thread-ownership") },
  { id: "tlon", load: () => import("@hanzo/bot/plugin-sdk/tlon") },
  { id: "twitch", load: () => import("@hanzo/bot/plugin-sdk/twitch") },
  { id: "voice-call", load: () => import("@hanzo/bot/plugin-sdk/voice-call") },
  { id: "zalo", load: () => import("@hanzo/bot/plugin-sdk/zalo") },
  { id: "zalouser", load: () => import("@hanzo/bot/plugin-sdk/zalouser") },
] as const;

describe("plugin-sdk subpath exports", () => {
  it("exports compat helpers", () => {
    expect(typeof compatSdk.emptyPluginConfigSchema).toBe("function");
    expect(typeof compatSdk.resolveControlCommandGate).toBe("function");
  });

  it("exports Discord helpers", () => {
    expect(typeof discordSdk.resolveDiscordAccount).toBe("function");
    expect(typeof discordSdk.inspectDiscordAccount).toBe("function");
    expect(typeof discordSdk.discordOnboardingAdapter).toBe("object");
  });

  it("exports Slack helpers", () => {
    expect(typeof slackSdk.resolveSlackAccount).toBe("function");
    expect(typeof slackSdk.inspectSlackAccount).toBe("function");
    expect(typeof slackSdk.handleSlackMessageAction).toBe("function");
  });

  it("exports Telegram helpers", () => {
    expect(typeof telegramSdk.resolveTelegramAccount).toBe("function");
    expect(typeof telegramSdk.inspectTelegramAccount).toBe("function");
    expect(typeof telegramSdk.telegramOnboardingAdapter).toBe("object");
  });

  it("exports Signal helpers", () => {
    expect(typeof signalSdk.resolveSignalAccount).toBe("function");
    expect(typeof signalSdk.signalOnboardingAdapter).toBe("object");
  });

  it("exports iMessage helpers", () => {
    expect(typeof imessageSdk.resolveIMessageAccount).toBe("function");
    expect(typeof imessageSdk.imessageOnboardingAdapter).toBe("object");
  });

  it("exports WhatsApp helpers", () => {
    expect(typeof whatsappSdk.resolveWhatsAppAccount).toBe("function");
    expect(typeof whatsappSdk.whatsappOnboardingAdapter).toBe("object");
  });

  it("exports LINE helpers", () => {
    expect(typeof lineSdk.processLineMessage).toBe("function");
    expect(typeof lineSdk.createInfoCard).toBe("function");
  });

  it("exports Microsoft Teams helpers", () => {
    expect(typeof msteamsSdk.resolveControlCommandGate).toBe("function");
    expect(typeof msteamsSdk.loadOutboundMediaFromUrl).toBe("function");
  });

  it("resolves bundled extension subpaths", async () => {
    for (const { id, load } of bundledExtensionSubpathLoaders) {
      const mod = await load();
      expect(typeof mod).toBe("object");
      expect(mod, `subpath ${id} should resolve`).toBeTruthy();
    }
  });
});
