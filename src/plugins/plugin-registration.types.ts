import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import type { Command } from "commander";
import type { BotConfig } from "../config/types.bot.js";
import type {
  DiagnosticEventPrivateData,
  DiagnosticEventInput,
  DiagnosticEventMetadata,
  DiagnosticEventPayload,
} from "../infra/diagnostic-events.js";
import type { SecurityAuditFinding } from "../security/audit.types.js";
import type { PluginLogger } from "./logger-types.js";

type ChannelPlugin = import("../channels/plugins/types.plugin.js").ChannelPlugin;

type PluginInteractiveHandlerResult = {
  handled?: boolean;
} | void;

export type PluginInteractiveRegistration<
  TContext = unknown,
  TChannel extends string = string,
  TResult = PluginInteractiveHandlerResult,
> = {
  channel: TChannel;
  namespace: string;
  handler: (ctx: TContext) => Promise<TResult> | TResult;
};

export type PluginInteractiveHandlerRegistration = PluginInteractiveRegistration;

export type BotPluginHttpRouteAuth = "gateway" | "plugin";
export type BotPluginHttpRouteMatch = "exact" | "prefix";
export type BotPluginGatewayRuntimeScopeSurface = "write-default" | "trusted-operator";

export type BotPluginHttpRouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<boolean | void> | boolean | void;

export type BotPluginHttpRouteUpgradeHandler = (
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) => Promise<boolean | void> | boolean | void;

export type BotPluginHttpRouteParams = {
  path: string;
  handler: BotPluginHttpRouteHandler;
  handleUpgrade?: BotPluginHttpRouteUpgradeHandler;
  auth: BotPluginHttpRouteAuth;
  match?: BotPluginHttpRouteMatch;
  gatewayRuntimeScopeSurface?: BotPluginGatewayRuntimeScopeSurface;
  nodeCapability?: {
    surface: string;
    ttlMs?: number;
  };
  replaceExisting?: boolean;
};

export type BotPluginHostedMediaResolver = (
  mediaUrl: string,
) => string | null | undefined | Promise<string | null | undefined>;

export type BotPluginCliContext = {
  /**
   * Command object where this plugin should register its commands.
   *
   * For root CLI registrations this is the root `bot` program. For nested
   * registrations it is the resolved parent command from `parentPath`.
   */
  program: Command;
  parentPath: readonly string[];
  config: BotConfig;
  workspaceDir?: string;
  logger: PluginLogger;
};

export type BotPluginCliRegistrar = (ctx: BotPluginCliContext) => void | Promise<void>;

/**
 * Top-level CLI metadata for plugin-owned commands.
 *
 * Descriptors are the parse-time contract for lazy plugin CLI registration.
 * If you want Bot to keep a plugin command lazy-loaded while still
 * advertising it at the root CLI level, provide descriptors that cover every
 * top-level command root registered by that plugin CLI surface.
 */
type BotPluginCliCommandDescriptor = {
  name: string;
  description: string;
  hasSubcommands: boolean;
};

/** Root-command metadata that is available before a plugin registrar is activated. */
export type BotPluginCliRootCommandDescriptor = BotPluginCliCommandDescriptor & {
  machineOutput?: (params: { argv: readonly string[]; stdoutIsTTY: boolean }) => boolean;
};

type BotPluginRootCliRegistrationOptions = {
  /** Omit or pass an empty path for root commands. */
  parentPath?: readonly [];
  commands?: readonly string[];
  descriptors?: readonly BotPluginCliRootCommandDescriptor[];
};

/** Backward-compatible registration shape for dynamic root or nested paths. */
type BotPluginLegacyCliRegistrationOptions = {
  parentPath?: readonly string[];
  commands?: readonly string[];
  descriptors?: readonly BotPluginCliCommandDescriptor[];
};

export type BotPluginCliRegistrationOptions =
  | BotPluginRootCliRegistrationOptions
  | BotPluginLegacyCliRegistrationOptions;

export type BotPluginNodeCliFeatureOptions = {
  /** Explicit node feature command names owned under `bot nodes`. */
  commands?: string[];
  /**
   * Parse-time command descriptors for lazy node feature CLI registration.
   *
   * Descriptors are registered under `bot nodes`, so a descriptor named
   * `"camera"` exposes `bot nodes camera`.
   */
  descriptors?: BotPluginCliCommandDescriptor[];
};

export type BotPluginReloadRegistration = {
  restartPrefixes?: string[];
  hotPrefixes?: string[];
  noopPrefixes?: string[];
};

export type {
  BotPluginNodeHostCommand,
  BotPluginNodeHostCommandAvailabilityContext,
  BotPluginNodeHostCommandIo,
} from "./types.node-host.js";

export type BotPluginNodeInvokeTransportResult =
  | {
      ok: true;
      payload?: unknown;
      payloadJSON?: string | null;
    }
  | {
      ok: false;
      code?: string;
      message: string;
      details?: Record<string, unknown>;
    };

type BotPluginNodeInvokeApprovalDecision = "allow-once" | "allow-always" | "deny";

type BotPluginNodeInvokePolicyApprovalRuntime = {
  request: (input: {
    title: string;
    description: string;
    severity?: "info" | "warning" | "critical";
    toolName?: string;
    toolCallId?: string;
    agentId?: string;
    sessionKey?: string;
    timeoutMs?: number;
  }) => Promise<{
    id?: string;
    decision?: BotPluginNodeInvokeApprovalDecision | null;
  }>;
};

export type BotPluginNodeInvokePolicyContext = {
  nodeId: string;
  command: string;
  params: unknown;
  timeoutMs?: number;
  idempotencyKey?: string;
  config: BotConfig;
  pluginConfig?: Record<string, unknown>;
  node?: {
    nodeId: string;
    displayName?: string;
    platform?: string;
    deviceFamily?: string;
    commands?: string[];
  };
  client?: {
    connId?: string;
    scopes?: string[];
  } | null;
  approvals?: BotPluginNodeInvokePolicyApprovalRuntime;
  invokeNode: (input?: {
    params?: unknown;
    timeoutMs?: number;
    idempotencyKey?: string;
  }) => Promise<BotPluginNodeInvokeTransportResult>;
};

export type BotPluginNodeInvokePolicyResult =
  | {
      ok: true;
      payload?: unknown;
      payloadJSON?: string | null;
    }
  | {
      ok: false;
      message: string;
      code?: string;
      details?: Record<string, unknown>;
      unavailable?: boolean;
    };

export type BotPluginNodeInvokePolicy = {
  commands: string[];
  /**
   * Platforms where these node-handled commands should be allowlisted by default.
   * Omit for commands that require explicit `gateway.nodes.commands.allow`.
   */
  defaultPlatforms?: Array<"ios" | "android" | "macos" | "windows" | "linux" | "unknown">;
  /**
   * Dangerous policy commands are filtered out of default allowlists unless
   * explicitly allowed by config.
   */
  dangerous?: boolean;
  /**
   * iOS foreground-restricted commands should be queued for foreground delivery
   * when an iOS node reports BACKGROUND_UNAVAILABLE.
   */
  foregroundRestrictedOnIos?: boolean;
  handle: (
    ctx: BotPluginNodeInvokePolicyContext,
  ) => Promise<BotPluginNodeInvokePolicyResult> | BotPluginNodeInvokePolicyResult;
};

export type BotPluginSecurityAuditContext = {
  config: BotConfig;
  sourceConfig: BotConfig;
  env: NodeJS.ProcessEnv;
  stateDir: string;
  configPath: string;
};

export type BotPluginSecurityAuditCollector = (
  ctx: BotPluginSecurityAuditContext,
) => SecurityAuditFinding[] | Promise<SecurityAuditFinding[]>;

export type BotGatewayDiscoveryAdvertiseContext = {
  machineDisplayName: string;
  gatewayPort: number;
  gatewayTlsEnabled: boolean;
  gatewayTlsFingerprintSha256?: string;
  gatewayDirectReachable: boolean;
  canvasPort?: number;
  tailnetDns?: string;
  sshPort?: number;
  cliPath?: string;
  minimal: boolean;
};

export type BotGatewayDiscoveryService = {
  id: string;
  advertise: (
    ctx: BotGatewayDiscoveryAdvertiseContext,
  ) => void | Promise<void | { stop?: () => void | Promise<void> }>;
};

/** Context passed to long-lived plugin services. */
export type BotPluginServiceContext = {
  config: BotConfig;
  workspaceDir?: string;
  stateDir: string;
  logger: PluginLogger;
  gatewayEvents?: import("./gateway-events.js").BotPluginGatewayEvents;
  startupTrace?: {
    detail?: (name: string, metrics: ReadonlyArray<readonly [string, number | string]>) => void;
    measure: <T>(name: string, run: () => T | Promise<T>) => Promise<T>;
  };
  internalDiagnostics?: {
    emit: (event: DiagnosticEventInput, privateData?: DiagnosticEventPrivateData) => void;
    onEvent: (
      listener: (
        event: DiagnosticEventPayload,
        metadata: DiagnosticEventMetadata,
        privateData: DiagnosticEventPrivateData,
      ) => void,
    ) => () => void;
  };
};

/** Background service registered by a plugin during `register(api)`. */
export type BotPluginService = {
  id: string;
  start: (ctx: BotPluginServiceContext) => void | Promise<void>;
  stop?: (ctx: BotPluginServiceContext) => void | Promise<void>;
};

export type BotPluginChannelRegistration = {
  plugin: ChannelPlugin;
};

/**
 * Public label exposed to plugin `register(api)` calls.
 *
 * Keep this as a compatibility signal for plugin authors. Loader internals
 * should derive explicit capability booleans from the mode instead of branching
 * on raw strings throughout the code path.
 *
 * - `full`: live runtime activation; long-lived side effects may start.
 * - `discovery`: read-only capability discovery; skip sockets/workers/clients.
 * - `tool-discovery`: capability discovery for executable tools; skip channel runtime hydration.
 * - `setup-only`: lightweight channel setup entry only.
 * - `setup-runtime`: setup flow that also needs the runtime channel entry.
 * - `cli-metadata`: CLI command metadata collection.
 */
export type PluginRegistrationMode =
  | "full"
  | "discovery"
  | "tool-discovery"
  | "setup-only"
  | "setup-runtime"
  | "cli-metadata";
