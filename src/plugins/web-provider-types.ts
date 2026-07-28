// Defines web provider plugin schema and runtime types.
import type { TSchema } from "typebox";
import type { BotConfig } from "../config/types.bot.js";
import type { RuntimeEnv } from "../runtime.js";
import type {
  RuntimeWebFetchMetadata,
  RuntimeWebSearchMetadata,
} from "../secrets/runtime-web-tools.types.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import type { SecretInputMode } from "./provider-auth-types.js";

type WebSearchProviderId = string;
type WebFetchProviderId = string;

export type WebSearchProviderToolDefinition = {
  description: string;
  parameters: TSchema;
  execute: (
    args: Record<string, unknown>,
    context?: WebSearchProviderToolExecutionContext,
  ) => Promise<Record<string, unknown>>;
};

export type WebFetchProviderToolDefinition = {
  description: string;
  parameters: TSchema;
  execute: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

type WebSearchProviderContext = {
  config?: BotConfig;
  searchConfig?: Record<string, unknown>;
  runtimeMetadata?: RuntimeWebSearchMetadata;
  agentDir?: string;
};

export type WebSearchProviderToolExecutionContext = {
  signal?: AbortSignal;
};

type WebFetchProviderContext = {
  config?: BotConfig;
  fetchConfig?: Record<string, unknown>;
  runtimeMetadata?: RuntimeWebFetchMetadata;
};

export type WebSearchCredentialResolutionSource = "config" | "secretRef" | "env" | "missing";

type WebSearchProviderConfiguredCredentialFallback = {
  path: string;
  value: unknown;
};

type WebFetchProviderConfiguredCredentialFallback = {
  path: string;
  value: unknown;
};

type WebSearchRuntimeMetadataContext = {
  config?: BotConfig;
  searchConfig?: Record<string, unknown>;
  runtimeMetadata?: RuntimeWebSearchMetadata;
  resolvedCredential?: {
    value?: string;
    source: WebSearchCredentialResolutionSource;
    fallbackEnvVar?: string;
  };
};

export type WebSearchProviderSetupContext = {
  config: BotConfig;
  runtime: RuntimeEnv;
  prompter: WizardPrompter;
  quickstartDefaults?: boolean;
  secretInputMode?: SecretInputMode;
};

export type WebFetchCredentialResolutionSource = "config" | "secretRef" | "env" | "missing";

type WebFetchRuntimeMetadataContext = {
  config?: BotConfig;
  fetchConfig?: Record<string, unknown>;
  runtimeMetadata?: RuntimeWebFetchMetadata;
  resolvedCredential?: {
    value?: string;
    source: WebFetchCredentialResolutionSource;
    fallbackEnvVar?: string;
  };
};

export type WebSearchProviderPlugin = {
  id: WebSearchProviderId;
  label: string;
  hint: string;
  onboardingScopes?: readonly "text-inference"[];
  requiresCredential?: boolean;
  credentialLabel?: string;
  envVars: string[];
  /** Optional model-provider auth profile id that can satisfy this web provider without a tool-specific API key. */
  authProviderId?: string;
  placeholder: string;
  signupUrl: string;
  docsUrl?: string;
  /** Optional note shown before credential collection for provider-specific prerequisites. */
  credentialNote?: string;
  autoDetectOrder?: number;
  credentialPath: string;
  inactiveSecretPaths?: string[];
  getCredentialValue: (searchConfig?: Record<string, unknown>) => unknown;
  setCredentialValue: (searchConfigTarget: Record<string, unknown>, value: unknown) => void;
  getConfiguredCredentialValue?: (config?: BotConfig) => unknown;
  setConfiguredCredentialValue?: (configTarget: BotConfig, value: unknown) => void;
  getConfiguredCredentialFallback?: (
    config?: BotConfig,
  ) => WebSearchProviderConfiguredCredentialFallback | undefined;
  applySelectionConfig?: (config: BotConfig) => BotConfig;
  runSetup?: (ctx: WebSearchProviderSetupContext) => BotConfig | Promise<BotConfig>;
  resolveRuntimeMetadata?: (
    ctx: WebSearchRuntimeMetadataContext,
  ) => Partial<RuntimeWebSearchMetadata> | Promise<Partial<RuntimeWebSearchMetadata>>;
  createTool: (ctx: WebSearchProviderContext) => WebSearchProviderToolDefinition | null;
};

export type PluginWebSearchProviderEntry = WebSearchProviderPlugin & {
  pluginId: string;
};

export type WebFetchProviderPlugin = {
  id: WebFetchProviderId;
  label: string;
  hint: string;
  requiresCredential?: boolean;
  credentialLabel?: string;
  envVars: string[];
  placeholder: string;
  signupUrl: string;
  docsUrl?: string;
  autoDetectOrder?: number;
  credentialPath: string;
  inactiveSecretPaths?: string[];
  getCredentialValue: (fetchConfig?: Record<string, unknown>) => unknown;
  setCredentialValue: (fetchConfigTarget: Record<string, unknown>, value: unknown) => void;
  getConfiguredCredentialValue?: (config?: BotConfig) => unknown;
  setConfiguredCredentialValue?: (configTarget: BotConfig, value: unknown) => void;
  getConfiguredCredentialFallback?: (
    config?: BotConfig,
  ) => WebFetchProviderConfiguredCredentialFallback | undefined;
  applySelectionConfig?: (config: BotConfig) => BotConfig;
  resolveRuntimeMetadata?: (
    ctx: WebFetchRuntimeMetadataContext,
  ) => Partial<RuntimeWebFetchMetadata> | Promise<Partial<RuntimeWebFetchMetadata>>;
  createTool: (ctx: WebFetchProviderContext) => WebFetchProviderToolDefinition | null;
};

export type PluginWebFetchProviderEntry = WebFetchProviderPlugin & {
  pluginId: string;
};
