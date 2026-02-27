import fs from "node:fs/promises";
import path from "node:path";
import type { GatewayRequestHandlers } from "./types.js";
import { resolveAgentDir } from "../../agents/agent-scope.js";
import {
  TEAM_PRESETS,
  getTeamPreset,
  presetToIdentityMd,
  presetToSoulMd,
  presetToAgentEntry,
} from "../../agents/team-presets.js";
import {
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_SOUL_FILENAME,
  ensureAgentWorkspace,
} from "../../agents/workspace.js";
import {
  applyAgentConfig,
  findAgentEntryIndex,
  listAgentEntries,
} from "../../commands/agents.config.js";
import { loadConfig, writeConfigFile } from "../../config/config.js";
import { resolveSessionTranscriptsDirForAgent } from "../../config/sessions/paths.js";
import { normalizeAgentId, DEFAULT_AGENT_ID } from "../../routing/session-key.js";
import { resolveUserPath } from "../../utils.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

export const teamHandlers: GatewayRequestHandlers = {
  /**
   * List all available team presets.
   */
  "team.presets.list": ({ respond }) => {
    const presets = TEAM_PRESETS.map((p) => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      role: p.role,
      description: p.description,
    }));
    respond(true, presets, undefined);
  },

  /**
   * Get a single team preset by ID.
   */
  "team.presets.get": ({ params, respond }) => {
    const presetId = String((params.presetId as string) ?? "")
      .trim()
      .toLowerCase();
    if (!presetId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "presetId is required"));
      return;
    }

    const preset = getTeamPreset(presetId);
    if (!preset) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `unknown preset "${presetId}"`),
      );
      return;
    }

    respond(true, preset, undefined);
  },

  /**
   * Provision a single team preset as an agent.
   * Creates workspace, writes identity/soul files, and updates config.
   */
  "team.provision": async ({ params, respond }) => {
    const presetId = String((params.presetId as string) ?? "")
      .trim()
      .toLowerCase();
    if (!presetId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "presetId is required"));
      return;
    }

    const preset = getTeamPreset(presetId);
    if (!preset) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `unknown preset "${presetId}"`),
      );
      return;
    }

    const agentId = normalizeAgentId(preset.id);
    if (agentId === DEFAULT_AGENT_ID) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `"${DEFAULT_AGENT_ID}" is reserved`),
      );
      return;
    }

    const cfg = loadConfig();

    // Skip if agent already exists
    if (findAgentEntryIndex(listAgentEntries(cfg), agentId) >= 0) {
      respond(true, { ok: true, agentId, alreadyExists: true }, undefined);
      return;
    }

    const workspaceDir = resolveUserPath(
      typeof params.workspace === "string" && params.workspace.trim()
        ? params.workspace.trim()
        : "",
    );

    // Apply agent config
    const entry = presetToAgentEntry(preset);
    let nextConfig = applyAgentConfig(cfg, {
      agentId,
      name: preset.name,
      workspace: workspaceDir || undefined,
    });
    const agentDir = resolveAgentDir(nextConfig, agentId);
    nextConfig = applyAgentConfig(nextConfig, {
      agentId,
      agentDir,
      ...entry,
    });

    // Ensure workspace exists
    const skipBootstrap = Boolean(nextConfig.agents?.defaults?.skipBootstrap);
    const ws = await ensureAgentWorkspace({
      dir: workspaceDir || undefined,
      ensureBootstrapFiles: !skipBootstrap,
    });
    await fs.mkdir(resolveSessionTranscriptsDirForAgent(agentId), { recursive: true });

    // Write identity file
    const identityPath = path.join(ws.dir, DEFAULT_IDENTITY_FILENAME);
    await fs.writeFile(identityPath, presetToIdentityMd(preset), "utf-8");

    // Write soul file
    const soulPath = path.join(ws.dir, DEFAULT_SOUL_FILENAME);
    await fs.writeFile(soulPath, presetToSoulMd(preset), "utf-8");

    // Persist config
    await writeConfigFile(nextConfig);

    respond(true, { ok: true, agentId, name: preset.name, workspace: ws.dir }, undefined);
  },

  /**
   * Provision all team presets at once.
   * Skips any that already exist.
   */
  "team.provision.all": async ({ params: _params, respond }) => {
    const cfg = loadConfig();
    const existingEntries = listAgentEntries(cfg);
    const results: Array<{
      agentId: string;
      name: string;
      status: "created" | "exists" | "error";
      error?: string;
    }> = [];

    let currentConfig = cfg;

    for (const preset of TEAM_PRESETS) {
      const agentId = normalizeAgentId(preset.id);

      if (agentId === DEFAULT_AGENT_ID) {
        results.push({
          agentId,
          name: preset.name,
          status: "error",
          error: "reserved agent id",
        });
        continue;
      }

      if (findAgentEntryIndex(existingEntries, agentId) >= 0) {
        results.push({ agentId, name: preset.name, status: "exists" });
        continue;
      }

      try {
        const entry = presetToAgentEntry(preset);
        currentConfig = applyAgentConfig(currentConfig, {
          agentId,
          name: preset.name,
        });
        const agentDir = resolveAgentDir(currentConfig, agentId);
        currentConfig = applyAgentConfig(currentConfig, {
          agentId,
          agentDir,
          ...entry,
        });

        const skipBootstrap = Boolean(currentConfig.agents?.defaults?.skipBootstrap);
        const ws = await ensureAgentWorkspace({
          ensureBootstrapFiles: !skipBootstrap,
        });
        await fs.mkdir(resolveSessionTranscriptsDirForAgent(agentId), {
          recursive: true,
        });

        // Write identity + soul
        const identityPath = path.join(ws.dir, DEFAULT_IDENTITY_FILENAME);
        await fs.writeFile(identityPath, presetToIdentityMd(preset), "utf-8");
        const soulPath = path.join(ws.dir, DEFAULT_SOUL_FILENAME);
        await fs.writeFile(soulPath, presetToSoulMd(preset), "utf-8");

        results.push({ agentId, name: preset.name, status: "created" });
      } catch (err) {
        results.push({
          agentId,
          name: preset.name,
          status: "error",
          error: (err as Error).message,
        });
      }
    }

    // Write config once for all agents
    await writeConfigFile(currentConfig);

    const created = results.filter((r) => r.status === "created").length;
    const existing = results.filter((r) => r.status === "exists").length;

    respond(true, { ok: true, created, existing, total: TEAM_PRESETS.length, results }, undefined);
  },
};
