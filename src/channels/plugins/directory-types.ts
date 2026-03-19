import type { Hanzo BotConfig } from "../../config/types.js";

export type DirectoryConfigParams = {
  cfg: Hanzo BotConfig;
  accountId?: string | null;
  query?: string | null;
  limit?: number | null;
};
