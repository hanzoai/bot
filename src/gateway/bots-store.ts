import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Bots store (filesystem backed, zero external deps)
//
// Persists the "bots" data model behind the console /bots page (ZAP tools
// bots.*, team.*, agent.*) as JSON files. No Redis/KV client is available in
// the gateway's dependency set, so this uses node:fs only.
//
// Durability: files live under BOTS_STORE_DIR (default ~/.hanzo-bots). On the
// current deployment that path is pod-local (no PVC), so records persist for
// the pod's lifetime. Mount a PVC at BOTS_STORE_DIR for cross-restart durability.
// ---------------------------------------------------------------------------

const BASE_DIR = process.env.BOTS_STORE_DIR ?? join(homedir() || "/tmp", ".hanzo-bots");
const LOG_CAP = 500;

export type BotStatus = "running" | "stopped" | "provisioning" | "error";
export type BotPlatform = "linux" | "macos" | "windows";
export type BotTier = "free" | "cloud" | "cloud-pro";

export interface BotMonthlyUsage {
  messages: number;
  tokens: number;
  cost: number;
}

export interface BotDID {
  uri?: string;
  method?: "hanzo" | "lux" | "pars" | "zoo" | "ai";
  chainId?: number;
}

export interface BotWallet {
  address?: string;
  safeAddress?: string;
  chain?: "lux" | "hanzo" | "zoo" | "pars";
  chainId?: number;
  derivationPath?: string;
}

export interface Bot {
  id: string;
  name: string;
  status: BotStatus;
  platform: BotPlatform;
  tier: BotTier;
  region: string;
  instanceType: string;
  createdAt: string; // ISO
  lastActiveAt: string; // ISO
  channels: string[];
  modelsEnabled: string[];
  memoryUsageMb: number;
  monthlyUsage: BotMonthlyUsage;
  did?: BotDID;
  wallet?: BotWallet;
}

export interface BotLogEntry {
  id: string;
  timestamp: string; // ISO
  level: "info" | "warn" | "error" | "debug";
  message: string;
}

const INSTANCE_TYPE: Record<BotPlatform, string> = {
  linux: "t3.small",
  macos: "mac2.metal",
  windows: "t3.medium",
};

// Filesystem keys are sanitized to avoid path traversal from ids.
function safe(seg: string): string {
  return String(seg).replace(/[^a-zA-Z0-9._-]/g, "_");
}
const botPath = (p: string, b: string) => join(BASE_DIR, "bots", safe(p), `${safe(b)}.json`);
const projDir = (p: string) => join(BASE_DIR, "bots", safe(p));
const logPath = (p: string, b: string) => join(BASE_DIR, "logs", safe(p), `${safe(b)}.json`);
const identityPath = (a: string) => join(BASE_DIR, "identity", `${safe(a)}.json`);

function nowIso(): string {
  return new Date().toISOString();
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value), "utf8");
}

async function appendLog(
  projectId: string,
  botId: string,
  level: BotLogEntry["level"],
  message: string,
): Promise<void> {
  try {
    const file = logPath(projectId, botId);
    const existing = (await readJson<BotLogEntry[]>(file)) ?? [];
    existing.unshift({ id: randomUUID(), timestamp: nowIso(), level, message });
    await writeJson(file, existing.slice(0, LOG_CAP));
  } catch (err) {
    console.log("[bots-store] appendLog failed:", (err as Error)?.message ?? err);
  }
}

export async function listBots(projectId: string): Promise<Bot[]> {
  let names: string[];
  try {
    names = await fs.readdir(projDir(projectId));
  } catch {
    return [];
  }
  const bots: Bot[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const bot = await readJson<Bot>(join(projDir(projectId), name));
    if (bot) bots.push(bot);
  }
  bots.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return bots;
}

export async function getBot(projectId: string, botId: string): Promise<Bot | null> {
  return readJson<Bot>(botPath(projectId, botId));
}

async function putBot(projectId: string, bot: Bot): Promise<Bot> {
  await writeJson(botPath(projectId, bot.id), bot);
  return bot;
}

export interface CreateBotInput {
  name: string;
  platform: BotPlatform;
  region: string;
  channels?: string[];
  modelsEnabled?: string[];
  tier?: BotTier;
}

export async function createBot(projectId: string, input: CreateBotInput): Promise<Bot> {
  const id = `bot_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const platform = input.platform ?? "linux";
  const bot: Bot = {
    id,
    name: input.name,
    status: "stopped",
    platform,
    tier: input.tier ?? "free",
    region: input.region,
    instanceType: INSTANCE_TYPE[platform] ?? "t3.small",
    createdAt: nowIso(),
    lastActiveAt: nowIso(),
    channels: input.channels ?? [],
    modelsEnabled: input.modelsEnabled ?? [],
    memoryUsageMb: 0,
    monthlyUsage: { messages: 0, tokens: 0, cost: 0 },
  };
  await putBot(projectId, bot);
  await appendLog(projectId, id, "info", `Bot "${bot.name}" created (${platform}/${bot.region}).`);
  return bot;
}

export interface UpdateBotPatch {
  name?: string;
  channels?: string[];
  modelsEnabled?: string[];
  tier?: BotTier;
}

export async function updateBot(
  projectId: string,
  botId: string,
  patch: UpdateBotPatch,
): Promise<Bot | null> {
  const bot = await getBot(projectId, botId);
  if (!bot) return null;
  if (patch.name !== undefined) bot.name = patch.name;
  if (patch.channels !== undefined) bot.channels = patch.channels;
  if (patch.modelsEnabled !== undefined) bot.modelsEnabled = patch.modelsEnabled;
  if (patch.tier !== undefined) bot.tier = patch.tier;
  bot.lastActiveAt = nowIso();
  await putBot(projectId, bot);
  await appendLog(projectId, botId, "info", "Bot configuration updated.");
  return bot;
}

export async function deleteBot(projectId: string, botId: string): Promise<boolean> {
  try {
    await fs.unlink(botPath(projectId, botId));
  } catch {
    return false;
  }
  await fs.unlink(logPath(projectId, botId)).catch(() => undefined);
  return true;
}

export async function setBotStatus(
  projectId: string,
  botId: string,
  status: BotStatus,
  logMessage?: string,
): Promise<Bot | null> {
  const bot = await getBot(projectId, botId);
  if (!bot) return null;
  bot.status = status;
  bot.lastActiveAt = nowIso();
  await putBot(projectId, bot);
  if (logMessage) await appendLog(projectId, botId, "info", logMessage);
  return bot;
}

export async function getBotLogs(
  projectId: string,
  botId: string,
  limit: number,
): Promise<BotLogEntry[]> {
  const all = (await readJson<BotLogEntry[]>(logPath(projectId, botId))) ?? [];
  return all.slice(0, Math.max(0, limit));
}

// ── Identity (DID + wallet), stored per agentId ─────────────────────────────

interface AgentIdentity {
  agentId: string;
  name: string | null;
  emoji: string | null;
  avatar: string | null;
  did: BotDID | null;
  wallet: BotWallet | null;
}

const CHAIN_IDS: Record<string, number> = { hanzo: 7117, lux: 96369, zoo: 200200, pars: 7777 };

async function getIdentity(agentId: string): Promise<AgentIdentity> {
  const existing = await readJson<AgentIdentity>(identityPath(agentId));
  return existing ?? { agentId, name: null, emoji: null, avatar: null, did: null, wallet: null };
}

async function putIdentity(identity: AgentIdentity): Promise<AgentIdentity> {
  await writeJson(identityPath(identity.agentId), identity);
  return identity;
}

export async function getAgentDID(agentId: string): Promise<{ agentId: string; did: BotDID | null }> {
  const id = await getIdentity(agentId);
  return { agentId, did: id.did };
}

export async function createAgentDID(
  agentId: string,
  method: BotDID["method"] = "hanzo",
): Promise<{ agentId: string; did: BotDID }> {
  const id = await getIdentity(agentId);
  const did: BotDID = {
    uri: `did:${method}:${agentId}`,
    method,
    chainId: CHAIN_IDS[method ?? "hanzo"] ?? CHAIN_IDS.hanzo,
  };
  id.did = did;
  await putIdentity(id);
  return { agentId, did };
}

export async function getAgentWallet(
  agentId: string,
): Promise<{ agentId: string; wallet: BotWallet | null }> {
  const id = await getIdentity(agentId);
  return { agentId, wallet: id.wallet };
}

export async function createAgentWallet(
  agentId: string,
  chain: BotWallet["chain"] = "hanzo",
): Promise<{ agentId: string; wallet: BotWallet }> {
  const id = await getIdentity(agentId);
  const hex = Buffer.from(`${chain}:${agentId}`).toString("hex").padEnd(40, "0").slice(0, 40);
  const wallet: BotWallet = {
    address: `0x${hex}`,
    safeAddress: `0x${hex}`,
    chain,
    chainId: CHAIN_IDS[chain ?? "hanzo"] ?? CHAIN_IDS.hanzo,
    derivationPath: "m/44'/60'/0'/0/0",
  };
  id.wallet = wallet;
  await putIdentity(id);
  return { agentId, wallet };
}

export async function getAgentIdentityFull(agentId: string): Promise<AgentIdentity> {
  return getIdentity(agentId);
}
