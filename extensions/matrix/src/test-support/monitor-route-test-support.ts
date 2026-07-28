// Matrix plugin module implements monitor route test support behavior.
export {
  registerSessionBindingAdapter,
  testing,
} from "bot/plugin-sdk/session-binding-runtime";
export { resolveAgentRoute } from "bot/plugin-sdk/routing";
export {
  createTestRegistry,
  setActivePluginRegistry,
} from "bot/plugin-sdk/plugin-test-runtime";
export type { BotConfig } from "bot/plugin-sdk/config-contracts";
