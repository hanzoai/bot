// Qqbot tests cover platform plugin behavior.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getHomeDir,
  getQQBotDataDir,
  getQQBotMediaPath,
  resolveQQBotPayloadLocalFilePath,
} from "./platform.js";

function getQQBotDataPath(...subPaths: string[]): string {
  return getQQBotDataDir(...subPaths);
}

function resolveQQBotLocalMediaPath(p: string): string | null {
  return resolveQQBotPayloadLocalFilePath(p);
}

describe("qqbot local media path remapping", () => {
  const createdPaths: string[] = [];

  function createBotTestRoot() {
    const actualHome = getHomeDir();
    const botDir = path.join(actualHome, ".bot");
    fs.mkdirSync(botDir, { recursive: true });
    const testRoot = fs.mkdtempSync(path.join(botDir, "qqbot-platform-test-"));
    createdPaths.push(testRoot);
    return { actualHome, testRootName: path.basename(testRoot) };
  }

  function createQqbotMediaFile(fileName: string) {
    const { actualHome, testRootName } = createBotTestRoot();
    const mediaFile = path.join(
      actualHome,
      ".bot",
      "media",
      "qqbot",
      "downloads",
      testRootName,
      fileName,
    );
    fs.mkdirSync(path.dirname(mediaFile), { recursive: true });
    fs.writeFileSync(mediaFile, "image", "utf8");
    createdPaths.push(path.dirname(mediaFile));
    return { actualHome, testRootName, mediaFile };
  }

  afterEach(() => {
    vi.restoreAllMocks();
    for (const target of createdPaths.splice(0)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });

  it("remaps missing workspace media paths to the real media directory", () => {
    const { actualHome, testRootName, mediaFile } = createQqbotMediaFile("example.png");

    const missingWorkspacePath = path.join(
      actualHome,
      ".bot",
      "workspace",
      "qqbot",
      "downloads",
      testRootName,
      "example.png",
    );

    expect(resolveQQBotLocalMediaPath(missingWorkspacePath)).toBe(mediaFile);
  });

  it("leaves existing media paths unchanged", () => {
    const { mediaFile } = createQqbotMediaFile("existing.png");

    expect(resolveQQBotLocalMediaPath(mediaFile)).toBe(mediaFile);
  });

  it("blocks structured payload files outside QQ Bot storage", () => {
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "qqbot-platform-outside-"));
    createdPaths.push(outsideRoot);

    const outsideFile = path.join(outsideRoot, "secret.txt");
    fs.writeFileSync(outsideFile, "secret", "utf8");

    expect(resolveQQBotPayloadLocalFilePath(outsideFile)).toBeNull();
  });

  it("blocks structured payload paths that escape QQ Bot media via '..'", () => {
    const escapedPath = path.join(
      getHomeDir(),
      ".bot",
      "media",
      "qqbot",
      "..",
      "..",
      "qqbot-escape.txt",
    );

    expect(resolveQQBotPayloadLocalFilePath(escapedPath)).toBeNull();
  });

  it("allows structured payload files inside the QQ Bot media directory", () => {
    const { mediaFile } = createQqbotMediaFile("allowed.png");

    expect(resolveQQBotPayloadLocalFilePath(mediaFile)).toBe(fs.realpathSync(mediaFile));
  });

  it("allows structured payload files inside sibling Bot media subdirectories", () => {
    // Core helpers such as `saveMediaBuffer(..., "outbound", ...)` place framework
    // attachments under sibling directories of `media/qqbot/`. The plugin must
    // trust the shared `~/.bot/media` root so auto-routed sends can access
    // those files without the path-outside-storage guard firing.
    const actualHome = getHomeDir();
    const outboundDir = path.join(actualHome, ".bot", "media", "outbound");
    fs.mkdirSync(outboundDir, { recursive: true });
    const outboundFile = fs.mkdtempSync(path.join(outboundDir, "qqbot-outbound-"));
    const mediaFile = path.join(outboundFile, "tts.mp3");
    fs.writeFileSync(mediaFile, "audio", "utf8");
    createdPaths.push(outboundFile);

    expect(resolveQQBotPayloadLocalFilePath(mediaFile)).toBe(fs.realpathSync(mediaFile));
  });

  it("blocks structured payload files inside the QQ Bot data directory", () => {
    const { actualHome, testRootName } = createBotTestRoot();

    const dataFile = path.join(
      actualHome,
      ".bot",
      "qqbot",
      "sessions",
      testRootName,
      "session.json",
    );
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.writeFileSync(dataFile, "{}", "utf8");
    createdPaths.push(path.dirname(dataFile));

    expect(resolveQQBotPayloadLocalFilePath(dataFile)).toBeNull();
  });

  it("allows legacy workspace paths when they remap into QQ Bot media storage", () => {
    const { actualHome, testRootName, mediaFile } = createQqbotMediaFile("legacy.png");

    const missingWorkspacePath = path.join(
      actualHome,
      ".bot",
      "workspace",
      "qqbot",
      "downloads",
      testRootName,
      "legacy.png",
    );

    expect(resolveQQBotPayloadLocalFilePath(missingWorkspacePath)).toBe(fs.realpathSync(mediaFile));
  });
});

// Regression coverage for https://github.com/hanzoai/bot/issues/83562 —
// when HOME and BOT_HOME diverge (Docker, multi-user hosts), QQ Bot media
// paths must be anchored on BOT_HOME so files written under
// `$BOT_HOME/.bot/media/qqbot/` are accepted by the outbound
// allowlist.
//
// Tests intentionally do NOT mock `os.homedir()` — the helper reads it via
// `import * as os from "node:os"` which `vi.spyOn` cannot reliably intercept
// across the ESM/CJS interop boundary. Instead each test treats the real OS
// home as the baseline and only varies `process.env.BOT_HOME`.
describe("qqbot media path resolution honors BOT_HOME (#83562)", () => {
  const tempPaths: string[] = [];
  const realOsHome = getHomeDir();

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    for (const target of tempPaths.splice(0)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });

  function makeFakeBotHome(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qqbot-oc-home-"));
    tempPaths.push(dir);
    return dir;
  }

  function isPathInsideOrEqual(candidate: string, parent: string): boolean {
    const relative = path.relative(parent, candidate);
    return (
      relative === "" ||
      (relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative))
    );
  }

  it("accepts files under $BOT_HOME/.bot/media/qqbot when BOT_HOME differs from HOME", () => {
    const fakeBotHome = makeFakeBotHome();
    vi.stubEnv("BOT_HOME", fakeBotHome);

    const mediaFile = path.join(fakeBotHome, ".bot", "media", "qqbot", "repro.png");
    // Sanity: the fixture must not be accepted by the previous HOME media root.
    // On Windows, `os.tmpdir()` commonly lives under the user profile, so a raw
    // HOME-prefix assertion would make this test fail for the wrong reason.
    const oldHomeMediaRoot = path.join(realOsHome, ".bot", "media", "qqbot");
    expect(isPathInsideOrEqual(mediaFile, oldHomeMediaRoot)).toBe(false);
    fs.mkdirSync(path.dirname(mediaFile), { recursive: true });
    fs.writeFileSync(mediaFile, "image", "utf8");

    expect(getQQBotMediaPath()).toBe(path.join(fakeBotHome, ".bot", "media", "qqbot"));
    expect(resolveQQBotPayloadLocalFilePath(mediaFile)).toBe(fs.realpathSync(mediaFile));
  });

  it("expands tilde-prefixed BOT_HOME against the OS home", () => {
    // Use a unique subdirectory name so we can clean it up safely without
    // touching anything that exists under the real home.
    const sub = `qqbot-tilde-${process.pid}-${Date.now()}`;
    const expectedHome = path.join(realOsHome, sub);
    tempPaths.push(expectedHome);
    vi.stubEnv("BOT_HOME", `~/${sub}`);

    expect(getQQBotMediaPath()).toBe(path.join(expectedHome, ".bot", "media", "qqbot"));

    const mediaFile = path.join(expectedHome, ".bot", "media", "qqbot", "tilde.png");
    fs.mkdirSync(path.dirname(mediaFile), { recursive: true });
    fs.writeFileSync(mediaFile, "image", "utf8");

    expect(resolveQQBotPayloadLocalFilePath(mediaFile)).toBe(fs.realpathSync(mediaFile));
  });

  it("falls back to OS home when BOT_HOME is unset (no regression)", () => {
    vi.stubEnv("BOT_HOME", "");

    expect(getQQBotMediaPath()).toBe(path.join(realOsHome, ".bot", "media", "qqbot"));
  });

  it("treats sentinel strings 'undefined' and 'null' as unset", () => {
    for (const sentinel of ["undefined", "null"]) {
      vi.stubEnv("BOT_HOME", sentinel);
      expect(getQQBotMediaPath()).toBe(path.join(realOsHome, ".bot", "media", "qqbot"));
    }
  });

  it("keeps persisted QQ Bot data anchored on the OS home (compatibility)", () => {
    const fakeBotHome = makeFakeBotHome();
    vi.stubEnv("BOT_HOME", fakeBotHome);

    // Persisted state (sessions, known users, refs) must NOT migrate when an
    // operator adds BOT_HOME — otherwise existing deployments would lose
    // their session state. Only the media root follows BOT_HOME.
    expect(getQQBotDataPath()).toBe(path.join(realOsHome, ".bot", "qqbot"));
  });

  it("rejects files that live under HOME tree when BOT_HOME is the active root", () => {
    const fakeBotHome = makeFakeBotHome();
    vi.stubEnv("BOT_HOME", fakeBotHome);

    // File under the HOME-side mirror — exactly the path that *worked* on
    // current main and *broke* the BOT_HOME setup. After the fix the
    // active media root is BOT_HOME, so a file under HOME is no longer
    // implicitly allowed unless it remaps via the existing workspace fallback.
    // Use a unique subdirectory so we never collide with real user media.
    const stale = `qqbot-stale-${process.pid}-${Date.now()}.png`;
    const homeOnlyFile = path.join(realOsHome, ".bot", "media", "qqbot", stale);
    tempPaths.push(homeOnlyFile);
    fs.mkdirSync(path.dirname(homeOnlyFile), { recursive: true });
    fs.writeFileSync(homeOnlyFile, "image", "utf8");

    expect(resolveQQBotPayloadLocalFilePath(homeOnlyFile)).toBeNull();
  });

  it("remaps workspace paths under either HOME or BOT_HOME to the BOT_HOME media root", () => {
    const fakeBotHome = makeFakeBotHome();
    vi.stubEnv("BOT_HOME", fakeBotHome);

    const baseName = `remap-${process.pid}-${Date.now()}`;

    // Real file lives under the BOT_HOME media tree.
    const mediaFile = path.join(
      fakeBotHome,
      ".bot",
      "media",
      "qqbot",
      "downloads",
      baseName,
      "remap.png",
    );
    fs.mkdirSync(path.dirname(mediaFile), { recursive: true });
    fs.writeFileSync(mediaFile, "image", "utf8");

    // Agent that only knows the HOME-relative workspace path should still
    // resolve to the real file thanks to the dual-tree workspace fallback.
    const homeWorkspaceDir = path.join(realOsHome, ".bot", "workspace", "qqbot");
    const homeWorkspacePath = path.join(homeWorkspaceDir, "downloads", baseName, "remap.png");
    // Track for cleanup; we only created the unique baseName subdir indirectly
    // through resolveQQBotLocalMediaPath, which does NOT actually create the
    // HOME-side path, so nothing to clean up there beyond the BOT_HOME tree.
    expect(resolveQQBotLocalMediaPath(homeWorkspacePath)).toBe(mediaFile);

    // Same path but under BOT_HOME should also remap.
    const botWorkspacePath = path.join(
      fakeBotHome,
      ".bot",
      "workspace",
      "qqbot",
      "downloads",
      baseName,
      "remap.png",
    );
    expect(resolveQQBotLocalMediaPath(botWorkspacePath)).toBe(mediaFile);
  });
});
