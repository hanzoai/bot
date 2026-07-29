---
summary: "Generated inventory of Bot plugins shipped in core, published externally, or kept source-only"
read_when:
  - You are deciding whether a plugin ships in the core npm package or installs separately
  - You are updating bundled plugin package metadata or release automation
  - You need the canonical internal vs external plugin list
title: "Plugin inventory"
---

# Plugin inventory

This page is generated from `extensions/*/package.json`, `bot.plugin.json`,
and the root npm package `files` exclusions. Regenerate it with:

```bash
pnpm plugins:inventory:gen
```

## Definitions

- **Core npm package:** built into the `bot` npm package and available without a separate plugin install.
- **Official external package:** Bot-maintained plugin omitted from the core npm package, kept in this official inventory, and installed on demand through ClawHub and/or npm.
- **Source checkout only:** repo-local plugin omitted from published npm artifacts and not advertised as an installable package.

Source checkouts are different from npm installs: after `pnpm install`, bundled
plugins load from `extensions/<id>` so local edits and package-local workspace
dependencies are available.

## Install a plugin

Use the install route in each entry to decide whether install is needed. Plugins
that say `included in Bot` are already present in the core package.
Official external packages need one install, then a Gateway restart.

For example, Discord is an official external package:

```bash
bot plugins install @hanzo/bot-discord
bot gateway restart
bot plugins inspect discord --runtime --json
```

During the launch cutover, ordinary bare package specs still install from npm.
Use `clawhub:@hanzo/bot-discord` or `npm:@hanzo/bot-discord` when you need an
explicit source. After install, follow the plugin's setup doc, such as
[Discord](/channels/discord), to add credentials and channel config. See
[Manage plugins](/plugins/manage-plugins) for update, uninstall, and publishing
commands.

Each entry lists the package, distribution route, and description.

## Core npm package

71 plugins

- **[admin-http-rpc](/plugins/reference/admin-http-rpc)** (`@hanzo/bot-admin-http-rpc`) - included in Bot. Bot admin HTTP RPC endpoint.

- **[alibaba](/plugins/reference/alibaba)** (`@hanzo/bot-alibaba-provider`) - included in Bot. Adds video generation provider support.

- **[anthropic](/plugins/reference/anthropic)** (`@hanzo/bot-anthropic-provider`) - included in Bot. Anthropic models, Claude CLI, and native Claude session catalog.

- **[azure-speech](/plugins/reference/azure-speech)** (`@hanzo/bot-azure-speech`) - included in Bot. Azure AI Speech text-to-speech (MP3, native Ogg/Opus voice notes, PCM telephony).

- **[beam](/plugins/reference/beam)** (`@hanzo/bot-beam`) - included in Bot. Read-only coding-session Beam receiver.

- **[bonjour](/plugins/reference/bonjour)** (`@hanzo/bot-bonjour`) - included in Bot. Advertise the local Bot gateway over Bonjour/mDNS.

- **[browser](/plugins/reference/browser)** (`@hanzo/bot-browser-plugin`) - included in Bot. Adds agent-callable tools.

- **[byteplus](/plugins/reference/byteplus)** (`@hanzo/bot-byteplus-provider`) - included in Bot. Adds BytePlus, BytePlus Plan model provider support to Bot.

- **[canvas](/plugins/reference/canvas)** (`@hanzo/bot-canvas-plugin`) - included in Bot. Experimental Canvas control and A2UI rendering surfaces for paired nodes.

- **[clawrouter](/plugins/reference/clawrouter)** (`@hanzo/bot-clawrouter`) - included in Bot. Adds ClawRouter model provider support to Bot.

- **[cohere](/plugins/reference/cohere)** (`@hanzo/bot-cohere-provider`) - included in Bot; npm; ClawHub: `clawhub:@hanzo/bot-cohere-provider`. Bot Cohere provider plugin.

- **[comfy](/plugins/reference/comfy)** (`@hanzo/bot-comfy-provider`) - included in Bot. Adds ComfyUI model provider support to Bot.

- **[copilot-proxy](/plugins/reference/copilot-proxy)** (`@hanzo/bot-copilot-proxy`) - included in Bot. Adds Copilot Proxy model provider support to Bot.

- **[crabbox](/plugins/reference/crabbox)** (`@hanzo/bot-crabbox-provider`) - included in Bot. Cloud worker provider backed by the Crabbox CLI.

- **[cua-computer](/plugins/reference/cua-computer)** (`@hanzo/bot-cua-computer`) - included in Bot. Experimental cua-driver computer control for Windows and Linux node hosts.

- **[deepgram](/plugins/reference/deepgram)** (`@hanzo/bot-deepgram-provider`) - included in Bot. Adds media understanding provider support. Adds realtime transcription provider support.

- **[document-extract](/plugins/reference/document-extract)** (`@hanzo/bot-document-extract-plugin`) - included in Bot. Extract text and fallback page images from local document attachments.

- **[duckduckgo](/plugins/reference/duckduckgo)** (`@hanzo/bot-duckduckgo-plugin`) - included in Bot. Adds web search provider support.

- **[elevenlabs](/plugins/reference/elevenlabs)** (`@hanzo/bot-elevenlabs-speech`) - included in Bot. Adds media understanding provider support. Adds realtime transcription provider support. Adds text-to-speech provider support.

- **[fal](/plugins/reference/fal)** (`@hanzo/bot-fal-provider`) - included in Bot. Adds fal model provider support to Bot.

- **[file-transfer](/plugins/reference/file-transfer)** (`@hanzo/bot-file-transfer`) - included in Bot. Fetch, list, and write files on paired nodes via dedicated node commands. Bypasses bash stdout truncation by using base64 over node.invoke for binaries up to 16 MB.

- **[github-copilot](/plugins/reference/github-copilot)** (`@hanzo/bot-github-copilot-provider`) - included in Bot. Adds GitHub Copilot model provider support to Bot.

- **[google](/plugins/reference/google)** (`@hanzo/bot-google-plugin`) - included in Bot. Adds Google, Google Gemini CLI, Google Vertex model provider support to Bot.

- **[huggingface](/plugins/reference/huggingface)** (`@hanzo/bot-huggingface-provider`) - included in Bot. Adds Hugging Face model provider support to Bot.

- **[imessage](/plugins/reference/imessage)** (`@hanzo/bot-imessage`) - included in Bot. Adds the iMessage channel surface for sending and receiving Bot messages.

- **[linux-canvas](/plugins/reference/linux-canvas)** (`@hanzo/bot-linux-canvas`) - included in Bot. Canvas rendering bridge for the Bot Linux desktop app.

- **[linux-node](/plugins/reference/linux-node)** (`@hanzo/bot-linux-node`) - included in Bot. Desktop notifications, camera capture, and location for Linux node hosts.

- **[litellm](/plugins/reference/litellm)** (`@hanzo/bot-litellm-provider`) - included in Bot. Adds LiteLLM model provider support to Bot.

- **[llm-task](/plugins/reference/llm-task)** (`@hanzo/bot-llm-task`) - included in Bot. Generic JSON-only LLM tool for structured tasks callable from workflows.

- **[lmstudio](/plugins/reference/lmstudio)** (`@hanzo/bot-lmstudio-provider`) - included in Bot. Adds LM Studio model provider support to Bot.

- **[logbook](/plugins/reference/logbook)** (`@hanzo/bot-logbook`) - included in Bot. Automatic work journal: captures periodic screen snapshots from a paired node and turns them into a reviewable timeline of your day.

- **[memory-core](/plugins/reference/memory-core)** (`@hanzo/bot-memory-core`) - included in Bot. Adds agent-callable tools.

- **[memory-wiki](/plugins/reference/memory-wiki)** (`@hanzo/bot-memory-wiki`) - included in Bot. Persistent wiki compiler and Obsidian-friendly knowledge vault for Bot.

- **[meta](/plugins/reference/meta)** (`@hanzo/bot-meta-provider`) - included in Bot; npm; ClawHub: `clawhub:@hanzo/bot-meta-provider`. Adds Meta model provider support to Bot.

- **[microsoft](/plugins/reference/microsoft)** (`@hanzo/bot-microsoft-speech`) - included in Bot. Adds text-to-speech provider support.

- **[microsoft-foundry](/plugins/reference/microsoft-foundry)** (`@hanzo/bot-microsoft-foundry`) - included in Bot. Adds Microsoft Foundry model provider support to Bot.

- **[migrate-claude](/plugins/reference/migrate-claude)** (`@hanzo/bot-migrate-claude`) - included in Bot. Imports Claude Code and Claude Desktop instructions, MCP servers, skills, and safe configuration into Bot.

- **[migrate-hermes](/plugins/reference/migrate-hermes)** (`@hanzo/bot-migrate-hermes`) - included in Bot. Imports Hermes configuration, memories, skills, and supported credentials into Bot.

- **[minimax](/plugins/reference/minimax)** (`@hanzo/bot-minimax-provider`) - included in Bot. Adds MiniMax, MiniMax Portal model provider support to Bot.

- **[mistral](/plugins/reference/mistral)** (`@hanzo/bot-mistral-provider`) - included in Bot. Adds Mistral model provider support to Bot.

- **[novita](/plugins/reference/novita)** (`@hanzo/bot-novita-provider`) - included in Bot. Adds Novita, Novita AI, Novitaai model provider support to Bot.

- **[nvidia](/plugins/reference/nvidia)** (`@hanzo/bot-nvidia-provider`) - included in Bot. Adds NVIDIA model provider support to Bot.

- **[oc-path](/plugins/reference/oc-path)** (`@hanzo/bot-oc-path`) - included in Bot. Adds the bot path CLI for oc:// workspace file addressing.

- **[ollama](/plugins/reference/ollama)** (`@hanzo/bot-ollama-provider`) - included in Bot. Adds Ollama, Ollama Cloud model provider support to Bot.

- **[onepassword](/plugins/reference/onepassword)** (`@hanzo/bot-onepassword`) - included in Bot. 1Password SecretRef resolver and curated agent broker with approval policy and SQLite audit history.

- **[open-prose](/plugins/reference/open-prose)** (`@hanzo/bot-open-prose`) - included in Bot. OpenProse VM skill pack with a /prose slash command.

- **[openai](/plugins/reference/openai)** (`@hanzo/bot-openai-provider`) - included in Bot. Adds OpenAI model provider support to Bot.

- **[opencode](/plugins/reference/opencode)** (`@hanzo/bot-opencode-provider`) - included in Bot. Adds OpenCode model provider support to Bot.

- **[opencode-go](/plugins/reference/opencode-go)** (`@hanzo/bot-opencode-go-provider`) - included in Bot. Adds OpenCode Go model provider support to Bot.

- **[openrouter](/plugins/reference/openrouter)** (`@hanzo/bot-openrouter-provider`) - included in Bot. Adds OpenRouter model provider support to Bot.

- **[policy](/plugins/reference/policy)** (`@hanzo/bot-policy`) - included in Bot. Adds policy-backed doctor checks for workspace conformance.

- **[reef](/plugins/reference/reef)** (`@hanzo/bot-reef`) - included in Bot. Guarded end-to-end encrypted claw channel.

- **[runway](/plugins/reference/runway)** (`@hanzo/bot-runway-provider`) - included in Bot. Adds video generation provider support.

- **[senseaudio](/plugins/reference/senseaudio)** (`@hanzo/bot-senseaudio-provider`) - included in Bot. Adds media understanding provider support.

- **[sglang](/plugins/reference/sglang)** (`@hanzo/bot-sglang-provider`) - included in Bot. Adds SGLang model provider support to Bot.

- **[synthetic](/plugins/reference/synthetic)** (`@hanzo/bot-synthetic-provider`) - included in Bot. Adds Synthetic model provider support to Bot.

- **[teams-meetings](/plugins/reference/teams-meetings)** (`@hanzo/bot-teams-meetings`) - included in Bot. Join Microsoft Teams meetings as a Chrome browser guest.

- **[telegram](/plugins/reference/telegram)** (`@hanzo/bot-telegram`) - included in Bot. Adds the Telegram channel surface for sending and receiving Bot messages.

- **[together](/plugins/reference/together)** (`@hanzo/bot-together-provider`) - included in Bot. Adds Together model provider support to Bot.

- **[tts-local-cli](/plugins/reference/tts-local-cli)** (`@hanzo/bot-tts-local-cli`) - included in Bot. Adds text-to-speech provider support.

- **[vault](/plugins/reference/vault)** (`@hanzo/bot-vault`) - included in Bot. HashiCorp Vault SecretRef provider integration.

- **[vllm](/plugins/reference/vllm)** (`@hanzo/bot-vllm-provider`) - included in Bot. Adds vLLM model provider support to Bot.

- **[volcengine](/plugins/reference/volcengine)** (`@hanzo/bot-volcengine-provider`) - included in Bot. Adds Volcengine, Volcengine Plan model provider support to Bot.

- **[voyage](/plugins/reference/voyage)** (`@hanzo/bot-voyage-provider`) - included in Bot. Adds memory embedding provider support.

- **[vydra](/plugins/reference/vydra)** (`@hanzo/bot-vydra-provider`) - included in Bot. Adds Vydra model provider support to Bot.

- **[web-readability](/plugins/reference/web-readability)** (`@hanzo/bot-web-readability-plugin`) - included in Bot. Extract readable article content from local HTML web fetch responses.

- **[webhooks](/plugins/reference/webhooks)** (`@hanzo/bot-webhooks`) - included in Bot. Authenticated inbound webhooks that bind external automation to Bot TaskFlows.

- **[workboard](/plugins/reference/workboard)** (`@hanzo/bot-workboard`) - included in Bot. Dashboard workboard for agent-owned issues and sessions.

- **[xai](/plugins/reference/xai)** (`@hanzo/bot-xai-plugin`) - included in Bot. Adds xAI model provider support to Bot.

- **[xiaomi](/plugins/reference/xiaomi)** (`@hanzo/bot-xiaomi-provider`) - included in Bot. Adds Xiaomi, Xiaomi Token Plan model provider support to Bot.

- **[zoom-meetings](/plugins/reference/zoom-meetings)** (`@hanzo/bot-zoom-meetings`) - included in Bot. Join Zoom meetings as a Chrome browser guest.

## Official external packages

73 plugins

- **[acpx](/plugins/reference/acpx)** (`@hanzo/bot-acpx`) - npm; ClawHub. Bot ACP runtime backend with plugin-owned session and transport management.

- **[amazon-bedrock](/plugins/reference/amazon-bedrock)** (`@hanzo/bot-amazon-bedrock-provider`) - npm; ClawHub. Bot Amazon Bedrock provider plugin with model discovery, embeddings, and guardrail support.

- **[amazon-bedrock-mantle](/plugins/reference/amazon-bedrock-mantle)** (`@hanzo/bot-amazon-bedrock-mantle-provider`) - npm; ClawHub. Bot Amazon Bedrock Mantle provider plugin for OpenAI-compatible model routing.

- **[anthropic-vertex](/plugins/reference/anthropic-vertex)** (`@hanzo/bot-anthropic-vertex-provider`) - npm; ClawHub. Bot Anthropic Vertex provider plugin for Claude models on Google Vertex AI.

- **[arcee](/plugins/reference/arcee)** (`@hanzo/bot-arcee-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-arcee-provider`. Adds Arcee model provider support to Bot.

- **[baseten](/plugins/reference/baseten)** (`@hanzo/bot-baseten-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-baseten-provider`. Bot Baseten provider plugin.

- **[brave](/plugins/reference/brave)** (`@hanzo/bot-brave-plugin`) - npm; ClawHub. Bot Brave Search provider plugin for web search.

- **[buzz](/plugins/reference/buzz)** (`@hanzo/bot-buzz`) - npm; ClawHub: `clawhub:@hanzo/bot-buzz`. Connect Bot agents to Buzz rooms.

- **[cerebras](/plugins/reference/cerebras)** (`@hanzo/bot-cerebras-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-cerebras-provider`. Adds Cerebras model provider support to Bot.

- **[chutes](/plugins/reference/chutes)** (`@hanzo/bot-chutes-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-chutes-provider`. Adds Chutes model provider support to Bot.

- **[clickclack](/plugins/reference/clickclack)** (`@hanzo/bot-clickclack`) - npm; ClawHub: `clawhub:@hanzo/bot-clickclack`. Adds the Clickclack channel surface for sending and receiving Bot messages.

- **[cloudflare-ai-gateway](/plugins/reference/cloudflare-ai-gateway)** (`@hanzo/bot-cloudflare-ai-gateway-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-cloudflare-ai-gateway-provider`. Adds Cloudflare AI Gateway model provider support to Bot.

- **[codex](/plugins/reference/codex)** (`@hanzo/bot-codex`) - npm; ClawHub. Codex app-server harness and native session catalog.

- **[copilot](/plugins/reference/copilot)** (`@hanzo/bot-copilot`) - npm; ClawHub: `clawhub:@hanzo/bot-copilot`. Registers the GitHub Copilot agent runtime.

- **[deepinfra](/plugins/reference/deepinfra)** (`@hanzo/bot-deepinfra-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-deepinfra-provider`. Adds DeepInfra model provider support to Bot.

- **[deepseek](/plugins/reference/deepseek)** (`@hanzo/bot-deepseek-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-deepseek-provider`. Adds DeepSeek model provider support to Bot.

- **[diagnostics-otel](/plugins/reference/diagnostics-otel)** (`@hanzo/bot-diagnostics-otel`) - npm; ClawHub: `clawhub:@hanzo/bot-diagnostics-otel`. Bot diagnostics OpenTelemetry exporter for metrics, traces, and logs.

- **[diagnostics-prometheus](/plugins/reference/diagnostics-prometheus)** (`@hanzo/bot-diagnostics-prometheus`) - npm; ClawHub: `clawhub:@hanzo/bot-diagnostics-prometheus`. Bot diagnostics Prometheus exporter for runtime metrics.

- **[diffs](/plugins/reference/diffs)** (`@hanzo/bot-diffs`) - npm; ClawHub. Bot read-only diff viewer plugin and file renderer for agents.

- **[diffs-language-pack](/plugins/reference/diffs-language-pack)** (`@hanzo/bot-diffs-language-pack`) - npm; ClawHub: `clawhub:@hanzo/bot-diffs-language-pack`. Adds syntax highlighting for languages outside the default diffs viewer set.

- **[discord](/plugins/reference/discord)** (`@hanzo/bot-discord`) - npm; ClawHub. Bot Discord channel plugin for channels, DMs, commands, and app events.

- **[exa](/plugins/reference/exa)** (`@hanzo/bot-exa-plugin`) - npm; ClawHub: `clawhub:@hanzo/bot-exa-plugin`. Adds web search provider support.

- **[featherless](/plugins/reference/featherless)** (`@hanzo/bot-featherless-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-featherless-provider`. Bot Featherless AI provider plugin.

- **[feishu](/plugins/reference/feishu)** (`@hanzo/bot-feishu`) - npm; ClawHub. Bot Feishu/Lark channel plugin for chats and workplace tools (community maintained by @m1heng).

- **[firecrawl](/plugins/reference/firecrawl)** (`@hanzo/bot-firecrawl-plugin`) - npm; ClawHub: `clawhub:@hanzo/bot-firecrawl-plugin`. Adds agent-callable tools. Adds web fetch provider support. Adds web search provider support.

- **[fireworks](/plugins/reference/fireworks)** (`@hanzo/bot-fireworks-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-fireworks-provider`. Adds Fireworks model provider support to Bot.

- **[gmi](/plugins/reference/gmi)** (`@hanzo/bot-gmi-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-gmi-provider`. Bot GMI Cloud provider plugin.

- **[google-meet](/plugins/reference/google-meet)** (`@hanzo/bot-google-meet`) - npm; ClawHub. Bot Google Meet participant plugin for joining calls through Chrome or Twilio transports.

- **[googlechat](/plugins/reference/googlechat)** (`@hanzo/bot-googlechat`) - npm; ClawHub. Bot Google Chat channel plugin for spaces and direct messages.

- **[gradium](/plugins/reference/gradium)** (`@hanzo/bot-gradium-speech`) - npm; ClawHub: `clawhub:@hanzo/bot-gradium-speech`. Adds text-to-speech provider support.

- **[groq](/plugins/reference/groq)** (`@hanzo/bot-groq-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-groq-provider`. Adds Groq model provider support to Bot.

- **[inworld](/plugins/reference/inworld)** (`@hanzo/bot-inworld-speech`) - npm; ClawHub: `clawhub:@hanzo/bot-inworld-speech`. Inworld streaming text-to-speech (MP3, OGG_OPUS, PCM telephony).

- **[irc](/plugins/reference/irc)** (`@hanzo/bot-irc`) - npm; ClawHub: `clawhub:@hanzo/bot-irc`. Adds the IRC channel surface for sending and receiving Bot messages.

- **[kilocode](/plugins/reference/kilocode)** (`@hanzo/bot-kilocode-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-kilocode-provider`. Adds Kilocode model provider support to Bot.

- **[kimi](/plugins/reference/kimi)** (`@hanzo/bot-kimi-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-kimi-provider`. Adds Kimi, Kimi Coding model provider support to Bot.

- **[line](/plugins/reference/line)** (`@hanzo/bot-line`) - npm; ClawHub. Bot LINE channel plugin for LINE Bot API chats.

- **[llama-cpp](/plugins/reference/llama-cpp)** (`@hanzo/bot-llama-cpp-provider`) - npm; ClawHub. Local GGUF text inference and embeddings through node-llama-cpp.

- **[lobster](/plugins/reference/lobster)** (`@hanzo/bot-lobster`) - npm; ClawHub. Lobster workflow tool plugin for typed pipelines and resumable approvals.

- **[longcat](/plugins/reference/longcat)** (`@hanzo/bot-longcat-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-longcat-provider`. Bot LongCat provider plugin.

- **[matrix](/plugins/reference/matrix)** (`@hanzo/bot-matrix`) - ClawHub: `clawhub:@hanzo/bot-matrix`; npm. Bot Matrix channel plugin for rooms and direct messages.

- **[mattermost](/plugins/reference/mattermost)** (`@hanzo/bot-mattermost`) - npm; ClawHub: `clawhub:@hanzo/bot-mattermost`. Adds the Mattermost channel surface for sending and receiving Bot messages.

- **[memory-lancedb](/plugins/reference/memory-lancedb)** (`@hanzo/bot-memory-lancedb`) - npm; ClawHub. Bot LanceDB-backed long-term memory plugin with auto-recall, auto-capture, and vector search.

- **[moonshot](/plugins/reference/moonshot)** (`@hanzo/bot-moonshot-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-moonshot-provider`. Adds Moonshot model provider support to Bot.

- **[msteams](/plugins/reference/msteams)** (`@hanzo/bot-msteams`) - npm; ClawHub. Bot Microsoft Teams channel plugin for bot conversations.

- **[mxc](/plugins/reference/mxc)** (`@hanzo/bot-mxc-sandbox`) - npm; ClawHub. OS-level sandboxed tool execution via MXC: runs commands in a Windows ProcessContainer with configured MXC policy files.

- **[nextcloud-talk](/plugins/reference/nextcloud-talk)** (`@hanzo/bot-nextcloud-talk`) - npm; ClawHub. Bot Nextcloud Talk channel plugin for conversations.

- **[nostr](/plugins/reference/nostr)** (`@hanzo/bot-nostr`) - npm; ClawHub. Bot Nostr channel plugin for NIP-04 encrypted direct messages.

- **[openshell](/plugins/reference/openshell)** (`@hanzo/bot-openshell-sandbox`) - npm; ClawHub. Bot sandbox backend for the NVIDIA OpenShell CLI with mirrored local workspaces and SSH command execution.

- **[parallel](/tools/parallel-search)** (`@hanzo/bot-parallel-plugin`) - npm; ClawHub: `clawhub:@hanzo/bot-parallel-plugin`. Adds web search provider support.

- **[perplexity](/plugins/reference/perplexity)** (`@hanzo/bot-perplexity-plugin`) - npm; ClawHub: `clawhub:@hanzo/bot-perplexity-plugin`. Adds web search provider support.

- **[pixverse](/plugins/reference/pixverse)** (`@hanzo/bot-pixverse-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-pixverse-provider`. Bot PixVerse video generation provider plugin.

- **[qianfan](/plugins/reference/qianfan)** (`@hanzo/bot-qianfan-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-qianfan-provider`. Adds Qianfan model provider support to Bot.

- **[qqbot](/plugins/reference/qqbot)** (`@hanzo/bot-qqbot`) - npm; ClawHub. Bot QQ Bot channel plugin for group and direct-message workflows.

- **[qwen](/plugins/reference/qwen)** (`@hanzo/bot-qwen-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-qwen-provider`. Adds Qwen, Qwen Cloud, Model Studio, DashScope, Qwen Token Plan, Bailian Token Plan model provider support to Bot.

- **[raft](/plugins/reference/raft)** (`@hanzo/bot-raft`) - npm; ClawHub. Bot Raft channel plugin for secure CLI wake bridges.

- **[searxng](/plugins/reference/searxng)** (`@hanzo/bot-searxng-plugin`) - npm; ClawHub: `clawhub:@hanzo/bot-searxng-plugin`. Adds web search provider support.

- **[signal](/plugins/reference/signal)** (`@hanzo/bot-signal`) - npm; ClawHub: `clawhub:@hanzo/bot-signal`. Adds the Signal channel surface for sending and receiving Bot messages.

- **[slack](/plugins/reference/slack)** (`@hanzo/bot-slack`) - npm; ClawHub. Bot Slack channel plugin for channels, DMs, commands, and app events.

- **[sms](/plugins/reference/sms)** (`@hanzo/bot-sms`) - npm; ClawHub: `clawhub:@hanzo/bot-sms`. Twilio SMS channel plugin for Bot text messages.

- **[stepfun](/plugins/reference/stepfun)** (`@hanzo/bot-stepfun-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-stepfun-provider`. Adds StepFun, StepFun Plan model provider support to Bot.

- **[synology-chat](/plugins/reference/synology-chat)** (`@hanzo/bot-synology-chat`) - npm; ClawHub. Synology Chat channel plugin for Bot channels and direct messages.

- **[tavily](/plugins/reference/tavily)** (`@hanzo/bot-tavily-plugin`) - npm; ClawHub: `clawhub:@hanzo/bot-tavily-plugin`. Adds agent-callable tools. Adds web search provider support.

- **[tencent](/plugins/reference/tencent)** (`@hanzo/bot-tencent-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-tencent-provider`. Adds Tencent TokenHub, Tencent Tokenplan model provider support to Bot.

- **[tlon](/plugins/reference/tlon)** (`@hanzo/bot-tlon`) - npm; ClawHub. Bot Tlon/Urbit channel plugin for chat workflows.

- **[tokenjuice](/plugins/reference/tokenjuice)** (`@hanzo/bot-tokenjuice`) - npm; ClawHub: `clawhub:@hanzo/bot-tokenjuice`. Compacts exec and bash tool results with tokenjuice reducers.

- **[twitch](/plugins/reference/twitch)** (`@hanzo/bot-twitch`) - npm; ClawHub. Bot Twitch channel plugin for chat and moderation workflows.

- **[venice](/plugins/reference/venice)** (`@hanzo/bot-venice-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-venice-provider`. Adds Venice model provider support to Bot.

- **[vercel-ai-gateway](/plugins/reference/vercel-ai-gateway)** (`@hanzo/bot-vercel-ai-gateway-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-vercel-ai-gateway-provider`. Adds Vercel AI Gateway model provider support to Bot.

- **[voice-call](/plugins/reference/voice-call)** (`@hanzo/bot-voice-call`) - npm; ClawHub. Bot voice-call plugin for Twilio, Telnyx, and Plivo phone calls.

- **[whatsapp](/plugins/reference/whatsapp)** (`@hanzo/bot-whatsapp`) - ClawHub: `clawhub:@hanzo/bot-whatsapp`; npm. Bot WhatsApp channel plugin for WhatsApp Web chats.

- **[zai](/plugins/reference/zai)** (`@hanzo/bot-zai-provider`) - npm; ClawHub: `clawhub:@hanzo/bot-zai-provider`. Adds Z.AI model provider support to Bot.

- **[zalo](/plugins/reference/zalo)** (`@hanzo/bot-zalo`) - npm; ClawHub. Bot Zalo channel plugin for bot and webhook chats.

- **[zalouser](/plugins/reference/zalouser)** (`@hanzo/bot-zalouser`) - npm; ClawHub. Bot Zalo Personal Account plugin via native zca-js integration.

## Source checkout only

2 plugins

- **[qa-channel](/plugins/reference/qa-channel)** (`@hanzo/bot-qa-channel`) - source checkout only. Adds the QA Channel surface for sending and receiving Bot messages.

- **[qa-lab](/plugins/reference/qa-lab)** (`@hanzo/bot-qa-lab`) - source checkout only. Bot QA lab plugin with private debugger UI and scenario runner.
