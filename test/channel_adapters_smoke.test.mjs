import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

describe('Channel Adapters Unit & Mock Webhook Tests (Slack, Discord, Telegram)', () => {
  // Helper: Inbound message normalizer
  function normalizeInboundMessage(channel, rawPayload) {
    if (channel === 'slack') {
      return {
        channel: 'slack',
        userId: rawPayload.event?.user || rawPayload.user_id,
        text: rawPayload.event?.text || rawPayload.text,
        timestamp: rawPayload.event?.ts || rawPayload.ts || Date.now().toString(),
        channelId: rawPayload.event?.channel || rawPayload.channel_id,
      };
    }
    if (channel === 'discord') {
      return {
        channel: 'discord',
        userId: rawPayload.author?.id,
        text: rawPayload.content,
        timestamp: rawPayload.timestamp || Date.now().toString(),
        channelId: rawPayload.channel_id,
      };
    }
    if (channel === 'telegram') {
      return {
        channel: 'telegram',
        userId: String(rawPayload.message?.from?.id),
        text: rawPayload.message?.text,
        timestamp: String(rawPayload.message?.date || Date.now()),
        channelId: String(rawPayload.message?.chat?.id),
      };
    }
    throw new Error(`Unsupported channel: ${channel}`);
  }

  // Helper: Slack HMAC-SHA256 signature verification
  function verifySlackSignature(signingSecret, timestamp, body, signature) {
    const sigBaseString = `v0:${timestamp}:${body}`;
    const hmac = crypto.createHmac('sha256', signingSecret).update(sigBaseString).digest('hex');
    const mySig = `v0=${hmac}`;
    return crypto.timingSafeEqual(Buffer.from(mySig), Buffer.from(signature));
  }

  // Helper: Interactive approval callback normalizer
  function parseApprovalAction(channel, payload) {
    if (channel === 'slack') {
      const action = payload.actions?.[0];
      return {
        actionId: action?.action_id,
        decision: action?.value === 'approve' ? 'APPROVED' : 'REJECTED',
        toolName: payload.callback_id || 'unknown_tool',
        userId: payload.user?.id,
      };
    }
    if (channel === 'discord') {
      return {
        actionId: payload.data?.custom_id,
        decision: payload.data?.custom_id?.includes('approve') ? 'APPROVED' : 'REJECTED',
        toolName: payload.message?.embeds?.[0]?.title || 'unknown_tool',
        userId: payload.member?.user?.id,
      };
    }
    if (channel === 'telegram') {
      const data = payload.callback_query?.data || '';
      return {
        actionId: data,
        decision: data.startsWith('approve:') ? 'APPROVED' : 'REJECTED',
        toolName: data.split(':')[1] || 'unknown_tool',
        userId: String(payload.callback_query?.from?.id),
      };
    }
    throw new Error(`Unsupported callback channel: ${channel}`);
  }

  test('normalizes inbound Slack event webhook correctly', () => {
    const rawSlack = {
      event: {
        type: 'message',
        user: 'U12345678',
        text: 'hello from slack',
        ts: '1700000000.000100',
        channel: 'C98765432',
      },
    };
    const norm = normalizeInboundMessage('slack', rawSlack);
    assert.equal(norm.channel, 'slack');
    assert.equal(norm.userId, 'U12345678');
    assert.equal(norm.text, 'hello from slack');
    assert.equal(norm.channelId, 'C98765432');
  });

  test('normalizes inbound Discord gateway message correctly', () => {
    const rawDiscord = {
      id: '999888777',
      channel_id: '111222333',
      content: 'hello from discord',
      timestamp: '2026-11-28T10:00:00.000Z',
      author: {
        id: '444555666',
        username: 'coder',
      },
    };
    const norm = normalizeInboundMessage('discord', rawDiscord);
    assert.equal(norm.channel, 'discord');
    assert.equal(norm.userId, '444555666');
    assert.equal(norm.text, 'hello from discord');
    assert.equal(norm.channelId, '111222333');
  });

  test('normalizes inbound Telegram update webhook correctly', () => {
    const rawTelegram = {
      update_id: 10001,
      message: {
        message_id: 42,
        from: { id: 777888999, first_name: 'Dev' },
        chat: { id: 777888999, type: 'private' },
        date: 1700000000,
        text: 'hello from telegram',
      },
    };
    const norm = normalizeInboundMessage('telegram', rawTelegram);
    assert.equal(norm.channel, 'telegram');
    assert.equal(norm.userId, '777888999');
    assert.equal(norm.text, 'hello from telegram');
    assert.equal(norm.channelId, '777888999');
  });

  test('verifies Slack webhook HMAC signature matching', () => {
    const secret = 'slack-test-secret-key-123';
    const timestamp = '1700000000';
    const body = JSON.stringify({ event: { text: 'ping' } });
    const sigBase = `v0:${timestamp}:${body}`;
    const validSig = `v0=${crypto.createHmac('sha256', secret).update(sigBase).digest('hex')}`;

    assert.equal(verifySlackSignature(secret, timestamp, body, validSig), true);

    const invalidSig = `v0=${crypto.createHmac('sha256', 'wrong-secret').update(sigBase).digest('hex')}`;
    assert.equal(verifySlackSignature(secret, timestamp, body, invalidSig), false);
  });

  test('parses interactive tool approval callback from Slack, Discord, and Telegram', () => {
    const slackPayload = {
      callback_id: 'bash_exec',
      user: { id: 'U111' },
      actions: [{ action_id: 'btn_approve', value: 'approve' }],
    };
    assert.deepEqual(parseApprovalAction('slack', slackPayload), {
      actionId: 'btn_approve',
      decision: 'APPROVED',
      toolName: 'bash_exec',
      userId: 'U111',
    });

    const discordPayload = {
      data: { custom_id: 'tool_approve:write_file' },
      member: { user: { id: 'D222' } },
      message: { embeds: [{ title: 'write_file' }] },
    };
    assert.deepEqual(parseApprovalAction('discord', discordPayload), {
      actionId: 'tool_approve:write_file',
      decision: 'APPROVED',
      toolName: 'write_file',
      userId: 'D222',
    });

    const telegramPayload = {
      callback_query: {
        from: { id: 333 },
        data: 'approve:run_command',
      },
    };
    assert.deepEqual(parseApprovalAction('telegram', telegramPayload), {
      actionId: 'approve:run_command',
      decision: 'APPROVED',
      toolName: 'run_command',
      userId: '333',
    });
  });
});
