import {
  DEFAULT_HANZO_CLOUD_ORIGIN,
  DEFAULT_HANZOD_ORIGIN,
  resolveSharedHanzoToken,
} from "./hanzod.js";

export interface HanzodBotTarget {
  id?: string;
  model?: string;
  endpoint?: "local" | "cloud";
}

export interface HanzodChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

/**
 * Unified `HanzodBotClient` — defaults `localBaseUrl` to `http://127.0.0.1:3690`
 * (replacing legacy `:18789` gateway and `:36900` standalone engine):
 * - `endpoint === 'local'`: `${localBaseUrl}/v1/bot/bots/${id}/run` -> `${localBaseUrl}/v1/engine/chat/completions`
 * - `endpoint === 'cloud'`: `${cloudBaseUrl}/v1/chat/completions` -> `${localBaseUrl}/v1/engine/chat/completions`
 */
export class HanzodBotClient {
  readonly localBaseUrl: string;
  readonly cloudBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getToken: () => string | null;

  constructor(opts?: {
    localBaseUrl?: string;
    cloudBaseUrl?: string;
    token?: string | (() => string | null);
    fetchImpl?: typeof fetch;
  }) {
    this.localBaseUrl = (opts?.localBaseUrl?.trim() || DEFAULT_HANZOD_ORIGIN).replace(/\/+$/, "");
    this.cloudBaseUrl = (opts?.cloudBaseUrl?.trim() || DEFAULT_HANZO_CLOUD_ORIGIN).replace(
      /\/+$/,
      "",
    );
    this.fetchImpl = opts?.fetchImpl ?? fetch;
    this.getToken =
      typeof opts?.token === "function"
        ? opts.token
        : typeof opts?.token === "string"
          ? () => opts.token as string
          : () => resolveSharedHanzoToken();
  }

  private buildHeaders(includeAuth: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    const token = includeAuth ? this.getToken()?.trim() : undefined;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  private extractReply(payload: unknown): string {
    if (typeof payload !== "object" || payload === null) {
      return typeof payload === "string" ? payload : JSON.stringify(payload ?? "");
    }
    const obj = payload as Record<string, unknown>;
    if (typeof obj.output === "string") {
      return obj.output;
    }
    if (typeof obj.reply === "string") {
      return obj.reply;
    }
    if (typeof obj.content === "string") {
      return obj.content;
    }
    if (Array.isArray(obj.choices) && obj.choices.length > 0) {
      const first = obj.choices[0] as { message?: { content?: unknown }; text?: unknown };
      if (typeof first?.message?.content === "string") {
        return first.message.content;
      }
      if (typeof first?.text === "string") {
        return first.text;
      }
    }
    return JSON.stringify(payload);
  }

  async chat(bot: HanzodBotTarget, messages: HanzodChatMessage[]): Promise<string> {
    const model = bot.model?.trim() || "zen6";
    const lastUser = [...messages].toReversed().find((m) => m.role === "user")?.content ?? "";

    if (bot.endpoint === "local") {
      const botId = encodeURIComponent(bot.id?.trim() || "hanzo");
      const botRunUrl = `${this.localBaseUrl}/v1/bot/bots/${botId}/run`;
      try {
        const runRes = await this.fetchImpl(botRunUrl, {
          method: "POST",
          headers: this.buildHeaders(true),
          body: JSON.stringify({ prompt: lastUser, model, messages }),
        });
        if (runRes.ok) {
          return this.extractReply(await runRes.json());
        }
      } catch {
        // Fall through to managed local hanzo-engine on hanzod (/v1/engine/chat/completions).
      }

      const engineRes = await this.fetchImpl(`${this.localBaseUrl}/v1/engine/chat/completions`, {
        method: "POST",
        headers: this.buildHeaders(true),
        body: JSON.stringify({ model, messages }),
      });
      if (!engineRes.ok) {
        throw new Error(`hanzod local engine failed (${engineRes.status})`);
      }
      return this.extractReply(await engineRes.json());
    }

    // Cloud primary (`https://api.hanzo.ai/v1/chat/completions`) -> local hanzod `/v1/engine/chat/completions` fallback
    try {
      const cloudRes = await this.fetchImpl(`${this.cloudBaseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: this.buildHeaders(true),
        body: JSON.stringify({ model, messages }),
      });
      if (cloudRes.ok) {
        return this.extractReply(await cloudRes.json());
      }
    } catch {
      // Fall back cleanly to hanzod managed local engine.
    }

    const fallbackRes = await this.fetchImpl(`${this.localBaseUrl}/v1/engine/chat/completions`, {
      method: "POST",
      headers: this.buildHeaders(true),
      body: JSON.stringify({ model, messages }),
    });
    if (!fallbackRes.ok) {
      throw new Error(`Cloud and local hanzod engine both failed (${fallbackRes.status})`);
    }
    return this.extractReply(await fallbackRes.json());
  }
}
