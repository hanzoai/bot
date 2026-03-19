import type { HanzoBotConfig } from "../../config/types.js";

export type DirectoryConfigParams = {
  cfg: HanzoBotConfig;
  accountId?: string | null;
  query?: string | null;
  limit?: number | null;
};
