import { randomUUID } from "node:crypto";
import { Redis as KV } from "iovalkey";

// ---------------------------------------------------------------------------
// Bots store (KV / Redis backed)
//
// Persists the "bots" data model behind the console /bots page (ZAP tools
// bots.*, team.*, agent.*). Records are JSON blobs in Redis under per-project
// keys; logs are capped Redis lists. Identity (DID/wallet) is stored per agent.
//
// This is the source of truth for the gateway's ZAP `/v1/tools/call` tools.
// ---------------------------------------------------------------------------

const PREFIX = "bot:store:";
const botKey = (projectId: string, botId: string) => `${PREFIX}bot:${projectId}:${botId}`;
const botScan = (projectId: string) => `${PREFIX}bot:${projectId}:*`;
const logsKey = (projectId: string, botId: string) => `${PREFIX}logs:${projectId}:${botId}`;
const identityKey = (agentId: string) => `${PREFIX}identity:${agentId}`;
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

let client: KV | null = null;
function kv(): KV {
  if (!client) {
    const url =
      process.env.KV_URL ??
      process.env.REDIS_URL ??
      process.env.REDIS_CONNECTION_STRING ??
      "redis://localhost:6379";
    client = new KV(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
    client.on("error", (err: unknown) => {
      console.log("[bots-store] kv error:", (err as Error)?.message ?? err);
    });
  }
  return client;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function appendLog(
  projectId: string,
  botId: string,
  level: BotLogEntry["level"],
  message: string,
): Promise<void> {
  const entry: BotLogEntry = { id: randomUUID(), timestamp: nowIso(), level, message };
  try {
    const k = logsKey(projectId, botId);
    await kv().lpush(k, JSON.stringify(entry));
    await kv().ltrim(k, 0, LOG_CAP - 1);
  } catch (err) {
    console.log("[bots-store] appendLog failed:", (err as Error)?.message ?? err);
  }
}

export async function listBots(projectId: string): Promise<Bot[]> {
  const bots: Bot[] = [];
  let cursor = "0";
  do {
    const [next, keys] = await kv().scan(cursor, "MATCH", botScan(projectId), "COUNT", 200);
    cursor = next;
    if (keys.length > 0) {
      const vals = await kv().mget(...keys);
      for (const v of vals) {
        if (!v) continue;
        try {
          bots.push(JSON.parse(v) as Bot);
        } catch {
          /* skip malformed */
        }
      }
    }
  } while (cursor !== "0");
  bots.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return bots;
}

export async function getBot(projectId: string, botId: string): Promise<Bot | null> {
  const v = await kv().get(botKey(projectId, botId));
  if (!v) return null;
  try {
    return JSON.parse(v) as Bot;
  } catch {
    return null;
  }
}

async function putBot(projectId: string, bot: Bot): Promise<Bot> {
  await kv().set(botKey(projectId, bot.id), JSON.stringify(bot));
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
  const removed = await kv().del(botKey(projectId, botId));
  await kv().del(logsKey(projectId, botId)).catch(() => 0);
  return removed > 0;
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
  const raw = await kv().lrange(logsKey(projectId, botId), 0, Math.max(0, limit - 1));
  const out: BotLogEntry[] = [];
  for (const r of raw) {
    try {
      out.push(JSON.parse(r) as BotLogEntry);
    } catch {
      /* skip */
    }
  }
  return out;
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
  const v = await kv().get(identityKey(agentId));
  if (v) {
    try {
      return JSON.parse(v) as AgentIdentity;
    } catch {
      /* fall through */
    }
  }
  return { agentId, name: null, emoji: null, avatar: null, did: null, wallet: null };
}

async function putIdentity(identity: AgentIdentity): Promise<AgentIdentity> {
  await kv().set(identityKey(identity.agentId), JSON.stringify(identity));
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
  // Deterministic placeholder address derived from agentId (not a signing key).
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
