import type { SessionEntry } from "../../config/sessions/types.js";
import type { CronJob } from "../../cron/types.js";
import type { AuthBlobs } from "./state.js";

/**
 * Pure conversions of OpenClaw records into the files Hanzo Bot reads. Field
 * lists are explicit: a field is carried only when Hanzo Bot defines it and
 * it means the same thing on this machine.
 */

type Json = Record<string, unknown>;

function isPlainObject(value: unknown): value is Json {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pick(source: Json, keys: readonly string[]): Json {
  const out: Json = {};
  for (const key of keys) {
    if (Object.hasOwn(source, key) && source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Auth profiles → agents/<id>/agent/auth-profiles.json
// ---------------------------------------------------------------------------

export type AuthProfilesFile = {
  version: 1;
  profiles: Record<string, Json>;
  order?: Record<string, string[]>;
  lastGood?: Record<string, string>;
};

function authParts(blobs: AuthBlobs | null | undefined) {
  const profiles = isPlainObject(blobs?.store?.profiles) ? blobs.store.profiles : {};
  // The file layout kept order/lastGood in the store; the database layout in state.
  const order = blobs?.state?.order ?? blobs?.store?.order;
  const lastGood = blobs?.state?.lastGood ?? blobs?.store?.lastGood;
  return {
    profiles: Object.fromEntries(
      Object.entries(profiles).filter((entry): entry is [string, Json] => isPlainObject(entry[1])),
    ),
    order: isPlainObject(order) ? (order as Record<string, string[]>) : {},
    lastGood: isPlainObject(lastGood) ? (lastGood as Record<string, string>) : {},
  };
}

/** Shared profiles overlaid by the agent's own; usage statistics are runtime state and are not carried. */
export function convertAuth(
  shared: AuthBlobs | null,
  local: AuthBlobs | undefined,
): AuthProfilesFile {
  const a = authParts(shared);
  const b = authParts(local);
  const file: AuthProfilesFile = { version: 1, profiles: { ...a.profiles, ...b.profiles } };
  const order = { ...a.order, ...b.order };
  const lastGood = { ...a.lastGood, ...b.lastGood };
  if (Object.keys(order).length > 0) {
    file.order = order;
  }
  if (Object.keys(lastGood).length > 0) {
    file.lastGood = lastGood;
  }
  return file;
}

/** Existing profiles, order and lastGood entries win. Returns the profile ids added. */
export function mergeAuth(
  existing: Json,
  incoming: AuthProfilesFile,
): { file: Json; added: string[] } {
  const file: Json = { ...existing, version: existing.version ?? 1 };
  const profiles = isPlainObject(existing.profiles) ? { ...existing.profiles } : {};
  const added: string[] = [];
  for (const [id, profile] of Object.entries(incoming.profiles)) {
    if (!Object.hasOwn(profiles, id)) {
      profiles[id] = profile;
      added.push(id);
    }
  }
  file.profiles = profiles;
  for (const key of ["order", "lastGood"] as const) {
    const merged = { ...incoming[key], ...(isPlainObject(existing[key]) ? existing[key] : {}) };
    if (Object.keys(merged).length > 0) {
      file[key] = merged;
    }
  }
  return { file, added };
}

// ---------------------------------------------------------------------------
// Sessions → agents/<id>/sessions/sessions.json
// ---------------------------------------------------------------------------

/**
 * The SessionEntry fields carried. Left out on purpose: sessionFile (Hanzo Bot
 * finds <sessionId>.jsonl beside sessions.json), skillsSnapshot and
 * systemPromptReport (they name OpenClaw's own skill and prompt files), and
 * acp (a live runtime handle).
 */
export const SESSION_FIELDS = [
  "sessionId",
  "updatedAt",
  "lastHeartbeatText",
  "lastHeartbeatSentAt",
  "spawnedBy",
  "forkedFromParent",
  "spawnDepth",
  "systemSent",
  "abortedLastRun",
  "abortCutoffMessageSid",
  "abortCutoffTimestamp",
  "chatType",
  "thinkingLevel",
  "verboseLevel",
  "reasoningLevel",
  "elevatedLevel",
  "ttsAuto",
  "execHost",
  "execSecurity",
  "execAsk",
  "execNode",
  "responseUsage",
  "providerOverride",
  "modelOverride",
  "authProfileOverride",
  "authProfileOverrideSource",
  "authProfileOverrideCompactionCount",
  "groupActivation",
  "groupActivationNeedsSystemIntro",
  "sendPolicy",
  "queueMode",
  "queueDebounceMs",
  "queueCap",
  "queueDrop",
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "totalTokensFresh",
  "cacheRead",
  "cacheWrite",
  "modelProvider",
  "model",
  "fallbackNoticeSelectedModel",
  "fallbackNoticeActiveModel",
  "fallbackNoticeReason",
  "contextTokens",
  "compactionCount",
  "memoryFlushAt",
  "memoryFlushCompactionCount",
  "cliSessionIds",
  "claudeCliSessionId",
  "label",
  "displayName",
  "channel",
  "groupId",
  "subject",
  "groupChannel",
  "space",
  "origin",
  "deliveryContext",
  "lastChannel",
  "lastTo",
  "lastAccountId",
  "lastThreadId",
] as const satisfies ReadonlyArray<keyof SessionEntry>;

export function convertSessionEntry(entry: Json): Json {
  return pick(entry, SESSION_FIELDS);
}

/** Hanzo Bot's archive name for an earlier transcript generation: <id>.jsonl.reset.<time>. */
export function resetArchiveName(sessionId: string, updatedAtMs: number): string {
  return `${sessionId}.jsonl.reset.${new Date(updatedAtMs).toISOString().replaceAll(":", "-")}`;
}

// ---------------------------------------------------------------------------
// Cron jobs → cron/jobs.json
// ---------------------------------------------------------------------------

const JOB_FIELDS = [
  "id",
  "agentId",
  "sessionKey",
  "name",
  "description",
  "enabled",
  "deleteAfterRun",
  "createdAtMs",
  "updatedAtMs",
  "schedule",
  "sessionTarget",
  "wakeMode",
  "payload",
  "delivery",
  "failureAlert",
] as const satisfies ReadonlyArray<keyof CronJob>;

const SCHEDULE_FIELDS: Record<string, readonly string[]> = {
  at: ["kind", "at"],
  every: ["kind", "everyMs", "anchorMs"],
  cron: ["kind", "expr", "tz", "staggerMs"],
};

const PAYLOAD_FIELDS: Record<string, readonly string[]> = {
  systemEvent: ["kind", "text"],
  agentTurn: [
    "kind",
    "message",
    "model",
    "fallbacks",
    "thinking",
    "timeoutSeconds",
    "allowUnsafeExternalContent",
    "lightContext",
    "deliver",
    "channel",
    "to",
    "bestEffortDeliver",
  ],
};

const DELIVERY_FIELDS = ["mode", "channel", "to", "accountId", "bestEffort", "failureDestination"];

export type CronConversion =
  | { ok: true; job: Json }
  | { ok: false; name: string; reason: "managed" | "payload" | "schedule" | "target" };

export function convertCronJob(job: Json): CronConversion {
  const name = typeof job.name === "string" ? job.name : String(job.id ?? "");
  if (typeof job.declarationKey === "string") {
    return { ok: false, name, reason: "managed" };
  }
  const schedule = isPlainObject(job.schedule) ? job.schedule : {};
  const scheduleFields = SCHEDULE_FIELDS[String(schedule.kind)];
  if (!scheduleFields) {
    return { ok: false, name, reason: "schedule" };
  }
  const payload = isPlainObject(job.payload) ? job.payload : {};
  const payloadFields = PAYLOAD_FIELDS[String(payload.kind)];
  if (!payloadFields) {
    return { ok: false, name, reason: "payload" };
  }
  if (job.sessionTarget !== "main" && job.sessionTarget !== "isolated") {
    return { ok: false, name, reason: "target" };
  }
  const out = pick(job, JOB_FIELDS);
  out.schedule = pick(schedule, scheduleFields);
  out.payload = pick(payload, payloadFields);
  if (isPlainObject(job.delivery)) {
    out.delivery = pick(job.delivery, DELIVERY_FIELDS);
  }
  if (typeof out.updatedAtMs !== "number") {
    out.updatedAtMs = out.createdAtMs;
  }
  if (out.wakeMode !== "now" && out.wakeMode !== "next-heartbeat") {
    out.wakeMode = "now";
  }
  out.state = {};
  return { ok: true, job: out };
}
