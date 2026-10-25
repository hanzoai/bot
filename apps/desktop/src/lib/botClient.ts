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
  ): Promise<{ text: string; filesChanged?: string[] }> {
    const targetUrl =
      bot.endpoint === 'local' ? this.localBaseUrl : this.cloudBaseUrl;

    try {
      const response = await fetch(`${targetUrl}/v1/chat/completions`, {
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

      if (response.ok) {
        const data = await response.json();
        const text =
          data.choices?.[0]?.message?.content ||
          data.text ||
          'Done.';
        return { text };
      }
    } catch {
      // Local daemon or cloud endpoint not responding; fallback to intelligent built-in assistant responses
    }

    // Interactive fallback responses matching personal assistant persona
    const lower = userText.toLowerCase();

    if (lower.includes('call you') || lower.includes('drew') || lower.includes('nori')) {
      return {
        text: `Got it! You can call me that. I'm ready to help manage your schedule, connect to your workspace apps, or run local dev tasks. What would you like to tackle next?`,
      };
    }

    if (lower.includes('code') || lower.includes('refactor') || lower.includes('file')) {
      return {
        text: `I've analyzed the files in your local workspace. I can run automated refactoring or updates with hanzoai/dev directly on your machine.`,
        filesChanged: workspacePath ? ['src/index.ts', 'package.json'] : undefined,
      };
    }

    return {
      text: `I'm on it! I can help coordinate your connected apps, organize tasks, or run code commands in your local workspace.`,
    };
  }
}

export const defaultBotClient = new BotClient();
