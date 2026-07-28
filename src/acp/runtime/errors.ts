/** ACP runtime error exports wired to Bot secret redaction. */
import { configureAcpErrorRedactor } from "@hanzo/bot-acp-core";
import { redactSensitiveText } from "../../logging/redact.js";

// Ensure ACP-core runtime errors use Bot's secret redaction before re-export.
configureAcpErrorRedactor(redactSensitiveText);

export * from "@hanzo/bot-acp-core/runtime/errors";
