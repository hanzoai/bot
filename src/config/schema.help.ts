import { IRC_FIELD_HELP } from "./schema.irc.js";

export const FIELD_HELP: Record<string, string> = {
  "meta.lastTouchedVersion": "Auto-set when Bot writes the config.",
  "meta.lastTouchedAt": "ISO timestamp of the last config write (auto-set).",
  "update.channel": 'Update channel for git + npm installs ("stable", "beta", or "dev").',
  "update.checkOnStart": "Check for npm updates when the gateway starts (default: true).",
  "gateway.remote.url": "Remote Gateway WebSocket URL (ws:// or wss://).",
  "gateway.remote.tlsFingerprint":
    "Expected sha256 TLS fingerprint for the remote gateway (pin to avoid MITM).",
  "gateway.remote.sshTarget":
    "Remote gateway over SSH (tunnels the gateway port to localhost). Format: user@host or user@host:port.",
  "gateway.remote.sshIdentity": "Optional SSH identity file path (passed to ssh -i).",
  "agents.list.*.skills":
    "Optional allowlist of skills for this agent (omit = all skills; empty = no skills).",
  "agents.list[].skills":
    "Optional allowlist of skills for this agent (omit = all skills; empty = no skills).",
  "agents.list[].identity.avatar":
    "Avatar image path (relative to the agent workspace only) or a remote URL/data URL.",
  "agents.defaults.heartbeat.suppressToolErrorWarnings":
    "Suppress tool error warning payloads during heartbeat runs.",
  "agents.list[].heartbeat.suppressToolErrorWarnings":
    "Suppress tool error warning payloads during heartbeat runs.",
  "discovery.mdns.mode":
    'mDNS broadcast mode ("minimal" default, "full" includes cliPath/sshPort, "off" disables mDNS).',
  "gateway.auth.token":
    "Required by default for gateway access (unless using Tailscale Serve identity); required for non-loopback binds.",
  "gateway.auth.password":
    "Sets the password used for HTTP Basic authentication to the gateway. Use when gateway.auth.mode is set to password. Required for Tailscale funnel deployments.",
  "gateway.controlUi.basePath": "Optional URL prefix where the Control UI is served (e.g. /bot).",
  "gateway.controlUi.root":
    "Optional filesystem root for Control UI assets (defaults to dist/control-ui).",
  "gateway.controlUi.allowedOrigins":
    "Allowed browser origins for Control UI/WebChat websocket connections (full origins only, e.g. https://control.example.com).",
  "gateway.controlUi.allowInsecureAuth":
    "Enable Control UI auth over insecure HTTP (token-only; not recommended). Use only for development behind a trusted reverse proxy.",
  "gateway.http.endpoints.chatCompletions.enabled":
    "Enable the OpenAI-compatible `POST /v1/chat/completions` endpoint (default: false).",
  "gateway.reload.mode": 'Hot reload strategy for config changes ("hybrid" recommended).',
  "gateway.reload.debounceMs": "Debounce window (ms) before applying config changes.",
  "gateway.nodes.browser.mode":
    'Node browser routing ("auto" = pick single connected browser node, "manual" = require node param, "off" = disable).',
  "gateway.nodes.browser.node": "Pin browser routing to a specific node id or name (optional).",
  "gateway.nodes.allowCommands":
    "Extra node.invoke commands to allow beyond the gateway defaults (array of command strings).",
  "gateway.nodes.denyCommands":
    "Commands to block even if present in node claims or default allowlist.",
  "nodeHost.browserProxy.enabled":
    "Enable exposing the local browser control server via node proxy. Use to share browser automation capabilities with the gateway through the node connection.",
  "nodeHost.browserProxy.allowProfiles":
    "Optional allowlist of browser profile names exposed via the node proxy. Use to restrict which profiles are accessible to the gateway from this node.",
  "diagnostics.flags":
    'Enable targeted diagnostics logs by flag (e.g. ["telegram.http"]). Supports wildcards like "telegram.*" or "*".',
  "diagnostics.cacheTrace.enabled":
    "Log cache trace snapshots for embedded agent runs (default: false).",
  "diagnostics.cacheTrace.filePath":
    "JSONL output path for cache trace logs (default: $BOT_STATE_DIR/logs/cache-trace.jsonl).",
  "diagnostics.cacheTrace.includeMessages":
    "Include full message payloads in trace output (default: true).",
  "diagnostics.cacheTrace.includePrompt": "Include prompt text in trace output (default: true).",
  "diagnostics.cacheTrace.includeSystem": "Include system prompt in trace output (default: true).",
  "tools.exec.applyPatch.enabled":
    "Experimental. Enables apply_patch for OpenAI models when allowed by tool policy.",
  "tools.exec.applyPatch.workspaceOnly":
    "Restrict apply_patch paths to the workspace directory (default: true). Set false to allow writing outside the workspace (dangerous).",
  "tools.exec.applyPatch.allowModels":
    'Optional allowlist of model ids (e.g. "gpt-5.2" or "openai/gpt-5.2").',
  "tools.exec.notifyOnExit":
    "When true (default), backgrounded exec sessions enqueue a system event and request a heartbeat on exit.",
  "tools.exec.notifyOnExitEmptySuccess":
    "When true, successful backgrounded exec exits with empty output still enqueue a completion system event (default: false).",
  "tools.exec.pathPrepend": "Directories to prepend to PATH for exec runs (gateway/sandbox).",
  "tools.exec.safeBins":
    "Allow stdin-only safe binaries to run without explicit allowlist entries.",
  "tools.fs.workspaceOnly":
    "Restrict filesystem tools (read/write/edit/apply_patch) to the workspace directory (default: false).",
  "tools.sessions.visibility":
    'Controls which sessions can be targeted by sessions_list/sessions_history/sessions_send. ("tree" default = current session + spawned subagent sessions; "self" = only current; "agent" = any session in the current agent id; "all" = any session; cross-agent still requires tools.agentToAgent).',
  "tools.message.allowCrossContextSend":
    "Legacy override: allow cross-context sends across all providers.",
  "tools.message.crossContext.allowWithinProvider":
    "Allow sends to other channels within the same provider (default: true).",
  "tools.message.crossContext.allowAcrossProviders":
    "Allow sends across different providers (default: false).",
  "tools.message.crossContext.marker.enabled":
    "Add a visible origin marker when sending cross-context (default: true).",
  "tools.message.crossContext.marker.prefix":
    'Text prefix for cross-context markers (supports "{channel}").',
  "tools.message.crossContext.marker.suffix":
    'Text suffix for cross-context markers (supports "{channel}").',
  "tools.message.broadcast.enabled": "Enable broadcast action (default: true).",
  "tools.web.search.enabled":
    "Enable the web_search tool for agents to query search engines. Use with a provider API key (Brave or Perplexity) to allow agents to perform live web searches.",
  "tools.web.search.provider": 'Search provider ("brave" or "perplexity").',
  "tools.web.search.apiKey": "Brave Search API key (fallback: BRAVE_API_KEY env var).",
  "tools.web.search.maxResults": "Default number of results to return (1-10).",
  "tools.web.search.timeoutSeconds": "Timeout in seconds for web_search requests.",
  "tools.web.search.cacheTtlMinutes": "Cache TTL in minutes for web_search results.",
  "tools.web.search.perplexity.apiKey":
    "Perplexity or OpenRouter API key (fallback: PERPLEXITY_API_KEY or OPENROUTER_API_KEY env var).",
  "tools.web.search.perplexity.baseUrl":
    "Perplexity base URL override (default: https://openrouter.ai/api/v1 or https://api.perplexity.ai).",
  "tools.web.search.perplexity.model":
    'Perplexity model override (default: "perplexity/sonar-pro").',
  "tools.web.urlAllowlist":
    "Optional URL/domain allowlist shared by web_search and web_fetch. Accepts domain patterns like 'example.com', '*.github.com'. When configured, only matching URLs are allowed.",
  "tools.web.fetch.enabled":
    "Enable the web_fetch tool for agents to retrieve web page content. Use to allow agents to fetch and read URLs for context gathering during conversations.",
  "tools.web.fetch.maxChars":
    "Sets the maximum characters returned by the web_fetch tool before truncation. Use to control how much page content is injected into the agent context window.",
  "tools.web.fetch.maxCharsCap":
    "Hard cap for web_fetch maxChars (applies to config and tool calls).",
  "tools.web.fetch.timeoutSeconds": "Timeout in seconds for web_fetch requests.",
  "tools.web.fetch.cacheTtlMinutes": "Cache TTL in minutes for web_fetch results.",
  "tools.web.fetch.maxRedirects": "Maximum redirects allowed for web_fetch (default: 3).",
  "tools.web.fetch.userAgent": "Override User-Agent header for web_fetch requests.",
  "tools.web.fetch.readability":
    "Use Readability to extract main content from HTML (fallbacks to basic HTML cleanup).",
  "tools.web.fetch.firecrawl.enabled": "Enable Firecrawl fallback for web_fetch (if configured).",
  "tools.web.fetch.firecrawl.apiKey": "Firecrawl API key (fallback: FIRECRAWL_API_KEY env var).",
  "tools.web.fetch.firecrawl.baseUrl":
    "Firecrawl base URL (e.g. https://api.firecrawl.dev or custom endpoint).",
  "tools.web.fetch.firecrawl.onlyMainContent":
    "When true, Firecrawl returns only the main content (default: true).",
  "tools.web.fetch.firecrawl.maxAgeMs":
    "Firecrawl maxAge (ms) for cached results when supported by the API.",
  "tools.web.fetch.firecrawl.timeoutSeconds": "Timeout in seconds for Firecrawl requests.",
  "channels.slack.allowBots":
    "Allow bot-authored messages to trigger Slack replies (default: false).",
  "channels.slack.thread.historyScope":
    'Scope for Slack thread history context ("thread" isolates per thread; "channel" reuses channel history).',
  "channels.slack.thread.inheritParent":
    "If true, Slack thread sessions inherit the parent channel transcript (default: false).",
  "channels.slack.thread.initialHistoryLimit":
    "Maximum number of existing Slack thread messages to fetch when starting a new thread session (default: 20, set to 0 to disable).",
  "channels.mattermost.botToken":
    "Bot token from Mattermost System Console -> Integrations -> Bot Accounts.",
  "channels.mattermost.baseUrl":
    "Base URL for your Mattermost server (e.g., https://chat.example.com).",
  "channels.mattermost.chatmode":
    'Reply to channel messages on mention ("oncall"), on trigger chars (">" or "!") ("onchar"), or on every message ("onmessage").',
  "channels.mattermost.oncharPrefixes": 'Trigger prefixes for onchar mode (default: [">", "!"]).',
  "channels.mattermost.requireMention":
    "Require @mention in channels before responding (default: true).",
  "auth.profiles": "Named auth profiles (provider + mode + optional email).",
  "auth.order": "Ordered auth profile IDs per provider (used for automatic failover).",
  "auth.cooldowns.billingBackoffHours":
    "Base backoff (hours) when a profile fails due to billing/insufficient credits (default: 5).",
  "auth.cooldowns.billingBackoffHoursByProvider":
    "Optional per-provider overrides for billing backoff (hours).",
  "auth.cooldowns.billingMaxHours": "Cap (hours) for billing backoff (default: 24).",
  "auth.cooldowns.failureWindowHours": "Failure window (hours) for backoff counters (default: 24).",
  "agents.defaults.bootstrapMaxChars":
    "Max characters of each workspace bootstrap file injected into the system prompt before truncation (default: 20000).",
  "agents.defaults.bootstrapTotalMaxChars":
    "Max total characters across all injected workspace bootstrap files (default: 150000).",
  "agents.defaults.repoRoot":
    "Optional repository root shown in the system prompt runtime line (overrides auto-detect).",
  "agents.defaults.envelopeTimezone":
    'Timezone for message envelopes ("utc", "local", "user", or an IANA timezone string).',
  "agents.defaults.envelopeTimestamp":
    'Include absolute timestamps in message envelopes ("on" or "off").',
  "agents.defaults.envelopeElapsed": 'Include elapsed time in message envelopes ("on" or "off").',
  "agents.defaults.models": "Configured model catalog (keys are full provider/model IDs).",
  "agents.defaults.memorySearch":
    "Vector search over MEMORY.md and memory/*.md (per-agent overrides supported). Use to enable semantic recall of stored knowledge during agent conversations.",
  "agents.defaults.memorySearch.sources":
    'Sources to index for memory search (default: ["memory"]; add "sessions" to include session transcripts). Controls which content feeds the search index.',
  "agents.defaults.memorySearch.extraPaths":
    "Extra paths to include in memory search (directories or .md files; relative paths resolved from workspace). Use to extend the index beyond the default memory directory.",
  "agents.defaults.memorySearch.experimental.sessionMemory":
    "Enable experimental session transcript indexing for memory search (default: false). Use to make past conversations searchable.",
  "agents.defaults.memorySearch.provider":
    'Embedding provider for memory search: "openai" uses OpenAI embeddings, "gemini" uses Google Gemini, "voyage" uses Voyage AI, "local" uses a local GGUF model. Default: openai.',
  "agents.defaults.memorySearch.remote.baseUrl":
    "Custom base URL for remote embeddings (OpenAI-compatible proxies or Gemini overrides). Use to route embedding requests through a proxy or custom endpoint.",
  "agents.defaults.memorySearch.remote.apiKey":
    "Custom API key for the remote embedding provider. Use an environment variable or secret manager URI to avoid plaintext credential storage in config.",
  "agents.defaults.memorySearch.remote.headers":
    "Extra headers for remote embedding requests (merged with defaults; remote overrides OpenAI headers). Use for custom auth or routing headers.",
  "agents.defaults.memorySearch.remote.batch.enabled":
    "Enable batch API for memory embeddings (OpenAI/Gemini; default: true). Use batch mode to reduce API calls when indexing many documents at once.",
  "agents.defaults.memorySearch.remote.batch.wait":
    "Wait for batch completion when indexing (default: true). Disable to return immediately and poll for results asynchronously in the background.",
  "agents.defaults.memorySearch.remote.batch.concurrency":
    "Max concurrent embedding batch jobs for memory indexing (default: 2). Use to control parallel API usage during bulk reindexing operations.",
  "agents.defaults.memorySearch.remote.batch.pollIntervalMs":
    "Polling interval in milliseconds for batch status checks (default: 2000). Use to control how frequently the gateway checks for batch completion.",
  "agents.defaults.memorySearch.remote.batch.timeoutMinutes":
    "Timeout in minutes for batch embedding jobs (default: 60). Use to prevent stuck batch jobs from blocking the indexing pipeline indefinitely.",
  "agents.defaults.memorySearch.local.modelPath":
    "Local GGUF model path or hf: URI for node-llama-cpp. Use to run embedding inference locally without a remote API. Supports Hugging Face model downloads.",
  "agents.defaults.memorySearch.fallback":
    'Fallback embedding provider when the primary fails: "openai", "gemini", "local", or "none". Use to ensure memory search works even when the primary provider is down.',
  "agents.defaults.memorySearch.store.path":
    "SQLite index path for memory search (default: ~/.hanzo/bot/memory/{agentId}.sqlite). Use to control where the vector index is stored on disk.",
  "agents.defaults.memorySearch.store.vector.enabled":
    "Enable sqlite-vec extension for vector search (default: true). Disable to fall back to BM25-only text search when vector extensions are not available.",
  "agents.defaults.memorySearch.store.vector.extensionPath":
    "Optional override path to the sqlite-vec extension library (.dylib/.so/.dll). Use when the auto-detected extension path does not match your system layout.",
  "agents.defaults.memorySearch.query.hybrid.enabled":
    "Enable hybrid BM25 + vector search for memory (default: true). Use to combine keyword and semantic matching for better recall and precision.",
  "agents.defaults.memorySearch.query.hybrid.vectorWeight":
    "Weight for vector similarity when merging hybrid results (0-1). Use to tune the balance between semantic and keyword relevance in search ranking.",
  "agents.defaults.memorySearch.query.hybrid.textWeight":
    "Weight for BM25 text relevance when merging hybrid results (0-1). Use to tune the balance between keyword and semantic relevance in search ranking.",
  "agents.defaults.memorySearch.query.hybrid.candidateMultiplier":
    "Multiplier for the candidate pool size in hybrid search (default: 4). Use to control how many candidates are retrieved before final re-ranking.",
  "agents.defaults.memorySearch.cache.enabled":
    "Cache chunk embeddings in SQLite to speed up reindexing and frequent updates (default: true). Disable to force fresh embeddings on every index operation.",
  memory: "Memory backend configuration (global).",
  "memory.backend":
    'Memory backend selection: "builtin" uses Bot\'s built-in vector embeddings for memory search, "qmd" uses the QMD sidecar process for document indexing and retrieval.',
  "memory.citations":
    'Citation display mode: "auto" shows citations when memory results are used, "on" always shows source citations on every memory-backed reply, "off" hides citations entirely. Use "auto" for a balanced experience.',
  "memory.qmd.command":
    "Path to the qmd binary. Default resolves from PATH. Use an absolute path to pin a specific version or override auto-detection.",
  "memory.qmd.includeDefaultMemory":
    "Controls whether QMD automatically indexes MEMORY.md + memory/**/*.md (default: true). Disable to use only explicitly configured paths.",
  "memory.qmd.paths":
    "Additional directories/files to index with QMD. Each entry defines a path and optional glob pattern. Use to extend the default MEMORY.md indexing with project-specific content.",
  "memory.qmd.paths.path":
    "Absolute or ~-relative path to index via QMD. Use to define the root directory for this QMD collection entry. Supports home-directory expansion.",
  "memory.qmd.paths.pattern":
    "Glob pattern relative to the path root (default: **/*.md). Use to filter which files within the path are indexed by QMD.",
  "memory.qmd.paths.name":
    "Optional stable name for the QMD collection (default derived from path). Use to control the collection identifier in QMD for stable references.",
  "memory.qmd.sessions.enabled":
    "Enable QMD session transcript indexing (experimental, default: false). Use to make past session conversations searchable via QMD memory recall.",
  "memory.qmd.sessions.exportDir":
    "Override directory for sanitized session exports before indexing. Use to control where session transcripts are written before QMD processes them.",
  "memory.qmd.sessions.retentionDays":
    "Retention window in days for exported sessions before pruning (default: unlimited). Use to control disk usage from accumulated session exports.",
  "memory.qmd.update.interval":
    "How often the QMD sidecar refreshes indexes (duration string, default: 5m). Use shorter intervals for frequently changing content or longer for stable corpora.",
  "memory.qmd.update.debounceMs":
    "Minimum delay in milliseconds between successive QMD refresh runs (default: 15000). Use to prevent rapid-fire re-indexing during batch file changes.",
  "memory.qmd.update.onBoot":
    "Run QMD update once on gateway startup (default: true). Enable to ensure memory indexes are fresh when the bot starts serving requests.",
  "memory.qmd.update.waitForBootSync":
    "Block startup until the boot QMD refresh finishes (default: false). Enable to ensure memory search is fully ready before accepting the first conversation.",
  "memory.qmd.update.embedInterval":
    "How often QMD embeddings are refreshed (duration string, default: 60m). Set to 0 to disable periodic embed.",
  "memory.qmd.update.commandTimeoutMs":
    "Timeout in milliseconds for QMD maintenance commands like collection list/add (default: 30000). Use a higher value for slow storage backends.",
  "memory.qmd.update.updateTimeoutMs":
    "Timeout in milliseconds for `qmd update` runs (default: 120000). Use a higher value if your QMD corpus is large and updates take longer.",
  "memory.qmd.update.embedTimeoutMs":
    "Timeout in milliseconds for `qmd embed` runs (default: 120000). Use a higher value when embedding large document collections that need more processing time.",
  "memory.qmd.limits.maxResults":
    "Max QMD results returned to the agent loop (default: 6). Use to control how many memory snippets the agent receives per query for context quality.",
  "memory.qmd.limits.maxSnippetChars":
    "Max characters per snippet pulled from QMD (default: 700). Use to control the length of each memory snippet injected into agent context.",
  "memory.qmd.limits.maxInjectedChars":
    "Max total characters injected from QMD hits per turn. Use to cap the combined length of all memory snippets to control context consumption.",
  "memory.qmd.limits.timeoutMs":
    "Per-query timeout in milliseconds for QMD searches (default: 4000). Use to prevent slow QMD queries from blocking the agent response pipeline.",
  "memory.qmd.scope":
    "Session/channel scope for QMD recall (same syntax as session.sendPolicy; default: direct-only). Use match.rawKeyPrefix to match full agent-prefixed session keys.",
  "agents.defaults.memorySearch.cache.maxEntries":
    "Optional cap on cached embeddings (best-effort). Use to limit memory consumption when the embedding cache grows large from indexing many documents.",
  "agents.defaults.memorySearch.sync.onSearch":
    "Lazy sync: schedule a reindex on search after changes are detected. Use to keep the memory index up to date without constant background indexing.",
  "agents.defaults.memorySearch.sync.watch":
    "Watch memory files for changes using chokidar. Enable to trigger automatic reindexing when MEMORY.md or memory/*.md files are modified on disk.",
  "agents.defaults.memorySearch.sync.sessions.deltaBytes":
    "Minimum appended bytes before session transcripts trigger reindex (default: 100000). Use to control how much new content accumulates before re-indexing sessions.",
  "agents.defaults.memorySearch.sync.sessions.deltaMessages":
    "Minimum appended JSONL lines before session transcripts trigger reindex (default: 50). Use to control the message count threshold for session re-indexing.",
  "plugins.enabled":
    "Enable plugin/extension loading (default: true). Disable to prevent all plugins from loading when troubleshooting or running in a minimal configuration.",
  "plugins.allow":
    "Optional allowlist of plugin ids; when set, only listed plugins load. Use to restrict which plugins are active in production environments.",
  "plugins.deny":
    "Optional denylist of plugin ids; deny wins over allowlist. Use to block specific plugins from loading regardless of the allow configuration.",
  "plugins.load":
    "Plugin loading configuration that controls which additional files and directories are scanned for plugins. Use plugins.load.paths to define extra discovery locations.",
  "plugins.load.paths":
    "Additional plugin files or directories to load. Use to define extra paths beyond the default extensions directory where plugins are discovered.",
  "plugins.slots":
    "Select which plugins own exclusive slots (memory, etc.). Use to control which plugin provides a specific capability when multiple plugins compete.",
  "plugins.slots.memory":
    'Select the active memory plugin by id, or "none" to disable memory plugins.',
  "plugins.entries":
    "Per-plugin settings keyed by plugin id (enable/disable + config payloads). Use to configure individual plugins with API keys, env vars, and custom config.",
  "plugins.entries.*.enabled":
    "Overrides plugin enable/disable for this entry (restart required). Use to selectively disable a plugin without removing its configuration.",
  "plugins.entries.*.config":
    "Plugin-defined config payload (schema is provided by the plugin). Use to pass custom settings specific to this plugin's requirements.",
  "plugins.installs":
    "CLI-managed install metadata (used by `bot plugins update` to locate install sources). Controls how installed plugins are tracked and updated.",
  "plugins.installs.*.source": 'Install source ("npm", "archive", or "path").',
  "plugins.installs.*.spec": "Original npm spec used for install (if source is npm).",
  "plugins.installs.*.sourcePath": "Original archive/path used for install (if any).",
  "plugins.installs.*.installPath": "Resolved install directory (usually ~/.bot/extensions/<id>).",
  "plugins.installs.*.version": "Version recorded at install time (if available).",
  "plugins.installs.*.installedAt": "ISO timestamp of last install/update.",
  "agents.list.*.identity.avatar":
    "Agent avatar (workspace-relative path, http(s) URL, or data URI).",
  "agents.defaults.model.primary": "Primary model (provider/model).",
  "agents.defaults.model.fallbacks":
    "Ordered fallback models (provider/model). Used when the primary model fails.",
  "agents.defaults.imageModel.primary":
    "Optional image model (provider/model) used when the primary model lacks image input.",
  "agents.defaults.imageModel.fallbacks": "Ordered fallback image models (provider/model).",
  "agents.defaults.cliBackends": "Optional CLI backends for text-only fallback (claude-cli, etc.).",
  "agents.defaults.humanDelay.mode": 'Delay style for block replies ("off", "natural", "custom").',
  "agents.defaults.humanDelay.minMs": "Minimum delay in ms for custom humanDelay (default: 800).",
  "agents.defaults.humanDelay.maxMs": "Maximum delay in ms for custom humanDelay (default: 2500).",
  "commands.native":
    "Register native commands with channels that support it (Discord/Slack/Telegram).",
  "commands.nativeSkills":
    "Register native skill commands (user-invocable skills) with channels that support it.",
  "commands.text": "Allow text command parsing (slash commands only).",
  "commands.bash":
    "Allow bash chat command (`!`; `/bash` alias) to run host shell commands (default: false; requires tools.elevated).",
  "commands.bashForegroundMs":
    "How long bash waits before backgrounding (default: 2000; 0 backgrounds immediately).",
  "commands.config": "Allow /config chat command to read/write config on disk (default: false).",
  "commands.debug": "Allow /debug chat command for runtime-only overrides (default: false).",
  "commands.restart": "Allow /restart and gateway restart tool actions (default: false).",
  "commands.useAccessGroups": "Enforce access-group allowlists/policies for commands.",
  "commands.ownerAllowFrom":
    "Explicit owner allowlist for owner-only tools/commands. Use channel-native IDs (optionally prefixed like \"whatsapp:+15551234567\"). '*' is ignored.",
  "session.dmScope":
    'DM session scoping: "main" keeps continuity; "per-peer", "per-channel-peer", or "per-account-channel-peer" isolates DM history (recommended for shared inboxes/multi-account).',
  "session.identityLinks":
    "Map canonical identities to provider-prefixed peer IDs for DM session linking (example: telegram:123456).",
  "channels.telegram.configWrites":
    "Allow Telegram to write config in response to channel events/commands (default: true).",
  "channels.slack.configWrites":
    "Allow Slack to write config in response to channel events/commands (default: true).",
  "channels.mattermost.configWrites":
    "Allow Mattermost to write config in response to channel events/commands (default: true).",
  "channels.discord.configWrites":
    "Allow Discord to write config in response to channel events/commands (default: true).",
  "channels.discord.proxy":
    "Proxy URL for Discord gateway WebSocket connections. Set per account via channels.discord.accounts.<id>.proxy.",
  "channels.whatsapp.configWrites":
    "Allow WhatsApp to write config in response to channel events/commands (default: true).",
  "channels.signal.configWrites":
    "Allow Signal to write config in response to channel events/commands (default: true).",
  "channels.imessage.configWrites":
    "Allow iMessage to write config in response to channel events/commands (default: true).",
  "channels.msteams.configWrites":
    "Allow Microsoft Teams to write config in response to channel events/commands (default: true).",
  // ── Root section descriptions ──────────────────────────────────────────
  meta: "Internal metadata written by Bot when it touches the config file. Controls version tracking and last-write timestamps used for upgrade heuristics.",
  env: "Environment variable injection and shell environment capture settings. Use env.vars to define static variables and env.shellEnv to capture the login shell environment at startup.",
  wizard:
    "Setup wizard metadata that tracks the last run state. Controls when and how the setup wizard re-runs to keep your configuration current.",
  diagnostics:
    "Diagnostics and observability settings including OpenTelemetry, cache tracing, and debug flags. Enable diagnostics to export traces, metrics, and logs to an OTEL collector.",
  logging:
    "Logging configuration controlling console and file output levels, formatting style, and sensitive-data redaction. Use logging.level to set the global minimum severity.",
  update:
    "Automatic update settings that control which release channel is tracked and whether the gateway checks for updates on startup.",
  browser:
    "Browser automation settings for headless or headed Chromium control. Use browser.cdpUrl to connect to an existing browser or enable browser.headless for serverless operation.",
  ui: "User interface customization for the control panel and assistant identity. Use ui.assistant to set the display name and avatar shown in chat interfaces.",
  auth: "Authentication profiles, provider ordering, and cooldown/backoff settings. Use auth.profiles to define multiple auth identities and auth.order to control failover priority.",
  models:
    "Model provider registry and discovery configuration. Use models.providers to define API endpoints and credentials, and models.bedrockDiscovery for AWS Bedrock auto-discovery.",
  nodeHost:
    "Node host settings that control how this machine exposes capabilities to the gateway. Use nodeHost.browserProxy to selectively share browser profiles with connected nodes.",
  agents:
    "Agent definitions, default parameters, model selection, and compaction behavior. Use agents.defaults to set shared configuration inherited by all agents unless overridden per-agent.",
  tools:
    "Tool availability, execution policy, and security settings. Use tools.allow and tools.deny to control which tools agents may invoke, and tools.exec for shell execution policy.",
  bindings:
    "Channel-to-agent binding rules that route messages to specific agents based on channel, account, peer, guild, or role criteria. Use bindings to define match rules for agent routing.",
  broadcast:
    "Broadcast relay settings that define how messages from one peer are forwarded to a set of destination peers. Use broadcast.strategy to choose parallel or sequential delivery.",
  audio:
    "Audio processing settings including transcription command configuration. Use audio.transcription to define the speech-to-text pipeline for voice messages.",
  media:
    "Media handling settings that control filename preservation and processing for attachments. Use media.preserveFilenames to keep original attachment names across channels.",
  messages:
    "Message processing pipeline configuration including queue behavior, group chat settings, prefix injection, and inbound batching. Use messages.queue to control how concurrent messages are handled.",
  commands:
    "Chat command availability and access control. Use commands.allowFrom to restrict who can invoke privileged commands like /config, /bash, and /restart.",
  approvals:
    "Execution approval workflow settings that gate tool calls on human review. Use approvals.exec to enable approval mode and define notification targets for pending requests.",
  session:
    "Session lifecycle, scoping, and maintenance configuration. Use session.scope to control how sessions map to conversations and session.maintenance to set retention and pruning policies.",
  cron: "Scheduled task runner configuration. Use cron.enabled to activate the scheduler, define jobs with cron expressions, and set retention and concurrency limits for runs.",
  hooks:
    "Inbound webhook handler configuration including route mappings, Gmail integration, and internal event handlers. Use hooks.mappings to define how incoming HTTP requests create agent sessions.",
  web: "Web UI provider settings that controls the embedded web server, heartbeat intervals, and WebSocket reconnect behavior. Use web.port and web.host to define the listener address.",
  channels:
    "Messaging channel configuration for Telegram, Discord, Slack, Signal, WhatsApp, iMessage, MS Teams, IRC, Mattermost, and more. Use per-channel sections to set tokens, policies, and stream modes.",
  discovery:
    "Service discovery settings for mDNS and wide-area networking. Use discovery.mdns to control how the gateway advertises itself on the local network.",
  canvasHost:
    "Built-in canvas web server for hosting agent-generated HTML/JS artifacts. Use canvasHost.enabled to serve a local dev server with optional live-reload support.",
  talk: "Text-to-speech configuration for voice output. Use talk.voiceId to select the TTS voice, talk.modelId for the synthesis model, and talk.outputFormat for the audio codec.",
  gateway:
    "Gateway server settings controlling bind address, authentication, TLS, hot-reload, and HTTP endpoints. Use gateway.mode to choose between local and remote gateway operation.",
  plugins:
    "Plugin/extension loading configuration. Use plugins.enabled to toggle the plugin system, plugins.allow/deny for access control, and plugins.entries for per-plugin settings.",

  // ── TARGET_KEYS: confusing fields needing ≥80-char operational guidance ──

  "memory.qmd.searchMode":
    'QMD search algorithm: "query" uses keyword matching, "search" uses full-text search, "vsearch" uses vector similarity search. Choose based on your index size and accuracy needs.',
  "memory.qmd.scope":
    "Session/channel scope for QMD recall (same syntax as session.sendPolicy; default: direct-only). Use match.rawKeyPrefix to match full agent-prefixed session keys.",
  "memory.qmd.mcporter":
    "MCP transport settings for the QMD sidecar. Controls how the bot communicates with QMD via the MCP protocol when running as a managed subprocess.",
  "memory.qmd.mcporter.enabled":
    "Enable the MCP transport layer for QMD communication. When enabled, the bot uses MCP instead of direct CLI invocation to interact with the QMD sidecar process.",
  "memory.qmd.mcporter.serverName":
    "Server name used for the QMD MCP transport registration. Controls the identifier used when the QMD sidecar registers with the MCP transport layer.",
  "memory.qmd.mcporter.startDaemon":
    "Enable automatic QMD daemon startup via MCP transport. When enabled, the bot starts the QMD sidecar as a managed daemon process on gateway boot.",
  "models.mode":
    'Provider merge strategy when resolving models.json: "merge" (default) combines implicit catalog models with explicit config entries, preserving user overrides; "replace" uses only explicit entries and discards the built-in catalog.',
  "models.providers.*.auth":
    'Authentication method for this provider endpoint: "api-key" sends a bearer API key, "token" sends a raw token, "oauth" uses OAuth2 flow, "aws-sdk" uses AWS SDK credential chain for Bedrock.',
  "models.providers.*.authHeader":
    "Custom HTTP header name used to send the authentication credential. Use when the provider expects a non-standard header instead of the default Authorization bearer token format.",
  "gateway.reload.mode":
    'Hot reload strategy for config changes: "off" disables reload, "restart" restarts the gateway process, "hot" applies changes in-place, "hybrid" (recommended) hot-reloads what it can and restarts for structural changes.',
  "gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback":
    "Allow falling back to the Host header for origin validation when the Origin header is absent. Controls a relaxed CORS check that may be needed behind certain reverse proxies but weakens CSRF protection.",
  "gateway.controlUi.dangerouslyDisableDeviceAuth":
    "Disable device authentication for the Control UI. When enabled, any client with a valid gateway token can access the Control UI without device-level verification. Use only for development or trusted networks.",
  "cron.enabled":
    "Enable or disable the cron scheduler. When disabled, no scheduled jobs run. Use cron.enabled=true to activate the scheduler and begin executing configured cron expressions.",
  "cron.store":
    "Storage backend for cron job state and run history. Controls where the scheduler persists job metadata, last-run timestamps, and execution results between gateway restarts.",
  "cron.maxConcurrentRuns":
    "Maximum number of cron jobs that may execute simultaneously. Use this to limit resource consumption when multiple jobs are scheduled at overlapping times. Default: 3.",
  "cron.webhook":
    'Deprecated. Legacy webhook URL for cron job delivery. Use delivery.mode="webhook" with delivery.to instead. This field is preserved for backward compatibility but will be removed in a future release.',
  "cron.webhookToken":
    "Bearer token sent with cron webhook deliveries. Use a strong secret and store it in an env variable or secret manager. Rotate periodically to limit exposure if compromised.",
  "cron.sessionRetention":
    'How long to keep completed cron session data. Accepts duration strings like "24h", "7d", or "1h30m". Set to false to disable automatic cleanup and retain sessions indefinitely.',
  "cron.runLog":
    "Configuration for the cron/runs execution log directory. Controls how run output files are retained and truncated to manage disk usage from scheduled job output.",
  "cron.runLog.maxBytes":
    "Maximum size of each cron run log file before truncation. Accepts size strings like 2mb or 500kb. Older content is discarded when the log exceeds this limit. Default: 2mb.",
  "cron.runLog.keepLines":
    "Number of most recent lines to keep when a cron run log is truncated due to maxBytes. Preserves the tail of the log for debugging. Default: 2000 lines retained after truncation.",
  session:
    "Session lifecycle, scoping, reset behavior, and maintenance configuration. Controls how conversations are tracked, when they reset, and how old session data is pruned or archived.",
  "session.scope":
    "Session scoping strategy that determines how conversations map to session keys. Use per-channel, per-peer, or per-account scoping to isolate or share conversation history.",
  "session.dmScope":
    'DM session scoping: "main" keeps continuity; "per-peer", "per-channel-peer", or "per-account-channel-peer" isolates DM history (recommended for shared inboxes/multi-account).',
  "session.identityLinks":
    "Map canonical identities to provider-prefixed peer IDs for DM session linking (example: telegram:123456). Use to unify sessions across providers for the same human user.",
  "session.resetTriggers":
    "Patterns or events that trigger automatic session resets. Use to define keywords, commands, or lifecycle events that clear the conversation context and start fresh.",
  "session.idleMinutes":
    "Minutes of inactivity before a session is considered idle. Use to control when idle sessions are eligible for automatic reset or compaction. Default depends on session.reset settings.",
  "session.reset":
    "Session reset behavior configuration controlling automatic context clearing. Use session.reset.mode to choose between scheduled resets and idle-based resets.",
  "session.reset.mode":
    "Reset scheduling mode that controls when sessions automatically clear their context. Use time-based scheduling or idle detection to keep conversations fresh.",
  "session.reset.atHour":
    "Hour of day (0-23) at which scheduled session resets occur. Use with session.reset.mode to define when daily resets happen. Timezone follows the gateway host.",
  "session.reset.idleMinutes":
    "Minutes of inactivity that triggers an idle-based session reset. Use to control how long a session can remain inactive before the conversation context is automatically cleared.",
  "session.resetByType":
    "Per-conversation-type reset overrides. Use to define different reset behavior for direct messages, DMs, group chats, and threads independently.",
  "session.resetByType.direct":
    "Reset override for direct (1:1) conversations. Set a different idle timeout or reset mode for direct messages than the global session.reset default applies.",
  "session.resetByType.dm":
    "Reset override for DM conversations. Set a different idle timeout or reset mode for DMs than the global session.reset default applies.",
  "session.resetByType.group":
    "Reset override for group chat conversations. Set a different idle timeout or reset mode for group chats than the global session.reset default applies.",
  "session.resetByType.thread":
    "Reset override for threaded conversations. Set a different idle timeout or reset mode for threads than the global session.reset default applies.",
  "session.resetByChannel":
    "Per-channel reset overrides keyed by channel name (e.g. discord, telegram). Use to define different reset behavior for specific messaging providers.",
  "session.store":
    "Session storage backend configuration. Controls where session transcripts and metadata are persisted between gateway restarts. Default uses local file storage.",
  "session.typingIntervalSeconds":
    "Interval in seconds between typing indicator updates sent to the channel while the agent is processing. Set to 0 to disable typing indicators. Default: 5.",
  "session.typingMode":
    "Controls when typing indicators are shown to users. Use to enable, disable, or customize the conditions under which the agent appears to be typing in the chat.",
  "session.mainKey":
    "Override the main session key used for the primary conversation. Use to customize the session key format when the default scoping strategy does not fit your routing needs.",
  "session.sendPolicy":
    "Message send policy configuration that controls which outbound messages are allowed, denied, or filtered based on channel, key prefix, or chat type matching rules.",
  "session.sendPolicy.default":
    "Default action for outbound messages when no specific rule matches. Set to allow or deny as the baseline policy before rule evaluation.",
  "session.sendPolicy.rules":
    'Ordered list of send-policy rules that controls which outbound messages are allowed or denied. Use match conditions with actions. Example: { action: "deny", match: { channel: "discord" } }.',
  "session.sendPolicy.rules[].action":
    "Action to take when this send-policy rule matches. Use allow to permit the message, deny to block it, or a custom filter. Rules are evaluated in order; first match wins.",
  "session.sendPolicy.rules[].match":
    "Match criteria that defines when this send-policy rule applies. Use channel, chatType, keyPrefix, and rawKeyPrefix conditions. All specified conditions must match.",
  "session.sendPolicy.rules[].match.channel":
    "Channel name to match (e.g. discord, telegram, slack). Use to restrict this rule to outbound messages on a specific channel provider.",
  "session.sendPolicy.rules[].match.chatType":
    "Chat type to match (e.g. direct, group, thread). Use to restrict this rule to outbound messages in a specific conversation type.",
  "session.sendPolicy.rules[].match.keyPrefix":
    "Normalized session key prefix to match. Uses the normalized (canonical) key format after Bot applies its standard key normalization rules for session routing.",
  "session.sendPolicy.rules[].match.rawKeyPrefix":
    "Raw (unnormalized) session key prefix to match. Uses the original key string before any normalization, useful for matching agent-prefixed or provider-specific key formats.",
  "session.agentToAgent":
    "Agent-to-agent communication settings. Use to define how agents send messages to each other and controls cross-agent session routing within the gateway.",
  "session.agentToAgent.maxPingPongTurns":
    "Max reply-back turns between requester and target (0-5). Controls the depth of recursive agent-to-agent conversations to prevent infinite loops.",
  "session.threadBindings":
    "Thread binding configuration that controls how sub-threads in messaging platforms are associated with parent sessions or agents.",
  "session.threadBindings.enabled":
    "Enable thread bindings to associate sub-threads with their parent session context. When disabled, threads start fresh sessions.",
  "session.threadBindings.ttlHours":
    "Time-to-live in hours for thread bindings before they expire. Use to control how long a thread remains bound to its parent session after the last activity.",
  "session.maintenance":
    "Session data maintenance settings controlling pruning, rotation, disk limits, and archive retention. Use to manage disk usage from accumulated session transcripts.",
  "session.maintenance.mode":
    "Maintenance mode that controls the strategy used for session data cleanup. Choose between age-based pruning, size-based rotation, or combined approaches.",
  "session.maintenance.pruneAfter":
    'Sets the duration after which inactive sessions are pruned. Use human-readable durations like "30d" for 30 days or "12h" for 12 hours. Sessions older than this are removed during maintenance.',
  "session.maintenance.pruneDays":
    "Deprecated. Use session.maintenance.pruneAfter instead. Number of days after which inactive sessions are pruned. Superseded by the more flexible duration-string format.",
  "session.maintenance.maxEntries":
    "Maximum number of session entries to retain per session store. When exceeded, the oldest sessions are pruned during maintenance. Use to cap session count regardless of age.",
  "session.maintenance.rotateBytes":
    'Sets the maximum session transcript size before rotation. Use size strings like "10mb" or "1gb". When a transcript exceeds this size, it is rotated to free space.',
  "session.maintenance.resetArchiveRetention":
    "Controls how long session .reset. archive snapshots are retained. Use duration strings. Set to false to disable archive retention and delete snapshots immediately after creation.",
  "session.maintenance.maxDiskBytes":
    'Sets a hard cap on total disk usage for all session data. Use size strings like "500mb" or "2gb". When exceeded, the oldest sessions are pruned to bring usage below the limit.',
  "session.maintenance.highWaterBytes":
    "Defines a soft limit expressed as a percentage (e.g. 80%) of maxDiskBytes. When disk usage exceeds this threshold, background maintenance begins pruning older sessions.",
  approvals:
    "Execution approval workflow configuration. Use approvals.exec to enable human-in-the-loop gating on tool calls, define notification targets, and set filtering rules.",
  "approvals.exec":
    "Exec approval settings that gate shell command and tool execution on human review. Use to define which sessions and agents require approval before executing commands.",
  "approvals.exec.enabled":
    "Enable or disable the exec approval workflow. When enabled, matching exec calls are held pending until a human approves or rejects the request via a notification target.",
  "approvals.exec.mode":
    'Selects the approval routing mode: "session" sends approval requests to the originating session, "targets" sends to configured notification targets, "both" sends to both session and targets.',
  "approvals.exec.agentFilter":
    'Glob or regex pattern that defines which agent IDs require exec approval. Use patterns like "primary" to match the primary agent or "ops-agent" to match a specific agent by name.',
  "approvals.exec.sessionFilter":
    'Substring or regex pattern that defines which sessions require exec approval. Use patterns like "discord:" to match all Discord sessions, or "^agent:ops:" to match agent-prefixed keys.',
  "approvals.exec.targets":
    "Defines notification targets for exec approval requests. Use to specify a channel, recipient, and optional thread for delivering approval prompts to reviewers.",
  "approvals.exec.targets[].channel":
    "Channel provider name for the approval notification target (e.g. discord, telegram, slack). Defines where the approval request is delivered.",
  "approvals.exec.targets[].to":
    "Recipient identifier for the approval target. This is a channel ID, user ID, or thread root that differs per provider. The format varies per provider; use the native ID format.",
  "approvals.exec.targets[].accountId":
    "Optional account ID override for multi-account channel setups. Use when the approval target channel has multiple bot accounts and you need to specify which account sends the notification.",
  "approvals.exec.targets[].threadId":
    "Optional thread or topic ID for routing the approval notification to a specific thread. Use to keep approval messages organized in a dedicated thread or topic.",
  nodeHost:
    "Node host settings that control how this machine exposes capabilities to the gateway. Use nodeHost.browserProxy to selectively share browser profiles with connected gateway nodes.",
  "nodeHost.browserProxy":
    "Browser proxy configuration for exposing local browser automation to the gateway. Use to share Chromium control with remote nodes through the gateway relay.",
  media:
    "Media handling settings that control filename preservation and attachment processing. Use media.preserveFilenames to keep original attachment names across channel providers.",
  "media.preserveFilenames":
    "Preserve original filenames on media attachments when forwarding between channels. When enabled, files keep their original names instead of receiving auto-generated identifiers.",
  audio:
    "Audio processing settings including transcription command configuration and timeout controls. Use audio.transcription to define the speech-to-text pipeline for voice messages.",
  "audio.transcription":
    "Transcription pipeline settings for converting audio attachments to text. Use audio.transcription.command to define the external transcription binary and its arguments.",
  "audio.transcription.command":
    'External transcription command template. Use {input} as the audio file placeholder. Example: "whisper-cli --model base --output-format txt {input}". The command must write text to stdout.',
  "audio.transcription.timeoutSeconds":
    "Maximum seconds to wait for the transcription command to complete before timing out. Use to prevent hung transcription processes from blocking the message pipeline. Default: 30.",
  bindings:
    "Channel-to-agent binding rules that route inbound messages to specific agents based on match criteria. Use bindings to define which agent handles messages from specific channels, peers, or roles.",
  "bindings[].agentId":
    "Agent ID that receives messages matching this binding rule. Use the agent identifier from agents.list to route matched conversations to the correct agent.",
  "bindings[].match":
    "Match criteria that defines when this binding rule applies. Use channel, accountId, peer, guildId, teamId, and roles conditions. All specified conditions must match.",
  "bindings[].match.channel":
    "Channel provider name to match for this binding (e.g. discord, telegram, slack). Use to restrict this binding to messages from a specific channel provider.",
  "bindings[].match.accountId":
    "Account ID to match for this binding. Use when running multiple bot accounts on the same channel and you need to route based on which account received the message.",
  "bindings[].match.peer":
    "Peer filter for this binding. Use peer.kind and peer.id to match specific conversation types and sender identifiers for fine-grained agent routing.",
  "bindings[].match.peer.kind":
    'Conversation type to match: "direct" for 1:1 messages, "group" for group chats, "channel" for server channels, "dm" for direct messages. Controls which conversation context triggers this binding.',
  "bindings[].match.peer.id":
    "Peer identifier to match for this binding. Use the channel-native peer ID (e.g. Discord user snowflake, Telegram chat ID) to route specific peers to designated agents.",
  "bindings[].match.guildId":
    "Discord guild (server) ID to match for this binding. Use to route all messages from a specific Discord server to a designated agent regardless of channel or peer.",
  "bindings[].match.teamId":
    "Slack team (workspace) ID to match for this binding. Use to route all messages from a specific Slack workspace to a designated agent regardless of channel.",
  "bindings[].match.roles":
    "Role names to match for this binding. When set, only messages from users with one of the specified roles trigger this binding. Use for role-based agent routing.",
  broadcast:
    "Broadcast relay settings that define how messages from one peer are forwarded to a set of destination peers. Use broadcast.strategy to choose parallel or sequential delivery.",
  "broadcast.strategy":
    'Broadcast delivery order: "parallel" sends to all destination peers concurrently for lowest latency; "sequential" sends one-by-one in order, useful when delivery ordering matters.',
  "broadcast.*":
    "Broadcast relay map entry keyed by source peer ID, with an array of destination peer IDs as the value. Each entry defines a one-to-many relay from a single sender to multiple recipients.",
  commands:
    "Chat command availability and access control settings. Use commands.allowFrom to restrict who can invoke privileged commands, and per-command toggles to enable or disable specific capabilities.",
  "commands.allowFrom":
    "Explicit allowlist of user identifiers permitted to invoke privileged chat commands. Use channel-native IDs (e.g. telegram:123456, discord:snowflake). Empty means no restrictions.",
  hooks:
    "Inbound webhook handler configuration including route mappings, Gmail integration, and internal event handlers. Use hooks.mappings to define how incoming HTTP requests create or wake agent sessions.",
  "hooks.enabled":
    "Enable or disable the webhook handler subsystem. When disabled, no inbound webhooks are accepted. Use hooks.enabled=true to activate the HTTP webhook endpoint.",
  "hooks.path":
    "URL path prefix for the webhook handler endpoint. Controls where inbound webhook requests are routed on the gateway HTTP server. Default: /hooks.",
  "hooks.token":
    "Shared secret token for authenticating inbound webhook requests. When set, incoming requests must include this token. Use a strong random value and rotate periodically.",
  "hooks.defaultSessionKey":
    "Default session key assigned to webhook-triggered sessions when no session key is provided in the request. Use to control which session context webhook messages land in.",
  "hooks.allowRequestSessionKey":
    "Allow inbound webhook requests to specify a custom session key. When enabled, the request payload can override the default session key for routing flexibility.",
  "hooks.allowedSessionKeyPrefixes":
    "Allowlist of session key prefixes that webhook requests may specify. Use to restrict which session namespaces webhooks can target when allowRequestSessionKey is enabled.",
  "hooks.allowedAgentIds":
    "Allowlist of agent IDs that webhooks may target. Use to restrict which agents can be woken or messaged via inbound webhooks. Empty means all agents are eligible.",
  "hooks.maxBodyBytes":
    "Maximum request body size in bytes for inbound webhook payloads. Use to prevent oversized payloads from consuming excessive memory. Default: 1048576 (1MB).",
  "hooks.transformsDir":
    "Directory containing webhook transform modules loaded at startup. Use to define custom JavaScript/TypeScript transforms that preprocess webhook payloads before delivery.",
  "hooks.mappings":
    "Ordered list of webhook route mappings that defines how inbound HTTP requests are matched and dispatched to agent sessions. Use top-to-bottom evaluation order; first match wins.",
  "hooks.mappings[].action":
    'Selects the dispatch action when this mapping matches: "wake" starts or resumes an agent session with the webhook payload; "agent" routes directly to a specific agent for processing.',
  "hooks.mappings[].wakeMode":
    'Controls timing for wake dispatch: "now" wakes the agent immediately on webhook receipt; "next-heartbeat" defers wake until the next scheduled heartbeat cycle for batched processing.',
  "hooks.mappings[].channel":
    "Channel routing override for this webhook mapping. Use to associate the webhook payload with a specific messaging channel context for session scoping and reply routing.",
  "hooks.mappings[].transform.module":
    "Sets the path to a custom transform module (relative to hooks.transformsDir). The module preprocesses the webhook payload before dispatch. Paths must be reviewed and controlled to prevent path traversal attacks.",
  "hooks.gmail":
    "Gmail webhook integration settings. Use to configure push notification subscriptions for Gmail accounts, enabling the bot to process incoming emails as agent messages.",
  "hooks.gmail.pushToken":
    "Push notification verification token for Gmail webhook subscriptions. Use a unique random string that Gmail includes in push payloads for request authenticity validation.",
  "hooks.gmail.tailscale.mode":
    'Tailscale exposure mode for the Gmail webhook endpoint: "off" disables Tailscale, "serve" exposes on the tailnet only, "funnel" exposes publicly via Tailscale Funnel.',
  "hooks.gmail.thinking":
    'Thinking depth for Gmail-triggered agent sessions: "off" disables extended thinking, "minimal" for brief reasoning, "low", "medium", or "high" for progressively deeper analysis.',
  "hooks.internal":
    "Internal event handler configuration. Use to define modules that respond to lifecycle events within the gateway without requiring external webhook calls.",
  "hooks.internal.handlers":
    "List of internal event handler registrations. Each handler defines an event pattern and a module that processes matching lifecycle events.",
  "hooks.internal.handlers[].event":
    "Event pattern that triggers this internal handler. Use event names from the gateway lifecycle (e.g. session.start, agent.idle) to react to specific internal events.",
  "hooks.internal.handlers[].module":
    "Module path for this internal event handler. Use a relative path from the hooks directory to a JavaScript/TypeScript module that exports a handler function.",
  "hooks.internal.load.extraDirs":
    "Additional directories to scan for internal event handler modules. Use to keep handler code organized outside the default hooks directory structure.",
  messages:
    "Message processing pipeline configuration including queue behavior, group chat settings, prefix injection, and inbound batching. Controls how the bot handles concurrent and rapid-fire messages.",
  "messages.messagePrefix":
    "Text prepended to every inbound message before the agent sees it. Use to inject context like channel metadata, sender info, or custom routing tags into the conversation.",
  "messages.responsePrefix":
    "Text prepended to every outbound agent response before delivery. Use to add consistent branding, status indicators, or routing metadata to all bot replies.",
  "messages.groupChat":
    "Group chat behavior settings controlling mention detection and history limits. Use to tune how the bot participates in multi-user conversations.",
  "messages.groupChat.mentionPatterns":
    "Custom regex patterns for detecting bot mentions in group chat messages. Use when the default @mention detection does not match your channel's mention format.",
  "messages.groupChat.historyLimit":
    "Maximum number of recent messages included in group chat context. Use to control how much conversation history the agent sees in busy group channels. Default: 50.",
  "messages.queue":
    "Message queue configuration that controls how concurrent inbound messages are batched, debounced, or interrupted during active agent processing. Use queue settings to tune throughput.",
  "messages.queue.mode":
    'Selects the queue behavior mode: "steer" redirects active runs, "followup" appends to current, "collect" batches all, "steer+backlog" steers with backlog, "steer-backlog" is an alias, "queue" holds in FIFO order, "interrupt" cancels current.',
  "messages.queue.byChannel":
    "Per-channel queue mode overrides keyed by channel name. Use to set different queue behavior for specific messaging providers when the global default does not fit.",
  "messages.queue.debounceMs":
    "Global debounce window in milliseconds for batching rapid inbound messages. Use to combine fast sequential messages into a single agent turn. Default: 0 (disabled).",
  "messages.queue.debounceMsByChannel":
    "Per-channel debounce window overrides in milliseconds. Use to tune debounce timing for specific channels that have different message pacing characteristics.",
  "messages.queue.cap":
    "Maximum number of queued messages before the queue starts dropping or summarizing. Use to prevent unbounded queue growth during high-traffic periods.",
  "messages.queue.drop":
    'Selects the overflow strategy when the queue reaches its cap: "old" drops oldest messages, "new" drops incoming messages, "summarize" condenses the queue into a summary before continuing.',
  "messages.inbound":
    "Inbound message processing settings that controls batching and per-channel overrides for how incoming messages are collected before agent processing begins.",
  "messages.inbound.byChannel":
    "Per-channel inbound processing overrides keyed by channel name. Use to set different debounce or batching settings for specific messaging providers.",
  "messages.removeAckAfterReply":
    "Remove the acknowledgment reaction after the agent sends its reply. Use to keep chat clean by removing the processing indicator once the response is delivered.",
  "messages.tts":
    "Text-to-speech settings for message delivery. Use to enable automatic voice synthesis of agent responses when the channel supports audio playback.",
  channels:
    "Messaging channel configuration for Telegram, Discord, Slack, Signal, WhatsApp, iMessage, MS Teams, IRC, Mattermost, and more. Use per-channel sections to define tokens, policies, and stream modes.",
  "channels.defaults":
    "Default settings inherited by all channels unless overridden per-channel. Use to set baseline group policy, heartbeat behavior, and other shared channel configuration.",
  "channels.defaults.groupPolicy":
    'Default group chat access policy: "open" allows all group messages, "disabled" ignores group messages entirely, "allowlist" requires explicit group chat allowlist entries.',
  "channels.defaults.heartbeat":
    "Default heartbeat configuration inherited by all channels. Controls periodic status checks, health indicators, and alert notifications across all messaging providers.",
  "channels.defaults.heartbeat.showOk":
    "Show a positive status indicator during heartbeat when all systems are healthy. Use to provide visible confirmation that the bot is operational. Default: true.",
  "channels.defaults.heartbeat.showAlerts":
    "Show alert notifications during heartbeat when issues are detected. Use to surface configuration problems, API errors, or connectivity issues proactively. Default: true.",
  "channels.defaults.heartbeat.useIndicator":
    "Use a visual indicator (emoji or icon) in heartbeat status messages. When enabled, heartbeat messages include a colored status dot or icon for quick visual scanning.",
  gateway:
    "Gateway server configuration controlling bind address, authentication, TLS, hot-reload, tool policy, and HTTP endpoints. Use gateway.mode to select local or remote operation.",
  "gateway.mode":
    'Selects the gateway operation mode: "local" runs the gateway on this machine accepting direct connections; "remote" connects to an external gateway instance as a client node.',
  "gateway.bind":
    'Network bind mode: "auto" picks the best interface, "lan" binds to all LAN interfaces, "loopback" binds to localhost only, "custom" uses a specified address, "tailnet" binds to the Tailscale interface.',
  "gateway.auth.mode":
    'Authentication mode for gateway access: "none" disables auth (loopback only), "token" requires a bearer token, "password" requires a password, "trusted-proxy" trusts a reverse proxy header.',
  "gateway.tailscale.mode":
    'Tailscale integration mode: "off" disables Tailscale, "serve" exposes the gateway on the tailnet via Tailscale Serve, "funnel" exposes publicly via Tailscale Funnel.',
  "gateway.tools.allow":
    "Tool allowlist for this gateway instance. When set, only the listed tools are available to agents. Use to restrict tool access in production or shared environments.",
  "gateway.tools.deny":
    "Tool denylist for this gateway instance. Use to block specific tools even if they appear in the agent tool catalog. Deny rules take precedence over allow rules.",
  "gateway.tls.enabled":
    "Enable TLS for the gateway HTTP/WebSocket server. When enabled, the gateway serves HTTPS and WSS connections. Use with gateway.tls.autoGenerate for self-signed certificates.",
  "gateway.tls.autoGenerate":
    "Automatically generate a self-signed TLS certificate on startup. Use for development or internal deployments where a CA-signed certificate is not available.",
  "gateway.http":
    "HTTP endpoint configuration for the gateway server. Controls which additional HTTP APIs are exposed alongside the core WebSocket endpoint.",
  "gateway.http.endpoints":
    "Named HTTP endpoint toggles. Use to enable or disable specific REST API endpoints on the gateway (e.g. OpenAI-compatible chat completions).",
  browser:
    "Browser automation settings for headless or headed Chromium control. Use browser.cdpUrl to connect to an existing browser instance or enable browser.headless for serverless operation.",
  "browser.enabled":
    "Enable the browser automation subsystem. When enabled, the gateway can launch or connect to a Chromium instance for web browsing, screenshots, and page interaction.",
  "browser.cdpUrl":
    "Chrome DevTools Protocol URL for connecting to an existing browser instance. Use to share a browser between multiple agents or connect to a remote browser service.",
  "browser.headless":
    "Run the browser in headless mode without a visible window. Use for server deployments where no display is available. Default: true when no display is detected.",
  "browser.noSandbox":
    "Disable the Chromium sandbox. Use only in containerized environments where the sandbox cannot function. Enabling this reduces browser isolation security.",
  "browser.profiles":
    "Named browser profile configurations. Each profile defines a separate browser context with its own cookies, storage, and extensions for multi-account browsing.",
  "browser.profiles.*.driver":
    'Browser automation driver for this profile: "clawd" uses the built-in CDP driver with full page control; "extension" uses a browser extension for lighter-weight interaction.',
  tools:
    "Tool availability, execution policy, and security settings. Use tools.allow and tools.deny to control which tools agents may invoke, and tools.exec for shell command execution policy.",
  "tools.allow":
    "Global tool allowlist. When set, only the listed tool names are available to agents. Use to restrict the tool surface in production or high-security environments.",
  "tools.deny":
    "Global tool denylist. Use to block specific tools even if they appear in tools.allow or the agent catalog. Deny rules always take precedence over allow rules.",
  "tools.exec":
    "Shell command execution settings controlling host access, security mode, and approval requirements for the exec tool. Use to define how agents run commands on the host.",
  "tools.exec.host":
    "Enable host shell command execution via the exec tool. When enabled, agents can run arbitrary shell commands on the gateway host within the configured security policy.",
  "tools.exec.security":
    "Security mode for exec tool commands. Controls the level of sandboxing, path restrictions, and approval requirements applied to shell command execution by agents.",
  "tools.exec.ask":
    "Enable interactive ask mode for exec commands. When enabled, the agent prompts the user for confirmation before executing shell commands that match the configured patterns.",
  "tools.exec.node":
    "Enable node-delegated exec execution. When enabled, exec commands are forwarded to a connected node for execution instead of running on the gateway host directly.",
  "tools.agentToAgent.enabled":
    "Enable agent-to-agent tool calls. When enabled, agents can invoke tools on other agents within the same gateway instance for cross-agent collaboration.",
  "tools.elevated.enabled":
    "Enable elevated tool access for privileged operations. When enabled, users in the tools.elevated.allowFrom list can invoke restricted tools like bash and config modification.",
  "tools.elevated.allowFrom":
    "Allowlist of user identifiers permitted to use elevated tools. Use channel-native IDs to define who can invoke privileged operations like direct shell access.",
  "tools.subagents.tools":
    "Tool catalog for spawned subagent sessions. Controls which tools are available to subagents independently of the parent agent tool policy.",
  "tools.sandbox.tools":
    "Tool catalog for sandboxed execution environments. Controls which tools are available inside sandbox containers independently of the host tool policy.",
  web: "Web UI provider settings that controls the embedded web server, heartbeat intervals, and WebSocket reconnect behavior. Use web.port and web.host to define the listener address.",
  "web.enabled":
    "Enable the web UI provider. When enabled, the gateway serves a browser-based chat interface for direct web access to agent conversations.",
  "web.heartbeatSeconds":
    "Interval in seconds between WebSocket heartbeat pings for the web UI connection. Use to detect stale connections and trigger reconnect. Default: 30.",
  "web.reconnect":
    "WebSocket reconnect settings for the web UI client. Controls how the browser reconnects after network interruptions using exponential backoff.",
  "web.reconnect.initialMs":
    "Initial reconnect delay in milliseconds after a WebSocket disconnect. Use to set the starting backoff duration before exponential increase. Default: 1000.",
  "web.reconnect.maxMs":
    "Maximum reconnect delay in milliseconds. Use to cap the exponential backoff so reconnect attempts do not wait too long between tries. Default: 30000.",
  "web.reconnect.factor":
    "Exponential backoff multiplier applied to the reconnect delay after each failed attempt. Use to control how quickly the delay grows. Default: 2.",
  "web.reconnect.jitter":
    "Jitter factor (0-1) applied to the reconnect delay to prevent thundering-herd reconnects. Use to randomize retry timing across multiple clients. Default: 0.5.",
  "web.reconnect.maxAttempts":
    "Maximum number of reconnect attempts before giving up. 0 means no retries and the client stops after the first failure sequence. Use to limit how long clients retry.",
  discovery:
    "Service discovery settings for mDNS and wide-area networking. Use discovery.mdns to control how the gateway advertises itself on the local network and discovery.wideArea for broader reach.",
  "discovery.wideArea.enabled":
    "Enable wide-area service discovery for cross-network gateway visibility. When enabled, the gateway registers with a discovery service for remote node connections.",
  "discovery.mdns":
    'mDNS discovery settings controlling local network advertisement. Use discovery.mdns.mode to choose between "off", "minimal" (default, name only), and "full" (includes cliPath/sshPort).',
  canvasHost:
    "Built-in canvas web server for hosting agent-generated HTML/JS artifacts. Use canvasHost.enabled to serve a local development server with optional live-reload support for rapid prototyping.",
  "canvasHost.enabled":
    "Enable the canvas host web server. When enabled, agent-generated HTML and JavaScript artifacts are served on a local port for browser preview and testing.",
  "canvasHost.root":
    "Filesystem root directory for canvas host assets. Controls where the web server looks for HTML/JS files to serve. Default uses the agent workspace canvas directory.",
  "canvasHost.port":
    "Port number for the canvas host web server. Use to set a specific port for browser access to canvas artifacts. Default: auto-assigned available port.",
  "canvasHost.liveReload":
    "Enable live-reload for the canvas host web server. When enabled, the browser automatically refreshes when canvas artifacts change on disk for faster development iteration.",
  talk: "Text-to-speech configuration for voice output. Use talk.voiceId to select the TTS voice, talk.modelId for the synthesis model, and talk.outputFormat for the audio codec.",
  "talk.voiceId":
    "Voice identifier for TTS synthesis. Use the provider's voice catalog to select a voice that matches your desired personality, accent, and language for agent voice output.",
  "talk.voiceAliases":
    "Named aliases for TTS voices. Use to define shorthand names for frequently used voice IDs so agents can reference voices by friendly names instead of opaque identifiers.",
  "talk.modelId":
    "TTS model identifier for voice synthesis. Use to select the specific model version and quality tier offered by the TTS provider for controlling output fidelity.",
  "talk.outputFormat":
    "Audio output format for TTS synthesis (e.g. mp3, wav, opus). Use to control the codec and quality of generated voice audio based on your channel's playback capabilities.",
  "talk.interruptOnSpeech":
    "Enable speech interruption detection. When enabled, incoming user speech automatically interrupts the current TTS playback and cancels the active voice output.",
  meta: "Internal metadata written by Bot when it touches the config file. Controls version tracking and last-write timestamps used for upgrade heuristics and migration detection.",
  env: "Environment variable injection and shell environment capture settings. Use env.vars to define static variables and env.shellEnv to capture the login shell environment at startup.",
  "env.shellEnv":
    "Shell environment capture settings. When enabled, the gateway captures environment variables from the user's login shell at startup for use in exec commands.",
  "env.shellEnv.enabled":
    "Enable shell environment capture at gateway startup. When enabled, the gateway runs the user's login shell to capture PATH and other environment variables. Default: true.",
  "env.shellEnv.timeoutMs":
    "Timeout in milliseconds for the shell environment capture subprocess. Use to prevent hung shells from blocking gateway startup. Default: 5000.",
  "env.vars":
    "Static environment variables injected into all exec command environments. Use to define persistent variables that should be available to every agent shell execution.",
  wizard:
    "Setup wizard metadata that tracks the last run state. Controls when and how the setup wizard re-runs to detect configuration changes and keep settings current.",
  "wizard.lastRunAt":
    "ISO timestamp of the last wizard run. Use to track when the setup wizard was last executed for determining whether re-running is needed after upgrades.",
  "wizard.lastRunVersion":
    "Bot version string from the last wizard run. Use to detect version upgrades that may require re-running the wizard to apply new configuration defaults.",
  "wizard.lastRunCommit":
    "Git commit hash from the last wizard run. Use to precisely track which codebase version was active when the wizard last configured the gateway.",
  "wizard.lastRunCommand":
    "CLI command used in the last wizard run. Use to record whether the wizard was invoked manually or automatically during startup for audit and troubleshooting.",
  "wizard.lastRunMode":
    'Defines the gateway mode during the last wizard run: "local" for a locally-bound gateway, "remote" for a remote-connected client node. Recorded for configuration context.',
  diagnostics:
    "Diagnostics and observability settings including OpenTelemetry, cache tracing, and debug flags. Enable diagnostics to export traces, metrics, and logs to an OTEL collector.",
  "diagnostics.otel":
    "OpenTelemetry configuration for exporting traces, metrics, and logs. Use diagnostics.otel.enabled to activate the OTEL exporter and configure the collector endpoint.",
  "diagnostics.cacheTrace":
    "Cache trace diagnostics for debugging embedded agent run caching behavior. Use diagnostics.cacheTrace.enabled to capture detailed cache hit/miss snapshots.",
  logging:
    "Logging configuration controlling console and file output levels, formatting style, and sensitive-data redaction. Use logging.level to set the global minimum severity for all outputs.",
  "logging.level":
    'Sets the global log level minimum: "silent" suppresses all output, "fatal" and "error" for critical issues, "warn" for warnings, "info" for standard operation, "debug" and "trace" for troubleshooting.',
  "logging.file":
    "Sets the file path for persistent log output. The gateway writes structured log entries to this file in addition to console output for offline analysis.",
  "logging.consoleLevel":
    'Sets the console-specific log level override: "silent", "fatal", "error", "warn", "info", "debug", or "trace". Use to override logging.level for console output only.',
  "logging.consoleStyle":
    'Selects the console output formatting style: "pretty" for colorized human-readable output, "compact" for minimal single-line entries, "json" for structured JSON output suitable for log aggregators.',
  "logging.redactSensitive":
    'Sensitive data redaction mode: "off" disables redaction (development only), "tools" redacts sensitive values in tool input/output logs. Use to prevent credential leakage in log files.',
  "logging.redactPatterns":
    "Custom regex patterns for redacting sensitive data in log output. Use to define additional redaction rules beyond the built-in patterns for project-specific secrets.",
  update:
    "Automatic update settings that control which release channel is tracked and whether the gateway checks for updates on startup. Use update.channel to select stable, beta, or dev releases.",
  ui: "User interface customization for the control panel and assistant identity. Use ui.assistant to set the display name and avatar, and ui.seamColor for the accent color theme.",
  "ui.assistant":
    "Assistant identity settings displayed in the web UI and control panel. Use ui.assistant.name and ui.assistant.avatar to customize how the bot presents itself.",
  plugins:
    "Plugin/extension loading configuration. Use plugins.enabled to toggle the plugin system, plugins.allow/deny for access control, and plugins.entries for per-plugin settings and credentials.",
  "plugins.entries.*.apiKey":
    "API key or secret credential for this plugin. Use an environment variable reference or secret manager URI to avoid storing credentials in plaintext configuration files.",
  "plugins.entries.*.env":
    "Environment variables scoped to this plugin only. Use to inject plugin-specific configuration values, API keys, or feature flags that should not leak to other plugins or the host environment.",
  auth: "Authentication profiles, provider ordering, and cooldown/backoff settings for API credential management. Use auth.profiles to define multiple auth identities with automatic failover.",
  "auth.cooldowns":
    "Cooldown and backoff settings for authentication failures. Use auth.cooldowns.billingBackoffHours to control how long a profile is sidelined after a billing or retry failure before trying again.",
  models:
    "Model provider registry, discovery, and merge configuration. Use models.providers to define API endpoints and credentials, and models.bedrockDiscovery for automatic AWS Bedrock model catalog refresh.",
  "models.providers":
    "Named provider endpoint definitions keyed by provider slug. Each entry defines the base URL, authentication, and model catalog for a specific API provider.",
  "models.providers.*.baseUrl":
    "Base URL for this provider's API endpoint. Use to point to custom proxy servers, regional endpoints, or self-hosted model serving infrastructure instead of the default upstream.",
  "models.providers.*.apiKey":
    "API key or secret credential for this provider. Use an environment variable reference or secret manager URI to avoid storing credentials in plaintext configuration files.",
  "models.providers.*.api":
    "API compatibility mode for this provider. Controls which API format is used for requests (e.g. openai, anthropic, bedrock) when the provider supports multiple protocols.",
  "models.providers.*.headers":
    "Extra HTTP headers merged into all requests to this provider. Use for custom authentication, routing, or tracing headers required by proxy servers or enterprise gateways.",
  "models.providers.*.models":
    "Model catalog entries for this provider. Each entry defines a model ID with capability metadata (context window, max tokens, input types, reasoning support).",
  "models.bedrockDiscovery":
    "AWS Bedrock model auto-discovery settings. When enabled, the gateway periodically queries the Bedrock API to refresh the available model catalog automatically.",
  "models.bedrockDiscovery.enabled":
    "Enable automatic Bedrock model catalog discovery. When enabled, the gateway queries AWS Bedrock to populate models.providers with available foundation models.",
  "models.bedrockDiscovery.region":
    "AWS region for Bedrock model discovery API calls. Use the region where your Bedrock models are provisioned (e.g. us-east-1, us-west-2).",
  "models.bedrockDiscovery.providerFilter":
    "Optional provider name filter for Bedrock discovery. Use to limit discovered models to specific foundation model providers (e.g. anthropic, meta, amazon).",
  "models.bedrockDiscovery.refreshInterval":
    "Refresh interval in seconds for Bedrock model catalog discovery. Lower values increase API cost and noise; higher values delay new model availability. Default: 3600.",
  "models.bedrockDiscovery.defaultContextWindow":
    "Default context window size for discovered Bedrock models when the API does not provide this metadata. Use to set a sensible fallback for models without explicit limits.",
  "models.bedrockDiscovery.defaultMaxTokens":
    "Default max output tokens for discovered Bedrock models when the API does not provide this metadata. Use to set a sensible fallback for models without explicit limits.",
  agents:
    "Agent definitions, default parameters, model selection, compaction behavior, and memory search settings. Use agents.defaults for shared configuration inherited by all agents.",
  "agents.defaults":
    "Default agent configuration inherited by all agents unless overridden in agents.list entries. Defines model selection, compaction, memory search, and other shared settings.",
  "agents.list":
    "Named agent definitions that override agents.defaults. Each entry defines a distinct agent personality with its own model, tools, skills, and behavior settings.",
  "agents.defaults.compaction":
    "Context compaction settings controlling how long conversation histories are summarized to stay within model context limits. Use to tune quality vs. token efficiency.",
  "agents.defaults.compaction.mode":
    'Compaction strategy: "default" uses standard summarization that aggressively reclaims tokens; "safeguard" uses a more conservative approach that preserves more context at the cost of fewer free tokens.',
  "agents.defaults.compaction.reserveTokens":
    "Number of tokens reserved for the next agent response after compaction. Use to ensure the model has enough room to generate a complete reply after context summarization.",
  "agents.defaults.compaction.keepRecentTokens":
    "Number of recent tokens to preserve verbatim during compaction. Use to keep the most recent conversation turns intact while summarizing older history.",
  "agents.defaults.compaction.reserveTokensFloor":
    "Minimum token reservation that overrides reserveTokens when the computed value falls below this floor. Use to guarantee a minimum response budget.",
  "agents.defaults.compaction.maxHistoryShare":
    "Maximum fraction (0.1-0.9) of the context window that conversation history may occupy before compaction triggers. Use to balance history depth against response quality.",
  "agents.defaults.compaction.memoryFlush":
    "Memory flush settings for pre-compaction memory extraction. When enabled, the agent extracts key facts into memory before compaction discards older context.",
  "agents.defaults.compaction.memoryFlush.enabled":
    "Enable pre-compaction memory flush. When enabled, the agent extracts important facts from context into persistent memory before the token budget triggers compaction.",
  "agents.defaults.compaction.memoryFlush.softThresholdTokens":
    "Token threshold that triggers a soft memory flush before hard compaction. Use to extract memories while context is still accessible, before aggressive summarization begins.",
  "agents.defaults.compaction.memoryFlush.prompt":
    "Custom prompt used to guide memory extraction during the flush phase. Use to control what facts, decisions, and context the agent preserves in long-term memory.",
  "agents.defaults.compaction.memoryFlush.systemPrompt":
    "System prompt override for the memory flush extraction step. Use to provide specialized instructions for the memory extraction model independent of the main agent system prompt.",

  // ── TOOLS_HOOKS_TARGET_KEYS ──────────────────────────────────────────────
  "hooks.gmail.account":
    "Gmail account email address for push notification subscriptions. Use the full email (user@gmail.com) of the account whose inbox the bot monitors for incoming messages.",
  "hooks.gmail.allowUnsafeExternalContent":
    "Allow processing of external content in Gmail messages without sanitization. When enabled, embedded images and links are passed through to the agent without URL safety checks.",
  "hooks.gmail.hookUrl":
    "Public URL endpoint for receiving Gmail push notifications. Use the fully qualified HTTPS URL where Google's Pub/Sub service delivers new-message notifications to the gateway.",
  "hooks.gmail.includeBody":
    "Include the full email body text when processing Gmail messages. When disabled, only headers and metadata are passed to the agent, reducing token consumption for high-volume inboxes.",
  "hooks.gmail.label":
    "Gmail label filter for push notification processing. When set, only messages with this label trigger agent sessions. Use to focus the bot on specific email categories or folders.",
  "hooks.gmail.model":
    "Model override for Gmail-triggered agent sessions. Use a specific model ID (provider/model) to control which model processes email content independently of the default agent model.",
  "hooks.gmail.serve":
    "Enable the Gmail webhook HTTP endpoint on the gateway. When enabled, the gateway accepts incoming Gmail push notification payloads at the configured hook URL for processing.",
  "hooks.gmail.subscription":
    "Google Cloud Pub/Sub subscription name for Gmail push notifications. Use the full subscription resource path that connects your Gmail watch to the gateway webhook endpoint.",
  "hooks.gmail.tailscale":
    "Tailscale exposure settings for the Gmail webhook endpoint. Controls whether the endpoint is accessible on the tailnet only or exposed publicly via Tailscale Funnel.",
  "hooks.gmail.topic":
    "Google Cloud Pub/Sub topic name for Gmail push notifications. Use the topic ARN where Gmail watch API publishes new-message events for your configured account.",
  "hooks.internal.entries":
    "Resolved internal event handler entries after module loading. Use hooks.internal.handlers to define handlers; this field reflects the loaded state after initialization.",
  "hooks.internal.installs":
    "Resolved internal handler install metadata after loading. Use to inspect which internal event handlers were successfully loaded and registered during gateway startup.",
  "hooks.internal.load":
    "Loading configuration for internal event handlers. Controls where the gateway looks for handler modules and how they are resolved during startup initialization.",
  "hooks.mappings[].allowUnsafeExternalContent":
    "Allow processing of external content in webhook payloads without sanitization. When enabled, untrusted URLs and embedded content are passed through to the agent without safety checks.",
  "hooks.mappings[].deliver":
    "Delivery configuration for this webhook mapping. Controls how the processed webhook payload is routed to the target agent session, including channel and thread targeting.",
  "hooks.mappings[].id":
    "Unique identifier for this webhook mapping. Use a descriptive slug to identify this route in logs and diagnostics. Auto-generated if not specified.",
  "hooks.mappings[].match":
    "Match criteria for incoming webhook requests. Use URL path patterns, headers, or body fields to controls which requests this mapping handles.",
  "hooks.mappings[].messageTemplate":
    "Template string for constructing the agent message from the webhook payload. Use Handlebars-style placeholders to extract fields from the request body into the message text.",
  "hooks.mappings[].model":
    "Model override for sessions created by this webhook mapping. Use to select a specific model for webhook-triggered processing independently of the default agent model.",
  "hooks.mappings[].name":
    "Human-readable name for this webhook mapping displayed in logs and the Control UI. Use a descriptive label to identify this webhook route at a glance.",
  "hooks.mappings[].textTemplate":
    "Template string for extracting plain text content from the webhook payload. Use when the webhook body contains structured data that needs to be converted to readable text.",
  "hooks.mappings[].thinking":
    "Thinking depth override for sessions created by this webhook mapping. Use to control how much reasoning the agent applies to webhook-triggered content processing.",
  "hooks.mappings[].transform":
    "Transform pipeline for preprocessing webhook payloads before dispatch. Use to normalize, filter, or enrich incoming data before it reaches the agent session.",
  "tools.alsoAllow":
    "Additional tools to allow on top of the base tool profile. Use to selectively enable extra tools without replacing the entire allowlist defined by tools.allow.",
  "tools.byProvider":
    "Per-channel-provider tool policy overrides. Use to enable or disable specific tools when the agent is responding via a particular messaging provider (e.g. discord, telegram).",
  "tools.exec.approvalRunningNoticeMs":
    "Delay in milliseconds before showing a 'waiting for approval' notice during exec approval. Use to avoid flashing the notice for quickly-approved commands. Default: 3000.",
  "tools.links.enabled":
    "Enable automatic link extraction and understanding from messages. When enabled, the bot fetches and summarizes linked content to provide context-aware responses.",
  "tools.links.maxLinks":
    "Maximum number of links to process per message. Use to limit the number of URLs fetched and summarized to control latency and API consumption. Default: 3.",
  "tools.links.models":
    "Model allowlist for link understanding. When set, only the listed models are used for summarizing fetched link content. Use to control cost and quality.",
  "tools.links.scope":
    "Scope filter for link understanding. Controls which conversation types (direct, group, thread) enable automatic link processing. Use to disable in noisy group contexts.",
  "tools.links.timeoutSeconds":
    "Timeout in seconds for fetching and processing linked content. Use to prevent slow external sites from blocking message processing. Default: 15.",
  "tools.media.audio.attachments":
    "Audio attachment processing policy. Controls whether audio files attached to messages are automatically transcribed and included in the agent conversation context.",
  "tools.media.audio.enabled":
    "Enable automatic audio understanding for voice messages and audio attachments. When enabled, audio content is transcribed and injected into the agent context.",
  "tools.media.audio.language":
    "Language hint for audio transcription. Use an ISO language code (e.g. en, ja, de) to improve transcription accuracy when the spoken language is known in advance.",
  "tools.media.audio.maxBytes":
    "Maximum audio file size in bytes before skipping transcription. Use to avoid processing very large audio files that would be slow or expensive to transcribe.",
  "tools.media.audio.maxChars":
    "Maximum characters of transcribed audio text to inject into the agent context. Use to limit how much transcript is included when audio messages are very long.",
  "tools.media.audio.models":
    "Model allowlist for audio transcription. When set, only the listed models are used for speech-to-text processing. Use to control cost and quality.",
  "tools.media.audio.prompt":
    "Custom prompt prepended to transcribed audio text before injection into the agent context. Use to add instructions for how the agent should interpret voice messages.",
  "tools.media.audio.scope":
    "Scope filter for audio understanding. Controls which conversation types enable automatic audio transcription. Use to disable in contexts where voice is not relevant.",
  "tools.media.audio.timeoutSeconds":
    "Timeout in seconds for audio transcription processing. Use to prevent slow transcription from blocking message handling. Default: 60.",
  "tools.media.concurrency":
    "Maximum concurrent media processing tasks across all media types (image, audio, video). Use to limit resource consumption when processing multiple attachments simultaneously.",
  "tools.media.image.attachments":
    "Image attachment processing policy. Controls whether images attached to messages are automatically analyzed and their descriptions included in the agent context.",
  "tools.media.image.enabled":
    "Enable automatic image understanding for photo and image attachments. When enabled, images are analyzed via vision models and descriptions injected into agent context.",
  "tools.media.image.maxBytes":
    "Maximum image file size in bytes before skipping analysis. Use to avoid processing very large images that would be slow or expensive to analyze via vision models.",
  "tools.media.image.maxChars":
    "Maximum characters of image description to inject into the agent context. Use to limit how much visual analysis text is included for each processed image.",
  "tools.media.image.models":
    "Model allowlist for image understanding. When set, only the listed models are used for vision analysis. Use to control cost and quality of image descriptions.",
  "tools.media.image.prompt":
    "Custom prompt used when analyzing images via vision models. Use to guide what aspects of the image the model should focus on (e.g. text extraction, scene description).",
  "tools.media.image.scope":
    "Scope filter for image understanding. Controls which conversation types enable automatic image analysis. Use to disable in contexts where visual content is not relevant.",
  "tools.media.image.timeoutSeconds":
    "Timeout in seconds for image analysis processing. Use to prevent slow vision model calls from blocking message handling. Default: 30.",
  "tools.media.models":
    "Shared model allowlist for all media understanding types (image, audio, video). Use as a default when per-type model lists are not configured.",
  "tools.media.video.attachments":
    "Video attachment processing policy. Controls whether video files attached to messages are automatically analyzed and their descriptions included in the agent context.",
  "tools.media.video.enabled":
    "Enable automatic video understanding for video attachments. When enabled, video content is analyzed (frame extraction + audio transcription) and injected into agent context.",
  "tools.media.video.maxBytes":
    "Maximum video file size in bytes before skipping analysis. Use to avoid processing very large videos that would be slow or expensive to analyze.",
  "tools.media.video.maxChars":
    "Maximum characters of video description to inject into the agent context. Use to limit how much analysis text is included for each processed video.",
  "tools.media.video.models":
    "Model allowlist for video understanding. When set, only the listed models are used for video analysis. Use to control cost and quality.",
  "tools.media.video.prompt":
    "Custom prompt used when analyzing video content. Use to guide what aspects of the video the model should focus on (e.g. action description, text overlay extraction).",
  "tools.media.video.scope":
    "Scope filter for video understanding. Controls which conversation types enable automatic video analysis. Use to disable in contexts where video is not relevant.",
  "tools.media.video.timeoutSeconds":
    "Timeout in seconds for video analysis processing. Use to prevent slow analysis from blocking message handling. Default: 120.",
  "tools.profile":
    "Named tool profile that selects a predefined set of enabled tools. Use to quickly switch between tool configurations (e.g. minimal, standard, full) without editing individual allow/deny lists.",

  // ── CHANNELS_AGENTS_TARGET_KEYS ──────────────────────────────────────────
  "agents.defaults.memorySearch.chunking.overlap":
    "Overlap tokens between adjacent memory chunks during indexing. Use to ensure context continuity at chunk boundaries. Higher values improve recall at the cost of index size.",
  "agents.defaults.memorySearch.chunking.tokens":
    "Target token count per memory chunk during indexing. Use to control the granularity of memory search results. Smaller chunks give more precise matches but increase index size.",
  "agents.defaults.memorySearch.enabled":
    "Enable the memory search subsystem for this agent. When enabled, the agent can search over MEMORY.md, memory/*.md, and configured extra paths using vector similarity.",
  "agents.defaults.memorySearch.model":
    "Embedding model identifier for memory search indexing and queries. Use a provider/model ID to select which model generates the vector representations for search.",
  "agents.defaults.memorySearch.query.maxResults":
    "Maximum number of memory search results returned per query. Use to control how many relevant memory snippets the agent receives. Default: 5.",
  "agents.defaults.memorySearch.query.minScore":
    "Minimum similarity score threshold for memory search results. Use to filter out low-relevance matches. Set lower for broader recall or higher for precision. Default: 0.3.",
  "agents.defaults.memorySearch.query.hybrid.mmr.enabled":
    "Enable Maximal Marginal Relevance re-ranking for memory search results. Use to reduce redundancy by diversifying returned snippets beyond pure similarity ordering.",
  "agents.defaults.memorySearch.query.hybrid.mmr.lambda":
    "MMR lambda parameter controlling the diversity-relevance tradeoff (0-1). Lower values prefer diversity; higher values prefer relevance. Default: 0.5.",
  "agents.defaults.memorySearch.query.hybrid.temporalDecay.enabled":
    "Enable temporal decay weighting for memory search results. When enabled, more recent memories are boosted in relevance ranking over older entries.",
  "agents.defaults.memorySearch.query.hybrid.temporalDecay.halfLifeDays":
    "Half-life in days for temporal decay weighting. Controls how quickly older memories lose relevance. Lower values strongly prefer recent content; higher values treat all ages similarly.",
  "agents.defaults.memorySearch.sync.onSessionStart":
    "Trigger a memory reindex when a new session starts. Use to ensure memory search reflects the latest content at the beginning of each conversation.",
  "agents.defaults.memorySearch.sync.watchDebounceMs":
    "Debounce delay in milliseconds after a watched memory file changes before triggering reindex. Use to avoid excessive indexing during rapid file edits. Default: 5000.",
  "agents.defaults.workspace":
    "Workspace root directory for this agent. Controls the base directory used for file resolution, canvas hosting, and workspace-relative path operations.",
  "agents.list[].tools.alsoAllow":
    "Additional tools to allow for this specific agent on top of the base tool profile. Use to selectively enable extra tools for a single agent without modifying global policy.",
  "agents.list[].tools.byProvider":
    "Per-channel-provider tool policy overrides for this agent. Use to enable or disable specific tools when this agent responds via a particular messaging channel.",
  "agents.list[].tools.profile":
    "Named tool profile override for this agent. Use to select a different predefined tool configuration for this agent than the global tools.profile default.",
  "channels.bluebubbles":
    "BlueBubbles channel configuration for iMessage bridging via the BlueBubbles server. Use to set connection details, DM policies, and access control for the BlueBubbles integration.",
  "channels.discord":
    "Discord channel configuration. Use channels.discord.token to set the bot token, and per-account settings for multi-bot deployments. Controls DM policy, intents, and presence.",
  "channels.discord.token":
    "Discord bot token from the Discord Developer Portal. Use the full token string (not prefixed). Required for the bot to authenticate with the Discord gateway.",
  "channels.imessage":
    "iMessage channel configuration for macOS-based iMessage integration. Use channels.imessage.cliPath to set the path to the iMessage CLI bridge binary.",
  "channels.imessage.cliPath":
    "Path to the iMessage CLI bridge binary. Use an absolute path to the imessage-cli executable that provides the iMessage send/receive interface on macOS.",
  "channels.irc":
    "IRC channel configuration for connecting to IRC networks. Use to set server details, NickServ authentication, and DM access policies for IRC-based conversations.",
  "channels.mattermost":
    "Mattermost channel configuration. Use channels.mattermost.botToken and channels.mattermost.baseUrl to connect to your Mattermost server instance.",
  "channels.msteams":
    "Microsoft Teams channel configuration. Use to set up the Bot Framework connection, including app credentials and tenant-specific settings for Teams integration.",
  "channels.signal":
    "Signal channel configuration. Use channels.signal.account to set the Signal phone number or UUID used by the bot for sending and receiving encrypted messages.",
  "channels.signal.account":
    "Signal account phone number or UUID. Use the full international phone number (e.g. +15551234567) or account UUID for the bot's Signal identity.",
  "channels.slack":
    "Slack channel configuration. Use channels.slack.botToken and channels.slack.appToken for Socket Mode, or just botToken for Events API integration.",
  "channels.slack.appToken":
    "Slack app-level token (xapp-...) for Socket Mode connections. Required when using Socket Mode instead of the Events API for receiving Slack events.",
  "channels.slack.botToken":
    "Slack bot token (xoxb-...) from the Slack App configuration page. Use this token to authenticate with the Slack API for sending and receiving messages.",
  "channels.slack.userToken":
    "Slack user token (xoxp-...) for user-level API access. Use when the bot needs to perform actions that require user-scope permissions beyond bot token capabilities.",
  "channels.slack.userTokenReadOnly":
    "When set, the user token is used only for read operations (e.g. fetching channel history). Write operations use the bot token. Use to limit user token scope.",
  "channels.telegram":
    "Telegram channel configuration. Use channels.telegram.botToken to set the bot API token from @BotFather for authenticating with the Telegram Bot API.",
  "channels.telegram.botToken":
    "Telegram bot API token from @BotFather. Use the full token string (e.g. 123456:ABC-DEF...). Required for the bot to authenticate with the Telegram API.",
  "channels.telegram.capabilities.inlineButtons":
    "Enable inline keyboard button support for Telegram. When enabled, the bot can send messages with interactive inline buttons for user actions and selections.",
  "channels.whatsapp":
    "WhatsApp channel configuration for WhatsApp Web or WhatsApp Business API integration. Use to set connection details, DM policies, and debounce settings.",

  // ── FINAL_BACKLOG_TARGET_KEYS ────────────────────────────────────────────
  "browser.evaluateEnabled":
    "Enable JavaScript evaluation in the browser automation tool. When enabled, agents can execute arbitrary JavaScript in the browser context. Disable for security-sensitive environments.",
  "browser.remoteCdpHandshakeTimeoutMs":
    "Timeout in milliseconds for the initial CDP WebSocket handshake when connecting to a remote browser. Increase if connections to remote browsers are slow. Default: 10000.",
  "browser.remoteCdpTimeoutMs":
    "Timeout in milliseconds for CDP commands sent to a remote browser. Use to prevent hung browser sessions from blocking agent execution. Default: 30000.",
  "browser.snapshotDefaults":
    "Default settings for browser page snapshots. Controls how the browser captures page state for agent context when no per-request overrides are provided.",
  "browser.snapshotDefaults.mode":
    "Default snapshot capture mode for browser automation. Controls whether snapshots use accessibility tree, full HTML, or screenshot-based page representations.",
  "browser.ssrfPolicy":
    "Server-side request forgery protection settings for browser navigation. Controls whether the browser can access private network addresses and which hostnames are allowed.",
  "browser.ssrfPolicy.allowPrivateNetwork":
    "Allow the browser to navigate to private network addresses (10.x, 172.16.x, 192.168.x, localhost). Use with caution as this enables access to internal services.",
  "browser.ssrfPolicy.dangerouslyAllowPrivateNetwork":
    "Dangerously allow all private network access without hostname checks. Use only when you fully trust the agent and need unrestricted internal network browsing.",
  "browser.ssrfPolicy.allowedHostnames":
    "Hostname allowlist for browser SSRF protection. When set, only the listed hostnames can be navigated to when private network access is restricted.",
  "browser.ssrfPolicy.hostnameAllowlist":
    "Legacy alias for browser.ssrfPolicy.allowedHostnames. Use allowedHostnames instead. Controls which hostnames the browser is permitted to navigate to.",
  "diagnostics.enabled":
    "Enable the diagnostics subsystem. When enabled, the gateway collects and exports diagnostic data including traces, metrics, and structured log events.",
  "diagnostics.otel.enabled":
    "Enable OpenTelemetry data export. When enabled, traces, metrics, and logs are exported to the configured OTEL collector endpoint for observability.",
  "diagnostics.otel.endpoint":
    "OpenTelemetry collector endpoint URL for exporting traces, metrics, and logs. Use the full URL including protocol (e.g. https://otel-collector.example.com:4318).",
  "diagnostics.otel.flushIntervalMs":
    "Interval in milliseconds between OTEL data flush operations. Use to control how frequently accumulated telemetry data is sent to the collector. Default: 5000.",
  "diagnostics.otel.headers":
    "Extra HTTP headers for OTEL collector requests. Use for authentication tokens, API keys, or custom routing headers required by your OTEL backend.",
  "diagnostics.otel.logs":
    "Enable OpenTelemetry log export. When enabled, structured log events are exported to the OTEL collector alongside traces and metrics.",
  "diagnostics.otel.metrics":
    "Enable OpenTelemetry metrics export. When enabled, runtime metrics (request counts, latencies, resource usage) are exported to the OTEL collector.",
  "diagnostics.otel.sampleRate":
    "Trace sampling rate (0-1) for OpenTelemetry. Use 1.0 to trace all requests or lower values (e.g. 0.1 = 10%) to reduce collector load in production.",
  "diagnostics.otel.serviceName":
    "Service name reported in OpenTelemetry telemetry data. Use to identify this gateway instance in your observability dashboard. Default: bot-gateway.",
  "diagnostics.otel.traces":
    "Enable OpenTelemetry trace export. When enabled, distributed traces for request processing are exported to the OTEL collector for performance analysis.",
  "diagnostics.otel.protocol":
    'OTEL exporter wire protocol: "http/protobuf" (default, HTTP + protobuf encoding) or "grpc" (gRPC transport). Choose based on your collector endpoint capabilities.',
  "gateway.remote.password":
    "Password for authenticating with a remote gateway. Use when the remote gateway is configured with gateway.auth.mode=password. Store securely in environment variables.",
  "gateway.remote.token":
    "Bearer token for authenticating with a remote gateway. Use when the remote gateway is configured with gateway.auth.mode=token. Store securely in environment variables.",
  "skills.load.watch":
    "Enable filesystem watching for skill files. When enabled, skills are automatically reloaded when their source files change on disk for hot-reload during development.",
  "skills.load.watchDebounceMs":
    "Debounce delay in milliseconds after a watched skill file changes before triggering reload. Use to avoid excessive reloads during rapid file edits. Default: 1000.",
  "talk.apiKey":
    "API key for the text-to-speech provider. Use the credential from your TTS provider (e.g. ElevenLabs, OpenAI) to authenticate voice synthesis requests.",
  "ui.assistant.avatar":
    "Avatar image for the assistant displayed in the web UI and control panel. Use a URL, data URI, or workspace-relative path to a profile image.",
  "ui.assistant.name":
    "Display name for the assistant shown in chat interfaces and the control panel. Use to customize the bot's visible identity across all UI surfaces.",
  "ui.seamColor":
    "Accent color for the UI theme. Use a hex color code (e.g. #4A90D9) to customize the primary color used in the control panel and web chat interface.",

  ...IRC_FIELD_HELP,
  "channels.discord.commands.native": 'Override native commands for Discord (bool or "auto").',
  "channels.discord.commands.nativeSkills":
    'Override native skill commands for Discord (bool or "auto").',
  "channels.telegram.commands.native": 'Override native commands for Telegram (bool or "auto").',
  "channels.telegram.commands.nativeSkills":
    'Override native skill commands for Telegram (bool or "auto").',
  "channels.slack.commands.native": 'Override native commands for Slack (bool or "auto").',
  "channels.slack.commands.nativeSkills":
    'Override native skill commands for Slack (bool or "auto").',
  "channels.slack.streamMode":
    "Live stream preview mode for Slack replies (replace | status_final | append).",
  "session.agentToAgent.maxPingPongTurns":
    "Max reply-back turns between requester and target (0-5). Controls the depth of recursive agent-to-agent conversations to prevent infinite loops.",
  "channels.telegram.customCommands":
    "Additional Telegram bot menu commands (merged with native; conflicts ignored).",
  "messages.suppressToolErrors":
    "When true, suppress ⚠️ tool-error warnings from being shown to the user. The agent already sees errors in context and can retry. Default: false.",
  "messages.ackReaction": "Emoji reaction used to acknowledge inbound messages (empty disables).",
  "messages.ackReactionScope":
    'When to send ack reactions ("group-mentions", "group-all", "direct", "all").',
  "messages.inbound.debounceMs":
    "Debounce window (ms) for batching rapid inbound messages from the same sender (0 to disable).",
  "channels.telegram.dmPolicy":
    'Direct message access control ("pairing" recommended). "open" requires channels.telegram.allowFrom=["*"].',
  "channels.telegram.streamMode":
    "Live stream preview mode for Telegram replies (off | partial | block). Separate from block streaming; uses sendMessage + editMessageText.",
  "channels.telegram.draftChunk.minChars":
    'Minimum chars before emitting a Telegram stream preview update when channels.telegram.streamMode="block" (default: 200).',
  "channels.telegram.draftChunk.maxChars":
    'Target max size for a Telegram stream preview chunk when channels.telegram.streamMode="block" (default: 800; clamped to channels.telegram.textChunkLimit).',
  "channels.telegram.draftChunk.breakPreference":
    "Preferred breakpoints for Telegram draft chunks (paragraph | newline | sentence). Default: paragraph.",
  "channels.telegram.retry.attempts":
    "Max retry attempts for outbound Telegram API calls (default: 3).",
  "channels.telegram.retry.minDelayMs": "Minimum retry delay in ms for Telegram outbound calls.",
  "channels.telegram.retry.maxDelayMs":
    "Maximum retry delay cap in ms for Telegram outbound calls.",
  "channels.telegram.retry.jitter": "Jitter factor (0-1) applied to Telegram retry delays.",
  "channels.telegram.network.autoSelectFamily":
    "Override Node autoSelectFamily for Telegram (true=enable, false=disable).",
  "channels.telegram.timeoutSeconds":
    "Max seconds before Telegram API requests are aborted (default: 500 per grammY).",
  "channels.whatsapp.dmPolicy":
    'Direct message access control ("pairing" recommended). "open" requires channels.whatsapp.allowFrom=["*"].',
  "channels.whatsapp.selfChatMode": "Same-phone setup (bot uses your personal WhatsApp number).",
  "channels.whatsapp.debounceMs":
    "Debounce window (ms) for batching rapid consecutive messages from the same sender (0 to disable).",
  "channels.signal.dmPolicy":
    'Direct message access control ("pairing" recommended). "open" requires channels.signal.allowFrom=["*"].',
  "channels.imessage.dmPolicy":
    'Direct message access control ("pairing" recommended). "open" requires channels.imessage.allowFrom=["*"].',
  "channels.bluebubbles.dmPolicy":
    'Direct message access control ("pairing" recommended). "open" requires channels.bluebubbles.allowFrom=["*"].',
  "channels.discord.dmPolicy":
    'Direct message access control ("pairing" recommended). "open" requires channels.discord.allowFrom=["*"].',
  "channels.discord.dm.policy":
    'Direct message access control ("pairing" recommended). "open" requires channels.discord.allowFrom=["*"] (legacy: channels.discord.dm.allowFrom).',
  "channels.discord.retry.attempts":
    "Max retry attempts for outbound Discord API calls (default: 3).",
  "channels.discord.retry.minDelayMs": "Minimum retry delay in ms for Discord outbound calls.",
  "channels.discord.retry.maxDelayMs": "Maximum retry delay cap in ms for Discord outbound calls.",
  "channels.discord.retry.jitter": "Jitter factor (0-1) applied to Discord retry delays.",
  "channels.discord.maxLinesPerMessage": "Soft max line count per Discord message (default: 17).",
  "channels.discord.ui.components.accentColor":
    "Accent color for Discord component containers (hex). Set per account via channels.discord.accounts.<id>.ui.components.accentColor.",
  "channels.discord.intents.presence":
    "Enable the Guild Presences privileged intent. Must also be enabled in the Discord Developer Portal. Allows tracking user activities (e.g. Spotify). Default: false.",
  "channels.discord.intents.guildMembers":
    "Enable the Guild Members privileged intent. Must also be enabled in the Discord Developer Portal. Default: false.",
  "channels.discord.pluralkit.enabled":
    "Resolve PluralKit proxied messages and treat system members as distinct senders.",
  "channels.discord.pluralkit.token":
    "Optional PluralKit token for resolving private systems or members.",
  "channels.discord.activity": "Discord presence activity text (defaults to custom status).",
  "channels.discord.status": "Discord presence status (online, dnd, idle, invisible).",
  "channels.discord.activityType":
    "Discord presence activity type (0=Playing,1=Streaming,2=Listening,3=Watching,4=Custom,5=Competing).",
  "channels.discord.activityUrl": "Discord presence streaming URL (required for activityType=1).",
  "channels.slack.dm.policy":
    'Direct message access control ("pairing" recommended). "open" requires channels.slack.allowFrom=["*"] (legacy: channels.slack.dm.allowFrom).',
  "channels.slack.dmPolicy":
    'Direct message access control ("pairing" recommended). "open" requires channels.slack.allowFrom=["*"].',

  // --- messages fields ---
  "messages.greeting":
    "Sets the greeting message sent when a new conversation starts. Use to welcome users with a custom introduction or instructions before their first interaction with the agent.",
  "messages.systemPrompt":
    "Sets the system prompt prepended to every agent conversation. Use to define the agent's persona, capabilities, constraints, and behavioral guidelines for all sessions.",
  "messages.ignorePattern":
    "Defines a regex pattern for messages that the bot should silently ignore. Use to filter out automated notifications, status updates, or other noise that should not trigger agent responses.",
  "messages.queue.maxWait":
    "Sets the maximum time in milliseconds to wait for additional messages before processing the queue. Use to balance responsiveness against batching efficiency for rapid-fire inputs.",
  "messages.queue.debounce":
    "Sets the debounce window in milliseconds for batching rapid inbound messages into a single turn. Use to combine fast sequential messages before the agent processes them.",
  "messages.queue.collapsePeriod":
    "Sets the time window in milliseconds during which consecutive messages are collapsed into a single queued entry. Use to merge rapid edits or corrections into one agent input.",

  // --- channels.defaults fields ---
  "channels.defaults.dmPolicy":
    'Default direct message access policy for all channels: "pairing" requires explicit pairing before DMs, "open" allows all DMs. Use to set a baseline DM security posture.',
  "channels.defaults.allowFrom":
    "Default allowlist of user identifiers that may interact with the bot across all channels. Use to restrict access to specific users when the channel does not define its own allowFrom.",
  "channels.defaults.groupAllowlist":
    "Default allowlist of group identifiers where the bot may participate. Use to restrict group chat access to specific rooms or conversations across all channels by default.",
  "channels.defaults.groupAllowlistPatterns":
    "Default regex patterns for matching allowed group names or identifiers. Use to define flexible group access rules that apply across all channels without listing every group ID.",
  "channels.defaults.groupAllowFrom":
    "Default allowlist of user identifiers allowed to interact with the bot in group chats. Use to restrict which users can trigger the bot in group conversations across all channels.",
  "channels.defaults.presence":
    "Default presence and status configuration applied to all channels. Use to set a consistent online status, activity text, and AFK behavior across all messaging providers.",
  "channels.defaults.presence.statusLine":
    "Default status line text displayed in the bot's presence across all channels. Use to show a consistent status message like availability or current task to all connected users.",
  "channels.defaults.presence.afkText":
    "Default away-from-keyboard text shown when the bot is idle across all channels. Use to indicate the bot is available but not actively processing, displayed during idle periods.",

  // --- gateway fields ---
  "gateway.port":
    "Sets the TCP port number the gateway listens on. Default: 18789. Use to change the listening port when the default conflicts with other services on the host.",
  "gateway.host":
    "Sets the hostname or IP address the gateway binds to. Use to override the bind address when gateway.bind is set to custom, or to specify a particular network interface.",
  "gateway.url":
    "Sets the external URL where the gateway is reachable by clients. Use when the gateway is behind a reverse proxy or tunnel and the public URL differs from the local bind address.",
  "gateway.auth":
    "Gateway authentication settings controlling how clients authenticate to the gateway. Use gateway.auth.mode to select the authentication strategy and set credentials accordingly.",
  "gateway.tailscale":
    "Tailscale integration settings for the gateway. Use to expose the gateway via Tailscale Serve or Funnel for secure remote access without port forwarding or public DNS.",
  "gateway.tailscale.hostname":
    "Sets the Tailscale hostname used when exposing the gateway via Serve or Funnel. Use a descriptive name that identifies this gateway instance on your tailnet.",
  "gateway.tailscale.timeout":
    "Sets the timeout in seconds for Tailscale connection establishment. Use to increase the timeout on slow networks or when the tailnet takes longer to converge after startup.",
  "gateway.tailscale.stateDir":
    "Sets the directory path for Tailscale state storage. Use to persist Tailscale identity and connection state across gateway restarts for consistent tailnet membership.",
  "gateway.reload":
    "Gateway hot-reload settings controlling how configuration changes are detected and applied at runtime. Use gateway.reload.mode to select the reload strategy.",
  "gateway.controlUi":
    "Control UI settings for the gateway's built-in web administration panel. Use to enable, configure authentication, and set allowed origins for the browser-based management interface.",
  "gateway.controlUi.enabled":
    "Enable the gateway's built-in Control UI web panel for browser-based administration. Use to activate the management interface served at the gateway.controlUi.basePath URL.",

  // --- browser fields ---
  "browser.profiles.*.binaryPath":
    "Sets the filesystem path to the browser binary for this profile. Use to point to a specific Chrome, Chromium, or Firefox installation when the default auto-detection does not find it.",
  "browser.profiles.*.dataDir":
    "Sets the browser user data directory for this profile. Use to isolate browser sessions with separate cookies, cache, and extensions per automation profile.",
  "browser.profiles.*.contextMode":
    "Controls whether this browser profile uses a persistent or incognito browsing context. Use incognito mode for ephemeral sessions that do not retain cookies or history between runs.",
  "browser.profiles.*.viewport":
    "Sets the browser viewport dimensions for this profile as a width x height string. Use to control the visible page area for consistent screenshots and responsive layout testing.",

  // --- tools.web fields ---
  "tools.web.search.command":
    "Sets the shell command used as the web search backend when the built-in providers are not available. Use to integrate a custom search CLI or local search index.",
  "tools.web.search.backend":
    'Selects the web search backend provider: built-in options include "brave" and "perplexity". Use to choose which search API powers the agent web_search tool.',
  "tools.web.fetch.driver":
    'Selects the HTTP fetch driver for the web_fetch tool: "node" uses built-in HTTP, "browser" uses a headless browser. Use browser mode for JavaScript-rendered pages.',
  "tools.web.fetch.maxPages":
    "Sets the maximum number of pages the web_fetch tool may follow when paginated content is detected. Use to limit how many pages are fetched and concatenated for a single request.",

  // --- web provider fields ---
  "web.port":
    "Sets the TCP port the web UI server listens on. Default: 3000. Use to change the web interface port when the default conflicts with other services on the host.",
  "web.host":
    "Sets the hostname or IP address the web UI server binds to. Use to restrict the web interface to a specific network interface or allow access from all interfaces with 0.0.0.0.",
  "web.auth":
    "Web UI authentication settings controlling how browser clients authenticate to the embedded web server. Use web.auth.token or web.auth.password to secure the interface.",
  "web.auth.token":
    "Sets the bearer token required for web UI authentication. Use to secure the embedded web interface with token-based access control for API and WebSocket connections.",
  "web.auth.password":
    "Sets the password for HTTP Basic authentication to the web UI. Use to secure the embedded web interface with simple password-based access control for browser sessions.",

  // --- discovery fields ---
  "discovery.enabled":
    "Enable local network discovery so other bot instances and clients can find this gateway. Use to allow automatic peer detection via mDNS on trusted local networks.",
  "discovery.mdns.instanceName":
    "Sets a custom mDNS instance name for this gateway on the local network. Use to distinguish this bot from others when multiple instances are discovered on the same subnet.",

  // --- canvasHost fields ---
  "canvasHost.auth":
    "Canvas host authentication settings controlling how clients authenticate to the canvas server. Use canvasHost.auth.token to set the required bearer token for access.",
  "canvasHost.auth.token":
    "Sets the bearer token required for canvas host authentication. Use to secure the canvas server endpoint with token-based access control for connected clients.",

  // --- talk fields ---
  "talk.enabled":
    "Enable the real-time voice conversation feature for interactive spoken dialogue with the agent. Use to activate the speech-to-text and text-to-speech pipeline.",
  "talk.model":
    "Sets the model used for real-time voice conversation processing. Use to select a specific speech or language model that handles the voice interaction pipeline.",
};
