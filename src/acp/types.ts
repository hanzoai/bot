/** ACP protocol helpers and Bot agent identity metadata. */
export { normalizeAcpProvenanceMode } from "@hanzo/bot-acp-core/types";
import { VERSION } from "../version.js";

/** ACP agent identity advertised during protocol initialization. */
export const ACP_AGENT_INFO = {
  name: "bot-acp",
  title: "Bot ACP Gateway",
  version: VERSION,
};
