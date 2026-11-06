import type { Bot, Message } from '../types';

export class BotClient {
  private localBaseUrl: string;
  private cloudBaseUrl: string;

  constructor(
    localBaseUrl = 'http://127.0.0.1:18789',
    cloudBaseUrl = 'https://api.hanzo.ai'
  ) {
    this.localBaseUrl = localBaseUrl.replace(/\/$/, '');
    this.cloudBaseUrl = cloudBaseUrl.replace(/\/$/, '');
  }

  async sendMessage(
    bot: Bot,
    userText: string,
    history: Message[],
    workspacePath?: string
  ): Promise<{ text: string }> {
    const targetUrl =
      bot.endpoint === 'local' ? this.localBaseUrl : this.cloudBaseUrl;

    const url = `${targetUrl}/v1/chat/completions`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: bot.model,
          messages: [
            { role: 'system', content: bot.systemPrompt },
            ...history.map((m) => ({
              role: m.sender === 'user' ? 'user' : 'assistant',
              content: m.text,
            })),
            { role: 'user', content: userText },
          ],
          workspace: workspacePath,
        }),
      });
    } catch (err) {
      throw new Error(`Could not reach ${url}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      throw new Error(`${url} answered ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? data.text;
    if (typeof text !== 'string' || !text) {
      throw new Error(`${url} answered without a message`);
    }
    return { text };
  }
}

export const defaultBotClient = new BotClient();
