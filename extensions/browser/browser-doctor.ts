/**
 * Browser doctor API barrel. It exposes legacy profile cleanup and Chrome MCP
 * readiness helpers for Bot doctor.
 */
export {
  detectLegacyClawdBrowserProfileResidue,
  maybeArchiveLegacyClawdBrowserProfileResidue,
  noteChromeMcpBrowserReadiness,
} from "./src/doctor-browser.js";
export type { LegacyClawdBrowserProfileResidue } from "./src/doctor-browser.js";
