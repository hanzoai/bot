import { describe, expect, it } from "vitest";
import type { HanzoBotConfig } from "../config/config.js";
import {
  clearConfigCache,
  clearRuntimeConfigSnapshot,
  loadConfig,
  setRuntimeConfigSnapshot,
} from "../config/config.js";
import { NON_ENV_SECRETREF_MARKER } from "./model-auth-markers.js";
import {
  installModelsConfigTestHooks,
  withModelsTempHome as withTempHome,
} from "./models-config.e2e-harness.js";
import { ensureHanzoBotModelsJson } from "./models-config.js";
import { readGeneratedModelsJson } from "./models-config.test-utils.js";

installModelsConfigTestHooks();

function createOpenAiApiKeySourceConfig(): HanzoBotConfig {
  return {
    models: {
      providers: {
        openai: {
          baseUrl: "https://api.openai.com/v1",
          apiKey: { source: "env", provider: "default", id: "OPENAI_API_KEY" }, // pragma: allowlist secret
          api: "openai-completions" as const,
          models: [],
        },
      },
    },
  };
}

function createOpenAiApiKeyRuntimeConfig(): HanzoBotConfig {
  return {
    models: {
      providers: {
        openai: {
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-runtime-resolved", // pragma: allowlist secret
          api: "openai-completions" as const,
          models: [],
        },
      },
    },
  };
}

function createOpenAiHeaderSourceConfig(): HanzoBotConfig {
  return {
    models: {
      providers: {
        openai: {
          baseUrl: "https://api.openai.com/v1",
          api: "openai-completions" as const,
          headers: {
            Authorization: {
              source: "env",
              provider: "default",
              id: "OPENAI_HEADER_TOKEN", // pragma: allowlist secret
            },
            "X-Tenant-Token": {
              source: "file",
              provider: "vault",
              id: "/providers/openai/tenantToken",
            },
          },
          models: [],
        },
      },
    },
  };
}

function createOpenAiHeaderRuntimeConfig(): HanzoBotConfig {
  return {
    models: {
      providers: {
        openai: {
          baseUrl: "https://api.openai.com/v1",
          api: "openai-completions" as const,
          headers: {
            Authorization: "Bearer runtime-openai-token",
            "X-Tenant-Token": "runtime-tenant-token",
          },
          models: [],
        },
      },
    },
  };
}

function withGatewayTokenMode(config: HanzoBotConfig): HanzoBotConfig {
  return {
    ...config,
    gateway: {
      auth: {
        mode: "token",
      },
    },
  };
}

async function withGeneratedModelsFromRuntimeSource(
  params: {
    sourceConfig: HanzoBotConfig;
    runtimeConfig: HanzoBotConfig;
    candidateConfig?: HanzoBotConfig;
  },
  runAssertions: () => Promise<void>,
) {
  await withTempHome(async () => {
    try {
      setRuntimeConfigSnapshot(params.runtimeConfig, params.sourceConfig);
      await ensureHanzoBotModelsJson(params.candidateConfig ?? loadConfig());
      await runAssertions();
    } finally {
      clearRuntimeConfigSnapshot();
      clearConfigCache();
    }
  });
}

async function expectGeneratedProviderApiKey(providerId: string, expected: string) {
  const parsed = await readGeneratedModelsJson<{
    providers: Record<string, { apiKey?: string }>;
  }>();
  expect(parsed.providers[providerId]?.apiKey).toBe(expected);
}

async function expectGeneratedOpenAiHeaderMarkers() {
  const parsed = await readGeneratedModelsJson<{
    providers: Record<string, { headers?: Record<string, string> }>;
  }>();
  expect(parsed.providers.openai?.headers?.Authorization).toBe(
    "secretref-env:OPENAI_HEADER_TOKEN", // pragma: allowlist secret
  );
  expect(parsed.providers.openai?.headers?.["X-Tenant-Token"]).toBe(NON_ENV_SECRETREF_MARKER);
}

describe("models-config runtime source snapshot", () => {
  it("uses runtime source snapshot markers when passed the active runtime config", async () => {
    await withGeneratedModelsFromRuntimeSource(
      {
        sourceConfig: createOpenAiApiKeySourceConfig(),
        runtimeConfig: createOpenAiApiKeyRuntimeConfig(),
      },
      async () => expectGeneratedProviderApiKey("openai", "OPENAI_API_KEY"), // pragma: allowlist secret
    );
  });

  it("uses non-env marker from runtime source snapshot for file refs", async () => {
    await withTempHome(async () => {
      const sourceConfig: HanzoBotConfig = {
        models: {
          providers: {
            moonshot: {
              baseUrl: "https://api.moonshot.ai/v1",
              apiKey: { source: "file", provider: "vault", id: "/moonshot/apiKey" },
              api: "openai-completions" as const,
              models: [],
            },
          },
        },
      };
      const runtimeConfig: HanzoBotConfig = {
        models: {
          providers: {
            moonshot: {
              baseUrl: "https://api.moonshot.ai/v1",
              apiKey: "sk-runtime-moonshot", // pragma: allowlist secret
              api: "openai-completions" as const,
              models: [],
            },
          },
        },
      };

      try {
        setRuntimeConfigSnapshot(runtimeConfig, sourceConfig);
        await ensureHanzoBotModelsJson(loadConfig());

        const parsed = await readGeneratedModelsJson<{
          providers: Record<string, { apiKey?: string }>;
        }>();
        expect(parsed.providers.moonshot?.apiKey).toBe(NON_ENV_SECRETREF_MARKER);
      } finally {
        clearRuntimeConfigSnapshot();
        clearConfigCache();
      }
    });
  });

  it("projects cloned runtime configs onto source snapshot when preserving provider auth", async () => {
    await withTempHome(async () => {
      const sourceConfig = createOpenAiApiKeySourceConfig();
      const runtimeConfig = createOpenAiApiKeyRuntimeConfig();
      const clonedRuntimeConfig: HanzoBotConfig = {
        ...runtimeConfig,
        agents: {
          defaults: {
            imageModel: "openai/gpt-image-1",
          },
        },
      };

      try {
        setRuntimeConfigSnapshot(runtimeConfig, sourceConfig);
        await ensureHanzoBotModelsJson(clonedRuntimeConfig);
        await expectGeneratedProviderApiKey("openai", "OPENAI_API_KEY"); // pragma: allowlist secret
      } finally {
        clearRuntimeConfigSnapshot();
        clearConfigCache();
      }
    });
  });

  it("uses header markers from runtime source snapshot instead of resolved runtime values", async () => {
    await withGeneratedModelsFromRuntimeSource(
      {
        sourceConfig: createOpenAiHeaderSourceConfig(),
        runtimeConfig: createOpenAiHeaderRuntimeConfig(),
      },
      expectGeneratedOpenAiHeaderMarkers,
    );
  });

  it("keeps source markers when runtime projection is skipped for incompatible top-level shape", async () => {
    await withTempHome(async () => {
      const sourceConfig = withGatewayTokenMode(createOpenAiApiKeySourceConfig());
      const runtimeConfig = withGatewayTokenMode(createOpenAiApiKeyRuntimeConfig());
      const incompatibleCandidate: HanzoBotConfig = {
        ...createOpenAiApiKeyRuntimeConfig(),
      };

      try {
        setRuntimeConfigSnapshot(runtimeConfig, sourceConfig);
        await ensureHanzoBotModelsJson(incompatibleCandidate);
        await expectGeneratedProviderApiKey("openai", "OPENAI_API_KEY"); // pragma: allowlist secret
      } finally {
        clearRuntimeConfigSnapshot();
        clearConfigCache();
      }
    });
  });

  it("keeps source header markers when runtime projection is skipped for incompatible top-level shape", async () => {
    await withTempHome(async () => {
      const sourceConfig = withGatewayTokenMode(createOpenAiHeaderSourceConfig());
      const runtimeConfig = withGatewayTokenMode(createOpenAiHeaderRuntimeConfig());
      const incompatibleCandidate: HanzoBotConfig = {
        ...createOpenAiHeaderRuntimeConfig(),
      };

      try {
        setRuntimeConfigSnapshot(runtimeConfig, sourceConfig);
        await ensureHanzoBotModelsJson(incompatibleCandidate);
        await expectGeneratedOpenAiHeaderMarkers();
      } finally {
        clearRuntimeConfigSnapshot();
        clearConfigCache();
      }
    });
  });
});
