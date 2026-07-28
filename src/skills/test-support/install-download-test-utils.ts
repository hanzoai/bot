// Install download test utilities provide isolated state and workspace paths.
import {
  createBotTestState,
  type BotTestState,
} from "../../test-utils/bot-test-state.js";

/** Creates isolated Bot state for install download tests. */
export async function createInstallDownloadTestState(): Promise<BotTestState> {
  return await createBotTestState({
    layout: "state-only",
    prefix: "bot-skills-install-",
  });
}
