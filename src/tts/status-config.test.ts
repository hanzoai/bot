// TTS status config tests cover status file path and config resolution.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BotConfig } from "../config/types.js";
import { withEnvAsync } from "../test-utils/env.js";
import { resolveStatusTtsSnapshot } from "./status-config.js";

let fixtureRoot = "";
let fixtureId = 0;

beforeAll(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bot-tts-status-"));
});

afterAll(() => {
  if (fixtureRoot) {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

async function withStatusTempHome(run: (home: string) => Promise<void>): Promise<void> {
  const home = path.join(fixtureRoot, `case-${fixtureId++}`);
  fs.mkdirSync(home, { recursive: true });
  await withEnvAsync(
    {
      HOME: home,
      USERPROFILE: home,
      BOT_HOME: undefined,
      BOT_STATE_DIR: path.join(home, ".bot"),
    },
    async () => await run(home),
  );
}

describe("resolveStatusTtsSnapshot", () => {
  it("treats null prefs as empty settings", async () => {
    await withStatusTempHome(async (home) => {
      const prefsPath = path.join(home, ".bot", "settings", "tts.json");
      fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
      fs.writeFileSync(prefsPath, "null");

      expect(
        resolveStatusTtsSnapshot({
          cfg: {
            tts: {
              auto: "always",
              provider: "edge",
              prefsPath,
            },
          } as BotConfig,
        }),
      ).toEqual({
        autoMode: "always",
        provider: "microsoft",
        maxLength: 1500,
        summarize: true,
      });
    });
  });

  it("uses prefs overrides without loading speech providers", async () => {
    await withStatusTempHome(async (home) => {
      const prefsPath = path.join(home, ".bot", "settings", "tts.json");
      fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
      fs.writeFileSync(
        prefsPath,
        JSON.stringify({
          tts: {
            auto: "always",
            provider: "edge",
            maxLength: 2048,
            summarize: false,
          },
        }),
      );

      expect(
        resolveStatusTtsSnapshot({
          cfg: {
            tts: {
              prefsPath,
            },
          } as BotConfig,
        }),
      ).toEqual({
        autoMode: "always",
        provider: "microsoft",
        maxLength: 2048,
        summarize: false,
      });
    });
  });

  it("reports auto provider when tts is on without an explicit provider", async () => {
    await withStatusTempHome(async () => {
      expect(
        resolveStatusTtsSnapshot({
          cfg: {
            tts: {
              auto: "always",
            },
          } as BotConfig,
        }),
      ).toEqual({
        autoMode: "always",
        provider: "auto",
        maxLength: 1500,
        summarize: true,
      });
    });
  });

  it("reports per-agent TTS overrides", async () => {
    await withStatusTempHome(async () => {
      expect(
        resolveStatusTtsSnapshot({
          cfg: {
            tts: {
              auto: "off",
              provider: "openai",
            },
            agents: {
              list: [
                {
                  id: "reader",
                  tts: {
                    auto: "always",
                    provider: "elevenlabs",
                  },
                },
              ],
            },
          } as BotConfig,
          agentId: "reader",
        }),
      ).toEqual({
        autoMode: "always",
        provider: "elevenlabs",
        maxLength: 1500,
        summarize: true,
      });
    });
  });

  it("reports per-agent persona provider over global persona", async () => {
    await withStatusTempHome(async () => {
      expect(
        resolveStatusTtsSnapshot({
          cfg: {
            tts: {
              auto: "always",
              persona: "alfred",
              personas: {
                alfred: { provider: "google" },
                jarvis: { provider: "edge" },
              },
            },
            agents: {
              list: [
                {
                  id: "reader",
                  tts: {
                    persona: "jarvis",
                  },
                },
              ],
            },
          } as BotConfig,
          agentId: "reader",
        }),
      ).toEqual({
        autoMode: "always",
        provider: "microsoft",
        persona: "jarvis",
        maxLength: 1500,
        summarize: true,
      });
    });
  });

  it("reports configured OpenAI TTS model, voice, and sanitized custom endpoint", async () => {
    await withStatusTempHome(async () => {
      expect(
        resolveStatusTtsSnapshot({
          cfg: {
            tts: {
              auto: "always",
              provider: "openai",
              providers: {
                openai: {
                  displayName: "NeuTTS local",
                  baseUrl: "http://username@127.0.0.1:18801/v1?token=hidden#fragment",
                  model: "neutts-nano",
                  voice: "clara",
                },
              },
            },
          } as BotConfig,
        }),
      ).toEqual({
        autoMode: "always",
        provider: "openai",
        displayName: "NeuTTS local",
        model: "neutts-nano",
        voice: "clara",
        baseUrl: "http://127.0.0.1:18801/v1",
        customBaseUrl: true,
        maxLength: 1500,
        summarize: true,
      });
    });
  });

  it("keeps truncated status detail fields well-formed at UTF-16 boundaries", async () => {
    await withStatusTempHome(async () => {
      const displayName = `${"d".repeat(92)}😀tail`;
      const model = `${"m".repeat(92)}😀tail`;
      const voice = `${"v".repeat(92)}😀tail`;
      const snapshot = resolveStatusTtsSnapshot({
        cfg: {
          tts: {
            auto: "always",
            provider: "elevenlabs",
            providers: {
              elevenlabs: {
                displayName,
                model,
                voice,
              },
            },
          },
        } as BotConfig,
      });

      expect(snapshot?.displayName).toBe(`${"d".repeat(92)}...`);
      expect(snapshot?.model).toBe(`${"m".repeat(92)}...`);
      expect(snapshot?.voice).toBe(`${"v".repeat(92)}...`);
    });
  });

  it("omits default OpenAI endpoint details from status", async () => {
    await withStatusTempHome(async () => {
      expect(
        resolveStatusTtsSnapshot({
          cfg: {
            tts: {
              auto: "always",
              provider: "openai",
              providers: {
                openai: {
                  baseUrl: "https://api.openai.com/v1/",
                  model: "gpt-4o-mini-tts",
                  voice: "coral",
                },
              },
            },
          } as BotConfig,
        }),
      ).toEqual({
        autoMode: "always",
        provider: "openai",
        model: "gpt-4o-mini-tts",
        voice: "coral",
        maxLength: 1500,
        summarize: true,
      });
    });
  });

  it("reports migrated canonical speaker voice fields", async () => {
    await withStatusTempHome(async () => {
      expect(
        resolveStatusTtsSnapshot({
          cfg: {
            tts: {
              auto: "always",
              provider: "elevenlabs",
              providers: {
                elevenlabs: {
                  speakerVoiceId: "voice-123",
                },
              },
            },
          } as BotConfig,
        }),
      ).toEqual({
        autoMode: "always",
        provider: "elevenlabs",
        voice: "voice-123",
        maxLength: 1500,
        summarize: true,
      });
    });
  });

  it("reports merged per-agent provider metadata", async () => {
    await withStatusTempHome(async () => {
      expect(
        resolveStatusTtsSnapshot({
          cfg: {
            tts: {
              auto: "off",
              provider: "openai",
              providers: {
                openai: {
                  model: "gpt-4o-mini-tts",
                  voice: "coral",
                },
              },
            },
            agents: {
              list: [
                {
                  id: "reader",
                  tts: {
                    auto: "always",
                    providers: {
                      openai: {
                        voice: "nova",
                      },
                    },
                  },
                },
              ],
            },
          } as BotConfig,
          agentId: "reader",
        }),
      ).toEqual({
        autoMode: "always",
        provider: "openai",
        model: "gpt-4o-mini-tts",
        voice: "nova",
        maxLength: 1500,
        summarize: true,
      });
    });
  });

  it("uses provider metadata for local provider prefs overrides", async () => {
    await withStatusTempHome(async (home) => {
      const prefsPath = path.join(home, ".bot", "settings", "tts.json");
      fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
      fs.writeFileSync(
        prefsPath,
        JSON.stringify({
          tts: {
            auto: "always",
            provider: "edge",
          },
        }),
      );

      expect(
        resolveStatusTtsSnapshot({
          cfg: {
            tts: {
              provider: "openai",
              prefsPath,
              providers: {
                microsoft: {
                  voice: "en-US-AvaMultilingualNeural",
                },
                openai: {
                  model: "gpt-4o-mini-tts",
                  voice: "coral",
                },
              },
            },
          } as BotConfig,
        }),
      ).toEqual({
        autoMode: "always",
        provider: "microsoft",
        voice: "en-US-AvaMultilingualNeural",
        maxLength: 1500,
        summarize: true,
      });
    });
  });

  it("derives the default prefs path from BOT_CONFIG_PATH when set", async () => {
    await withStatusTempHome(async (home) => {
      const stateDir = path.join(home, ".bot-dev");
      const prefsPath = path.join(stateDir, "settings", "tts.json");
      fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
      fs.writeFileSync(
        prefsPath,
        JSON.stringify({
          tts: {
            auto: "always",
            provider: "openai",
          },
        }),
      );

      await withEnvAsync(
        {
          BOT_STATE_DIR: undefined,
          BOT_CONFIG_PATH: path.join(stateDir, "bot.json"),
        },
        async () => {
          expect(
            resolveStatusTtsSnapshot({
              cfg: {
                tts: {},
              } as BotConfig,
            }),
          ).toEqual({
            autoMode: "always",
            provider: "openai",
            maxLength: 1500,
            summarize: true,
          });
        },
      );
    });
  });
});
