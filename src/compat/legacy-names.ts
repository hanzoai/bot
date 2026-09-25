export const PROJECT_NAME = "bot" as const;

export const LEGACY_PROJECT_NAMES = [] as const;

export const MANIFEST_KEY = PROJECT_NAME;

/**
 * SKILL.md and HOOK.md metadata blocks read after MANIFEST_KEY, in order:
 * "hanzo-bot" is how this repo's own skills and docs spell it, "openclaw" and
 * "clawdbot" how ClawHub skills do. hanzobot/go reads the same four, so a
 * skill gates the same way under either runtime.
 */
export const LEGACY_MANIFEST_KEYS = ["hanzo-bot", "openclaw", "clawdbot"] as const;

export const MACOS_APP_SOURCES_DIR = "apps/macos/Sources/HanzoBot" as const;
