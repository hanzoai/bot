// Builds plugin API objects from config, registries, and runtime helpers.
import type { BotConfig } from "../config/types.bot.js";
import { attachPluginApiFacades, type BotPluginApiWithoutFacades } from "./api-facades.js";
import type { PluginRuntime } from "./runtime/types.js";
import type { BotPluginApi, PluginLogger } from "./types.js";

type BuildPluginApiParams = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  source: string;
  rootDir?: string;
  registrationMode: BotPluginApi["registrationMode"];
  config: BotConfig;
  pluginConfig?: Record<string, unknown>;
  runtime: PluginRuntime;
  logger: PluginLogger;
  resolvePath: (input: string) => string;
  handlers?: Partial<
    Pick<
      BotPluginApi,
      | "registerTool"
      | "registerHook"
      | "registerHttpRoute"
      | "registerHostedMediaResolver"
      | "registerMcpServerConnectionResolver"
      | "registerChannel"
      | "registerGatewayMethod"
      | "registerSessionCatalog"
      | "registerCli"
      | "registerReload"
      | "registerNodeHostCommand"
      | "registerNodeInvokePolicy"
      | "registerSecurityAuditCollector"
      | "registerService"
      | "registerGatewayDiscoveryService"
      | "registerCliBackend"
      | "registerTextTransforms"
      | "registerConfigMigration"
      | "registerMigrationProvider"
      | "registerAutoEnableProbe"
      | "registerProvider"
      | "registerWorkerProvider"
      | "registerModelCatalogProvider"
      | "registerEmbeddingProvider"
      | "registerSpeechProvider"
      | "registerRealtimeTranscriptionProvider"
      | "registerRealtimeVoiceProvider"
      | "registerMediaUnderstandingProvider"
      | "registerTranscriptSourceProvider"
      | "registerImageGenerationProvider"
      | "registerVideoGenerationProvider"
      | "registerMusicGenerationProvider"
      | "registerWebFetchProvider"
      | "registerWebSearchProvider"
      | "registerInteractiveHandler"
      | "onConversationBindingResolved"
      | "registerCommand"
      | "registerContextEngine"
      | "registerCompactionProvider"
      | "registerAgentHarness"
      | "registerCodexAppServerExtensionFactory"
      | "registerAgentToolResultMiddleware"
      | "registerSessionExtension"
      | "enqueueNextTurnInjection"
      | "registerTrustedToolPolicy"
      | "registerToolMetadata"
      | "registerControlUiDescriptor"
      | "registerRuntimeLifecycle"
      | "registerAgentEventSubscription"
      | "emitAgentEvent"
      | "setRunContext"
      | "getRunContext"
      | "clearRunContext"
      | "registerSessionSchedulerJob"
      | "registerSessionAction"
      | "sendSessionAttachment"
      | "scheduleSessionTurn"
      | "unscheduleSessionTurnsByTag"
      | "registerDetachedTaskRuntime"
      | "registerMemoryCapability"
      | "registerMemoryPromptSupplement"
      | "registerMemoryPromptPreparation"
      | "registerMemoryCorpusSupplement"
      | "registerMemoryEmbeddingProvider"
      | "on"
    >
  >;
};

const noopRegisterTool: BotPluginApi["registerTool"] = () => {};
const noopRegisterHook: BotPluginApi["registerHook"] = () => {};
const noopRegisterHttpRoute: BotPluginApi["registerHttpRoute"] = () => {};
const noopRegisterHostedMediaResolver: BotPluginApi["registerHostedMediaResolver"] = () => {};
const noopRegisterMcpServerConnectionResolver: BotPluginApi["registerMcpServerConnectionResolver"] =
  () => {};
const noopRegisterChannel: BotPluginApi["registerChannel"] = () => {};
const noopRegisterGatewayMethod: BotPluginApi["registerGatewayMethod"] = () => {};
const noopRegisterSessionCatalog: BotPluginApi["registerSessionCatalog"] = () => {};
const noopRegisterCli: BotPluginApi["registerCli"] = () => {};
const noopRegisterReload: BotPluginApi["registerReload"] = () => {};
const noopRegisterNodeHostCommand: BotPluginApi["registerNodeHostCommand"] = () => {};
const noopRegisterNodeInvokePolicy: BotPluginApi["registerNodeInvokePolicy"] = () => {};
const noopRegisterSecurityAuditCollector: BotPluginApi["registerSecurityAuditCollector"] =
  () => {};
const noopRegisterService: BotPluginApi["registerService"] = () => {};
const noopRegisterGatewayDiscoveryService: BotPluginApi["registerGatewayDiscoveryService"] =
  () => {};
const noopRegisterCliBackend: BotPluginApi["registerCliBackend"] = () => {};
const noopRegisterTextTransforms: BotPluginApi["registerTextTransforms"] = () => {};
const noopRegisterConfigMigration: BotPluginApi["registerConfigMigration"] = () => {};
const noopRegisterMigrationProvider: BotPluginApi["registerMigrationProvider"] = () => {};
const noopRegisterAutoEnableProbe: BotPluginApi["registerAutoEnableProbe"] = () => {};
const noopRegisterProvider: BotPluginApi["registerProvider"] = () => {};
const noopRegisterWorkerProvider: BotPluginApi["registerWorkerProvider"] = () => {};
const noopRegisterModelCatalogProvider: BotPluginApi["registerModelCatalogProvider"] =
  () => {};
const noopRegisterEmbeddingProvider: BotPluginApi["registerEmbeddingProvider"] = () => {};
const noopRegisterSpeechProvider: BotPluginApi["registerSpeechProvider"] = () => {};
const noopRegisterRealtimeTranscriptionProvider: BotPluginApi["registerRealtimeTranscriptionProvider"] =
  () => {};
const noopRegisterRealtimeVoiceProvider: BotPluginApi["registerRealtimeVoiceProvider"] =
  () => {};
const noopRegisterMediaUnderstandingProvider: BotPluginApi["registerMediaUnderstandingProvider"] =
  () => {};
const noopRegisterTranscriptsSourceProvider: BotPluginApi["registerTranscriptSourceProvider"] =
  () => {};
const noopRegisterImageGenerationProvider: BotPluginApi["registerImageGenerationProvider"] =
  () => {};
const noopRegisterVideoGenerationProvider: BotPluginApi["registerVideoGenerationProvider"] =
  () => {};
const noopRegisterMusicGenerationProvider: BotPluginApi["registerMusicGenerationProvider"] =
  () => {};
const noopRegisterWebFetchProvider: BotPluginApi["registerWebFetchProvider"] = () => {};
const noopRegisterWebSearchProvider: BotPluginApi["registerWebSearchProvider"] = () => {};
const noopRegisterInteractiveHandler: BotPluginApi["registerInteractiveHandler"] = () => {};
const noopOnConversationBindingResolved: BotPluginApi["onConversationBindingResolved"] =
  () => {};
const noopRegisterCommand: BotPluginApi["registerCommand"] = () => {};
const noopRegisterContextEngine: BotPluginApi["registerContextEngine"] = () => {};
const noopRegisterCompactionProvider: BotPluginApi["registerCompactionProvider"] = () => {};
const noopRegisterAgentHarness: BotPluginApi["registerAgentHarness"] = () => {};
const noopRegisterCodexAppServerExtensionFactory: BotPluginApi["registerCodexAppServerExtensionFactory"] =
  () => {};
const noopRegisterAgentToolResultMiddleware: BotPluginApi["registerAgentToolResultMiddleware"] =
  () => {};
const noopRegisterSessionExtension: BotPluginApi["registerSessionExtension"] = () => {};
const noopEnqueueNextTurnInjection: BotPluginApi["enqueueNextTurnInjection"] = async (
  injection,
) => ({ enqueued: false, id: "", sessionKey: injection.sessionKey });
const noopRegisterTrustedToolPolicy: BotPluginApi["registerTrustedToolPolicy"] = () => {};
const noopRegisterToolMetadata: BotPluginApi["registerToolMetadata"] = () => {};
const noopRegisterControlUiDescriptor: BotPluginApi["registerControlUiDescriptor"] = () => {};
const noopRegisterRuntimeLifecycle: BotPluginApi["registerRuntimeLifecycle"] = () => {};
const noopRegisterAgentEventSubscription: BotPluginApi["registerAgentEventSubscription"] =
  () => {};
const noopEmitAgentEvent: BotPluginApi["emitAgentEvent"] = () => ({
  emitted: false,
  reason: "not wired",
});
const noopSetRunContext: BotPluginApi["setRunContext"] = () => false;
const noopGetRunContext: BotPluginApi["getRunContext"] = () => undefined;
const noopClearRunContext: BotPluginApi["clearRunContext"] = () => {};
const noopRegisterSessionSchedulerJob: BotPluginApi["registerSessionSchedulerJob"] = () =>
  undefined;
const noopRegisterSessionAction: BotPluginApi["registerSessionAction"] = () => {};
const noopSendSessionAttachment: BotPluginApi["sendSessionAttachment"] = async () => ({
  ok: false,
  error: "not wired",
});
const noopScheduleSessionTurn: BotPluginApi["scheduleSessionTurn"] = async () => undefined;
const noopUnscheduleSessionTurnsByTag: BotPluginApi["unscheduleSessionTurnsByTag"] =
  async () => ({ removed: 0, failed: 0 });
const noopRegisterDetachedTaskRuntime: BotPluginApi["registerDetachedTaskRuntime"] = () => {};
const noopRegisterMemoryCapability: BotPluginApi["registerMemoryCapability"] = () => {};
const noopRegisterMemoryPromptSupplement: BotPluginApi["registerMemoryPromptSupplement"] =
  () => {};
const noopRegisterMemoryPromptPreparation: BotPluginApi["registerMemoryPromptPreparation"] =
  () => {};
const noopRegisterMemoryCorpusSupplement: BotPluginApi["registerMemoryCorpusSupplement"] =
  () => {};
const noopRegisterMemoryEmbeddingProvider: BotPluginApi["registerMemoryEmbeddingProvider"] =
  () => {};
const noopOn: BotPluginApi["on"] = () => {};

export function buildPluginApi(params: BuildPluginApiParams): BotPluginApi {
  const handlers = params.handlers ?? {};
  const registerCli = handlers.registerCli ?? noopRegisterCli;
  const api: BotPluginApiWithoutFacades = {
    id: params.id,
    name: params.name,
    version: params.version,
    description: params.description,
    source: params.source,
    rootDir: params.rootDir,
    registrationMode: params.registrationMode,
    config: params.config,
    pluginConfig: params.pluginConfig,
    runtime: params.runtime,
    logger: params.logger,
    registerTool: handlers.registerTool ?? noopRegisterTool,
    registerHook: handlers.registerHook ?? noopRegisterHook,
    registerHttpRoute: handlers.registerHttpRoute ?? noopRegisterHttpRoute,
    registerHostedMediaResolver:
      handlers.registerHostedMediaResolver ?? noopRegisterHostedMediaResolver,
    registerMcpServerConnectionResolver:
      handlers.registerMcpServerConnectionResolver ?? noopRegisterMcpServerConnectionResolver,
    registerChannel: handlers.registerChannel ?? noopRegisterChannel,
    registerGatewayMethod: handlers.registerGatewayMethod ?? noopRegisterGatewayMethod,
    registerSessionCatalog: handlers.registerSessionCatalog ?? noopRegisterSessionCatalog,
    registerCli,
    registerNodeCliFeature: (registrar, opts) =>
      registerCli(registrar, {
        ...opts,
        parentPath: ["nodes"],
      }),
    registerReload: handlers.registerReload ?? noopRegisterReload,
    registerNodeHostCommand: handlers.registerNodeHostCommand ?? noopRegisterNodeHostCommand,
    registerNodeInvokePolicy: handlers.registerNodeInvokePolicy ?? noopRegisterNodeInvokePolicy,
    registerSecurityAuditCollector:
      handlers.registerSecurityAuditCollector ?? noopRegisterSecurityAuditCollector,
    registerService: handlers.registerService ?? noopRegisterService,
    registerGatewayDiscoveryService:
      handlers.registerGatewayDiscoveryService ?? noopRegisterGatewayDiscoveryService,
    registerCliBackend: handlers.registerCliBackend ?? noopRegisterCliBackend,
    registerTextTransforms: handlers.registerTextTransforms ?? noopRegisterTextTransforms,
    registerConfigMigration: handlers.registerConfigMigration ?? noopRegisterConfigMigration,
    registerMigrationProvider: handlers.registerMigrationProvider ?? noopRegisterMigrationProvider,
    registerAutoEnableProbe: handlers.registerAutoEnableProbe ?? noopRegisterAutoEnableProbe,
    registerProvider: handlers.registerProvider ?? noopRegisterProvider,
    registerWorkerProvider: handlers.registerWorkerProvider ?? noopRegisterWorkerProvider,
    registerModelCatalogProvider:
      handlers.registerModelCatalogProvider ?? noopRegisterModelCatalogProvider,
    registerEmbeddingProvider: handlers.registerEmbeddingProvider ?? noopRegisterEmbeddingProvider,
    registerSpeechProvider: handlers.registerSpeechProvider ?? noopRegisterSpeechProvider,
    registerRealtimeTranscriptionProvider:
      handlers.registerRealtimeTranscriptionProvider ?? noopRegisterRealtimeTranscriptionProvider,
    registerRealtimeVoiceProvider:
      handlers.registerRealtimeVoiceProvider ?? noopRegisterRealtimeVoiceProvider,
    registerMediaUnderstandingProvider:
      handlers.registerMediaUnderstandingProvider ?? noopRegisterMediaUnderstandingProvider,
    registerTranscriptSourceProvider:
      handlers.registerTranscriptSourceProvider ?? noopRegisterTranscriptsSourceProvider,
    registerImageGenerationProvider:
      handlers.registerImageGenerationProvider ?? noopRegisterImageGenerationProvider,
    registerVideoGenerationProvider:
      handlers.registerVideoGenerationProvider ?? noopRegisterVideoGenerationProvider,
    registerMusicGenerationProvider:
      handlers.registerMusicGenerationProvider ?? noopRegisterMusicGenerationProvider,
    registerWebFetchProvider: handlers.registerWebFetchProvider ?? noopRegisterWebFetchProvider,
    registerWebSearchProvider: handlers.registerWebSearchProvider ?? noopRegisterWebSearchProvider,
    registerInteractiveHandler:
      handlers.registerInteractiveHandler ?? noopRegisterInteractiveHandler,
    onConversationBindingResolved:
      handlers.onConversationBindingResolved ?? noopOnConversationBindingResolved,
    registerCommand: handlers.registerCommand ?? noopRegisterCommand,
    registerContextEngine: handlers.registerContextEngine ?? noopRegisterContextEngine,
    registerCompactionProvider:
      handlers.registerCompactionProvider ?? noopRegisterCompactionProvider,
    registerAgentHarness: handlers.registerAgentHarness ?? noopRegisterAgentHarness,
    registerCodexAppServerExtensionFactory:
      handlers.registerCodexAppServerExtensionFactory ?? noopRegisterCodexAppServerExtensionFactory,
    registerAgentToolResultMiddleware:
      handlers.registerAgentToolResultMiddleware ?? noopRegisterAgentToolResultMiddleware,
    registerSessionExtension: handlers.registerSessionExtension ?? noopRegisterSessionExtension,
    enqueueNextTurnInjection: handlers.enqueueNextTurnInjection ?? noopEnqueueNextTurnInjection,
    registerTrustedToolPolicy: handlers.registerTrustedToolPolicy ?? noopRegisterTrustedToolPolicy,
    registerToolMetadata: handlers.registerToolMetadata ?? noopRegisterToolMetadata,
    registerControlUiDescriptor:
      handlers.registerControlUiDescriptor ?? noopRegisterControlUiDescriptor,
    registerRuntimeLifecycle: handlers.registerRuntimeLifecycle ?? noopRegisterRuntimeLifecycle,
    registerAgentEventSubscription:
      handlers.registerAgentEventSubscription ?? noopRegisterAgentEventSubscription,
    emitAgentEvent: handlers.emitAgentEvent ?? noopEmitAgentEvent,
    setRunContext: handlers.setRunContext ?? noopSetRunContext,
    getRunContext: handlers.getRunContext ?? noopGetRunContext,
    clearRunContext: handlers.clearRunContext ?? noopClearRunContext,
    registerSessionSchedulerJob:
      handlers.registerSessionSchedulerJob ?? noopRegisterSessionSchedulerJob,
    registerSessionAction: handlers.registerSessionAction ?? noopRegisterSessionAction,
    sendSessionAttachment: handlers.sendSessionAttachment ?? noopSendSessionAttachment,
    scheduleSessionTurn: handlers.scheduleSessionTurn ?? noopScheduleSessionTurn,
    unscheduleSessionTurnsByTag:
      handlers.unscheduleSessionTurnsByTag ?? noopUnscheduleSessionTurnsByTag,
    registerDetachedTaskRuntime:
      handlers.registerDetachedTaskRuntime ?? noopRegisterDetachedTaskRuntime,
    registerMemoryCapability: handlers.registerMemoryCapability ?? noopRegisterMemoryCapability,
    registerMemoryPromptSupplement:
      handlers.registerMemoryPromptSupplement ?? noopRegisterMemoryPromptSupplement,
    registerMemoryPromptPreparation:
      handlers.registerMemoryPromptPreparation ?? noopRegisterMemoryPromptPreparation,
    registerMemoryCorpusSupplement:
      handlers.registerMemoryCorpusSupplement ?? noopRegisterMemoryCorpusSupplement,
    registerMemoryEmbeddingProvider:
      handlers.registerMemoryEmbeddingProvider ?? noopRegisterMemoryEmbeddingProvider,
    resolvePath: params.resolvePath,
    on: handlers.on ?? noopOn,
  };
  return attachPluginApiFacades(api);
}
