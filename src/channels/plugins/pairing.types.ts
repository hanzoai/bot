/**
 * Channel pairing adapter types.
 *
 * Defines setup/allowlist approval hooks used by pairing flows.
 */
import type { BotConfig } from "../../config/types.bot.js";
import type { RuntimeEnv } from "../../runtime.js";

/**
 * Channel pairing hooks used by setup and allowlist approval flows.
 */
export type ChannelPairingAdapter = {
  idLabel: string;
  normalizeAllowEntry?: (entry: string) => string;
  /** Derive the persisted approval entry from the locally issued request. */
  resolveApprovalStoreEntry?: (request: {
    id: string;
    meta?: Record<string, string>;
  }) => string | null | undefined;
  notifyApproval?: (params: {
    cfg: BotConfig;
    id: string;
    accountId?: string;
    runtime?: RuntimeEnv;
  }) => Promise<void>;
};
