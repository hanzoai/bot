import "./legacy-oauth-sidecar.js";

type TestApi = { resetKeychainOnlyMigrationHint(): void };

function getTestApi(): TestApi {
  return (globalThis as Record<PropertyKey, unknown>)[
    Symbol.for("bot.legacyOAuthSidecarInternalTestApi")
  ] as TestApi;
}

export const legacyOAuthSidecarInternalTestUtils: TestApi = {
  resetKeychainOnlyMigrationHint(): void {
    getTestApi().resetKeychainOnlyMigrationHint();
  },
};
