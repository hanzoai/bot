import type { BotPluginApi } from "./plugin-api.types.js";
import type { BotPluginConfigSchema } from "./plugin-config-schema.types.js";
import type { PluginKind } from "./plugin-kind.types.js";
import type {
  BotPluginReloadRegistration,
  BotPluginSecurityAuditCollector,
} from "./plugin-registration.types.js";
import type { BotPluginNodeHostCommand } from "./types.node-host.js";

/** Module-level plugin definition loaded from a native plugin entry file. */
export type BotPluginDefinition = {
  id?: string;
  name?: string;
  description?: string;
  version?: string;
  /**
   * @deprecated Declare exclusive plugin kind in `bot.plugin.json` via
   * manifest `kind`. Runtime-exported `kind` is kept as a compatibility
   * fallback for older plugins and may require loading plugin runtime on
   * metadata-only command paths.
   */
  kind?: PluginKind | PluginKind[];
  configSchema?: BotPluginConfigSchema;
  reload?: BotPluginReloadRegistration;
  nodeHostCommands?: BotPluginNodeHostCommand[];
  securityAuditCollectors?: BotPluginSecurityAuditCollector[];
  register?: (api: BotPluginApi) => void;
};

export type BotPluginModule = BotPluginDefinition | ((api: BotPluginApi) => void);
