import type { DIDConfig, WalletConfig } from "../../config/types.base.js";
import type { GatewayRequestHandlers } from "./types.js";
import { CHAIN_IDS } from "../../agents/team-presets.js";
import {
  applyAgentConfig,
  findAgentEntryIndex,
  listAgentEntries,
} from "../../commands/agents.config.js";
import { loadConfig, writeConfigFile } from "../../config/config.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

/**
 * Build a DID URI from method + identifier.
 * Format: did:<method>:<identifier>
 */
function buildDIDUri(method: string, identifier: string): string {
  return `did:${method}:${identifier}`;
}

/**
 * Derive a deterministic agent identifier for DID purposes.
 * In production this would use BIP32/39 HD derivation from a workspace seed.
 * For now, returns the agentId as the identifier stub.
 */
function deriveAgentIdentifier(agentId: string): string {
  return agentId;
}

export const identityHandlers: GatewayRequestHandlers = {
  /**
   * Get the DID configuration for an agent.
   */
  "agent.did.get": ({ params, respond }) => {
    const agentId = normalizeAgentId(String((params.agentId as string) ?? "").trim());
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }

    const cfg = loadConfig();
    const entries = listAgentEntries(cfg);
    const idx = findAgentEntryIndex(entries, agentId);
    if (idx < 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `agent not found: ${agentId}`),
      );
      return;
    }

    const entry = entries[idx];
    const identity = (entry as Record<string, unknown>).identity as
      | Record<string, unknown>
      | undefined;
    const did = identity?.did as DIDConfig | undefined;

    respond(true, { agentId, did: did ?? null }, undefined);
  },

  /**
   * Provision a DID for an agent.
   * Creates a did:<method>:<agentId> URI and persists it in agent config.
   */
  "agent.did.create": async ({ params, respond }) => {
    const agentId = normalizeAgentId(String((params.agentId as string) ?? "").trim());
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }

    const method = String(
      (params.method as string) ?? "hanzo",
    ).toLowerCase() as DIDConfig["method"];
    const validMethods = ["hanzo", "lux", "pars", "zoo", "ai"];
    if (!validMethods.includes(method!)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid DID method: ${method}. Use: ${validMethods.join(", ")}`,
        ),
      );
      return;
    }

    const cfg = loadConfig();
    const entries = listAgentEntries(cfg);
    if (findAgentEntryIndex(entries, agentId) < 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `agent not found: ${agentId}`),
      );
      return;
    }

    const identifier = deriveAgentIdentifier(agentId);
    const chainId = CHAIN_IDS[method as keyof typeof CHAIN_IDS] ?? CHAIN_IDS.hanzo;
    const uri = buildDIDUri(method!, identifier);

    const did: DIDConfig = { uri, method, chainId };

    // Read current identity and merge DID in
    const entry = entries[findAgentEntryIndex(entries, agentId)];
    const currentIdentity = (entry as Record<string, unknown>).identity as
      | Record<string, unknown>
      | undefined;

    const nextConfig = applyAgentConfig(cfg, {
      agentId,
      identity: {
        ...currentIdentity,
        did,
      } as Record<string, unknown>,
    } as Parameters<typeof applyAgentConfig>[1]);

    await writeConfigFile(nextConfig);

    respond(true, { agentId, did }, undefined);
  },

  /**
   * Get the wallet configuration for an agent.
   */
  "agent.wallet.get": ({ params, respond }) => {
    const agentId = normalizeAgentId(String((params.agentId as string) ?? "").trim());
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }

    const cfg = loadConfig();
    const entries = listAgentEntries(cfg);
    const idx = findAgentEntryIndex(entries, agentId);
    if (idx < 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `agent not found: ${agentId}`),
      );
      return;
    }

    const entry = entries[idx];
    const identity = (entry as Record<string, unknown>).identity as
      | Record<string, unknown>
      | undefined;
    const wallet = identity?.wallet as WalletConfig | undefined;

    respond(true, { agentId, wallet: wallet ?? null }, undefined);
  },

  /**
   * Provision a Safe wallet for an agent.
   * In production, this would:
   * 1. Derive an EOA keypair via BIP32 from workspace HD seed
   * 2. Deploy a Safe smart-contract wallet on the target chain
   * 3. Store the addresses in agent config
   *
   * For now, records the wallet chain config stub for the agent.
   */
  "agent.wallet.create": async ({ params, respond }) => {
    const agentId = normalizeAgentId(String((params.agentId as string) ?? "").trim());
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }

    const chain = String(
      (params.chain as string) ?? "hanzo",
    ).toLowerCase() as WalletConfig["chain"];
    const validChains = ["lux", "hanzo", "zoo", "pars"];
    if (!validChains.includes(chain!)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chain: ${chain}. Use: ${validChains.join(", ")}`,
        ),
      );
      return;
    }

    const cfg = loadConfig();
    const entries = listAgentEntries(cfg);
    if (findAgentEntryIndex(entries, agentId) < 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `agent not found: ${agentId}`),
      );
      return;
    }

    const chainId = CHAIN_IDS[chain as keyof typeof CHAIN_IDS] ?? CHAIN_IDS.hanzo;

    // Derivation path: m/44'/60'/0'/0/<agent-index>
    // In production, agent-index comes from workspace agent registry
    const derivationPath = `m/44'/60'/0'/0/0`;

    const wallet: WalletConfig = {
      chain,
      chainId,
      derivationPath,
      // address and safeAddress get populated when actual key derivation + Safe deploy runs
    };

    const entry = entries[findAgentEntryIndex(entries, agentId)];
    const currentIdentity = (entry as Record<string, unknown>).identity as
      | Record<string, unknown>
      | undefined;

    const nextConfig = applyAgentConfig(cfg, {
      agentId,
      identity: {
        ...currentIdentity,
        wallet,
      } as Record<string, unknown>,
    } as Parameters<typeof applyAgentConfig>[1]);

    await writeConfigFile(nextConfig);

    respond(true, { agentId, wallet }, undefined);
  },

  /**
   * Get full identity (DID + wallet + profile) for an agent.
   */
  "agent.identity.full": ({ params, respond }) => {
    const agentId = normalizeAgentId(String((params.agentId as string) ?? "").trim());
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId is required"));
      return;
    }

    const cfg = loadConfig();
    const entries = listAgentEntries(cfg);
    const idx = findAgentEntryIndex(entries, agentId);
    if (idx < 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `agent not found: ${agentId}`),
      );
      return;
    }

    const entry = entries[idx];
    const identity = (entry as Record<string, unknown>).identity as
      | Record<string, unknown>
      | undefined;

    respond(
      true,
      {
        agentId,
        name: identity?.name ?? null,
        emoji: identity?.emoji ?? null,
        avatar: identity?.avatar ?? null,
        did: identity?.did ?? null,
        wallet: identity?.wallet ?? null,
      },
      undefined,
    );
  },
};
