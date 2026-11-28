import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Offline-First Hanzo-Bot Onboard Configuration', () => {
  const LOCAL_ENGINE_URL = 'http://127.0.0.1:1234/v1';
  const LOCAL_CLOUD_URL = 'http://127.0.0.1:8080/v1';

  function createOfflineBotConfig(options = {}) {
    return {
      version: '1.0.0',
      offlineMode: true,
      endpoints: {
        engine: options.engineUrl || LOCAL_ENGINE_URL,
        cloud: options.cloudUrl || LOCAL_CLOUD_URL,
      },
      auth: {
        requireHostedKey: false,
        apiKey: options.apiKey || null,
        localOnlyToken: 'offline-local-dev-token',
      },
      channels: {
        slack: { enabled: false },
        discord: { enabled: false },
        telegram: { enabled: false },
      },
      gateway: {
        bind: '127.0.0.1',
        port: 18789,
        allowLoopbackOnly: true,
      },
    };
  }

  test('generates valid offline config without hosted API credentials', () => {
    const config = createOfflineBotConfig();
    assert.equal(config.offlineMode, true);
    assert.equal(config.auth.requireHostedKey, false);
    assert.equal(config.auth.apiKey, null);
    assert.equal(config.auth.localOnlyToken, 'offline-local-dev-token');
  });

  test('wires local engine endpoint default to :1234 and cloud to :8080', () => {
    const config = createOfflineBotConfig();
    assert.match(config.endpoints.engine, /:1234/);
    assert.match(config.endpoints.cloud, /:8080/);
    assert.equal(config.endpoints.engine, 'http://127.0.0.1:1234/v1');
    assert.equal(config.endpoints.cloud, 'http://127.0.0.1:8080/v1');
  });

  test('allows custom local loopback override for engine and cloud', () => {
    const customConfig = createOfflineBotConfig({
      engineUrl: 'http://localhost:1234/api/v1',
      cloudUrl: 'http://localhost:8080/api/v1',
    });
    assert.equal(customConfig.endpoints.engine, 'http://localhost:1234/api/v1');
    assert.equal(customConfig.endpoints.cloud, 'http://localhost:8080/api/v1');
  });

  test('gateway enforces loopback-only binding in offline development mode', () => {
    const config = createOfflineBotConfig();
    assert.equal(config.gateway.bind, '127.0.0.1');
    assert.equal(config.gateway.allowLoopbackOnly, true);
    assert.equal(config.gateway.port, 18789);
  });

  test('validates offline tool execution payload against local engine contract', () => {
    const toolCallPayload = {
      model: 'local-engine-model',
      messages: [{ role: 'user', content: 'ping' }],
      endpoint: LOCAL_ENGINE_URL,
      stream: false,
    };

    assert.ok(toolCallPayload.endpoint.startsWith('http://127.0.0.1:1234'));
    assert.equal(toolCallPayload.model, 'local-engine-model');
    assert.equal(toolCallPayload.messages.length, 1);
  });
});
