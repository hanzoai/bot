---
summary: "Move an OpenClaw install to Hanzo Bot with one command: what moves, what does not, and what to do by hand"
read_when:
  - You run OpenClaw and want to switch to Hanzo Bot
  - You ran `hanzo-bot migrate openclaw` and want to know what it did
  - You need the OpenClaw to Hanzo Bot command, config or env var mapping
title: "Migrate from OpenClaw"
---

# Migrate from OpenClaw

Hanzo Bot is a fork of [OpenClaw](https://github.com/openclaw/openclaw) (formerly Warelay,
Clawdbot and Moltbot; MIT). If you run OpenClaw today, one command copies your config,
credentials, workspace, sessions, skills and cron jobs into Hanzo Bot. OpenClaw's own
files are never changed, so you can go back at any time.

This page was checked against **OpenClaw 2026.9.6** (commit `eb377ac`, npm `openclaw@2026.9.6`),
a real install made with `openclaw onboard`, and the [Hanzo Bot source](https://github.com/hanzoai/bot).

## The one command

```bash
npm install -g @hanzo/bot         # Node 22 or newer
hanzo-bot migrate openclaw        # shows what would move; writes nothing
hanzo-bot migrate openclaw --apply
hanzo-bot doctor
```

If `hanzo-bot migrate --help` says the command is unknown, update first:
`npm install -g @hanzo/bot@latest`.

- The source is `$OPENCLAW_STATE_DIR`, else `~/.openclaw`, else a `~/.clawdbot` from the
  Clawdbot days that OpenClaw has not moved yet. Point it elsewhere with `--from <dir>`; an
  `openclaw --profile work` install lives in `~/.openclaw-work`.
- The target is Hanzo Bot's state dir: `$BOT_STATE_DIR`, else `~/.bot`. Hanzo Bot never uses
  `~/.clawdbot`: it belongs to OpenClaw, which leaves it as a link to `~/.openclaw`.
- `--json` prints the plan as JSON (names and counts only, never a secret value).

Without `--apply` the command reads and prints; nothing is written anywhere. With `--apply`
it performs exactly what the plan listed. Run it again at any time: what is already in place
shows as `unchanged`, and nothing that exists in Hanzo Bot is replaced.

Stop OpenClaw's gateway before starting Hanzo Bot's. Both use port 18789, and a WhatsApp
login only stays connected on one of them:

```bash
openclaw gateway stop          # `openclaw gateway uninstall` also removes its service
hanzo-bot gateway install      # Hanzo Bot's gateway as a launchd/systemd service
hanzo-bot gateway run          # or in the foreground
```

## What moves

| OpenClaw                                                                                                    | Hanzo Bot                                        | Notes                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openclaw.json` (JSON5, `$include` resolved)                                                                | `bot.json`                                       | Converted key by key; see [config keys](#config-keys). Merged beneath an existing `bot.json`: see [an existing bot.json](#an-existing-botjson).                                                                                                                                                                 |
| `.env`                                                                                                      | `.env`                                           | `OPENCLAW_*` keys become `BOT_*`; values are copied as written, never printed. Keys you already set are kept.                                                                                                                                                                                                   |
| `workspace/`, `workspace-<agent>/`                                                                          | same names                                       | Every file, with its mode. A symlink keeps pointing where it pointed; one into `~/.openclaw` points at the same place in `~/.bot`. A dir that is itself a link elsewhere is copied as files, so the two installs stop sharing it. A link to a dir that is not there (an unmounted drive) is listed, not copied. |
| `skills/`, `hooks/`, `tools/`                                                                               | same names                                       | Managed skills, installed hooks and tools, as files.                                                                                                                                                                                                                                                            |
| Skill Workshop skills (`agents/<id>/agent/workshop-skills/`)                                                | `<agent workspace>/.agents/skills/`              | Each stays with its agent. One that a managed, workspace or personal skill of the same name hid in OpenClaw, or that a skill already in `~/.bot/skills` would hide, stays behind.                                                                                                                               |
| `credentials/`                                                                                              | `credentials/`                                   | Channel logins (WhatsApp) and pairing allowlists.                                                                                                                                                                                                                                                               |
| Auth profiles (`state/openclaw.sqlite`, `agents/<id>/agent/openclaw-agent.sqlite`, or `auth-profiles.json`) | `agents/<id>/agent/auth-profiles.json`           | API keys and OAuth tokens, mode `0600`. Usage statistics and cooldowns start fresh.                                                                                                                                                                                                                             |
| Sessions (`session_nodes`, `transcript_events`, or `sessions.json` + `*.jsonl`)                             | `agents/<id>/sessions/`                          | The session index and every transcript. Earlier generations of a session become `<id>.jsonl.reset.<time>` archives.                                                                                                                                                                                             |
| Your cron jobs (`cron_jobs` or `cron/jobs.json`)                                                            | `cron/jobs.json`                                 | Schedule, payload and delivery. Run history starts fresh.                                                                                                                                                                                                                                                       |
| Pairing allowlists (`channel_pairing_allow_entries`)                                                        | `credentials/<channel>-<account>-allowFrom.json` | Who may DM your bot. An allowlist file OpenClaw has not folded into its database yet is merged in, as OpenClaw's doctor would.                                                                                                                                                                                  |
| An agent's heartbeat checklist (`cron_job_scratch`, formerly `HEARTBEAT.md`)                                | `HEARTBEAT.md` in the agent's workspace          | OpenClaw moved it into its database; Hanzo Bot reads it from the workspace.                                                                                                                                                                                                                                     |
| `hooks.internal.installs`                                                                                   | `bot.json` `hooks.internal.installs`             |                                                                                                                                                                                                                                                                                                                 |

OpenClaw 2026.5 and later keeps most state in SQLite (`state/openclaw.sqlite` and one
`openclaw-agent.sqlite` per agent). The importer reads copies of those databases, WAL
included, and writes Hanzo Bot's plain files. Older OpenClaw installs keep the same state in
files; both layouts are read.

Everything is written inside the Hanzo Bot state dir: `bot.json`, `.env`, `credentials/` and
`agents/` are owner-only (`0600` files, `0700` directories); copied files keep their mode.
Nothing is written into a dir OpenClaw uses: not `~/.openclaw`, not a dir it reaches through a
link, not a workspace it keeps elsewhere. An agent whose workspace is outside `~/.bot` gets its
heartbeat checklist and workshop skills in `~/.bot/agents/<id>/from-openclaw/`, and the plan
says where to move them. So do an agent's workshop skills when its workspace keeps `.agents/`
as a link into such a dir (your dotfiles, say). A config path spelled through Clawdbot's
`~/.clawdbot`, or through any other link into `~/.openclaw`, is read as the `~/.openclaw` path it
reaches, so it becomes the `~/.bot` copy. A workspace in a part of `~/.openclaw` the import does
not copy stays where it is, and both installs use it.

## What does not move

The plan lists each of these under **Not carried**, with the reason.

| What                                                                                       | Why                                                                                  | What to do                                                                                   |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| OpenClaw plugins (`extensions/`, `npm/`, `git/`, `plugins.installs`, `plugins.load.paths`) | Built for OpenClaw's plugin SDK. A load path that holds a `bot.plugin.json` is kept. | `hanzo-bot plugins list` shows what Hanzo Bot ships.                                         |
| Secrets in OpenClaw's secret store (`{ "source": "store" }` refs)                          | Encrypted with OpenClaw's key. The setting that used it stays, without the value.    | Enter the value again, in `bot.json` or `~/.bot/.env`.                                       |
| `credentials/auth-profiles/`                                                               | Encrypted with OpenClaw's key.                                                       | Sign in again: `hanzo-bot models auth` or `hanzo-bot configure`.                             |
| Cron jobs OpenClaw created itself (heartbeat, memory dreaming, skill review)               | They carry a `declarationKey`; Hanzo Bot schedules its own heartbeat.                | Nothing.                                                                                     |
| Paired devices and nodes (`devices/`, `identity/`, `nodes/`)                               | Pairing is per gateway.                                                              | `hanzo-bot qr`, then pair again.                                                             |
| Exec approvals                                                                             | Per gateway.                                                                         | Approve again when asked.                                                                    |
| Search indexes (`memory/`, `qmd/`), caches, media, logs, `tmp/`, backups                   | Rebuilt or runtime-only.                                                             | Nothing.                                                                                     |
| Config keys Hanzo Bot does not have                                                        | Listed one by one.                                                                   | See [what OpenClaw has that Hanzo Bot does not](#what-openclaw-has-that-hanzo-bot-does-not). |

## Commands

The CLI is `hanzo-bot` (also installed as `bot`). Most commands keep their OpenClaw name.

| OpenClaw                                                                                                                                                                                                             | Hanzo Bot                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `openclaw onboard`                                                                                                                                                                                                   | `hanzo-bot onboard`                                                        |
| `openclaw gateway run \| install \| start \| stop \| status \| uninstall`                                                                                                                                            | `hanzo-bot gateway run \| install \| start \| stop \| status \| uninstall` |
| `openclaw channels add \| login \| status`                                                                                                                                                                           | `hanzo-bot channels add \| login \| status`                                |
| `openclaw models status \| set`                                                                                                                                                                                      | `hanzo-bot models status \| set`                                           |
| `openclaw agent`, `openclaw message send`                                                                                                                                                                            | `hanzo-bot agent`, `hanzo-bot message send`                                |
| `openclaw cron`, `openclaw automations`                                                                                                                                                                              | `hanzo-bot cron`                                                           |
| `openclaw exec-approvals`, `openclaw approvals`                                                                                                                                                                      | `hanzo-bot approvals`                                                      |
| `openclaw chat`, `openclaw terminal`                                                                                                                                                                                 | `hanzo-bot tui` (connects to the running gateway)                          |
| `openclaw skills install <slug>`                                                                                                                                                                                     | `npx clawhub install <slug> --workdir ~/.bot/workspace`                    |
| `openclaw skills list \| info \| check`                                                                                                                                                                              | `hanzo-bot skills list \| info \| check`                                   |
| `openclaw doctor`, `status`, `health`, `logs`, `config`, `configure`, `sessions`, `memory`, `hooks`, `plugins`, `secrets`, `security`, `sandbox`, `pairing`, `devices`, `nodes`, `node`, `qr`, `update`, `uninstall` | the same name under `hanzo-bot`                                            |
| `openclaw migrate` (imports into OpenClaw)                                                                                                                                                                           | `hanzo-bot migrate openclaw` (imports OpenClaw into Hanzo Bot)             |

These OpenClaw commands have no Hanzo Bot counterpart: `attach`, `audit`, `backup`,
`capability`/`infer`, `connect`, `database`, `exec-policy`, `file-transfer`, `fleet`, `mcp`,
`promos`, `proxy`, `resume`, `tasks`, `telemetry`, `transcripts`, `triage`, `users`, `worker`,
`worktrees`.

## Config keys

Most of `openclaw.json` means the same thing in `bot.json` and is copied as it is. Settings
OpenClaw moved after Hanzo Bot forked from it go back to where Hanzo Bot reads them:

| `openclaw.json`                                                     | `bot.json`                                                                          |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `agents.entries.<id>`                                               | `agents.list[]` with `id: "<id>"`                                                   |
| `agents.defaults.modelPolicy.allow`                                 | `agents.defaults.models` (the allowlist), keeping each model's alias and params     |
| `agents.defaults.models` with no `modelPolicy.allow`                | dropped: in OpenClaw it is a catalog, in Hanzo Bot a non-empty map restricts models |
| `agents.defaults.embeddedAgent`, `agents.list[].embeddedAgent`      | `…embeddedPi`                                                                       |
| `memory.search`, `agents.list[].memory.search`                      | `agents.defaults.memorySearch`, `agents.list[].memorySearch`                        |
| `tts`                                                               | `messages.tts`                                                                      |
| `attachments`                                                       | `media`                                                                             |
| `gateway.nodes.commands.allow`, `.deny`                             | `gateway.nodes.allowCommands`, `.denyCommands`                                      |
| `plugins.entries.canvas.config.host`                                | `canvasHost`                                                                        |
| `plugins.entries.brave.config.webSearch.apiKey`                     | `tools.web.search.apiKey`                                                           |
| `plugins.entries.{perplexity,google,xai,moonshot}.config.webSearch` | `tools.web.search.{perplexity,gemini,grok,kimi}`                                    |
| `browser.profiles.<name>.driver: "openclaw"`                        | `driver: "clawd"`; a profile with no `color` gets one from Hanzo Bot's palette      |
| `"${OPENCLAW_X}"` anywhere in a value                               | `"${BOT_X}"`                                                                        |
| `~/.openclaw/...` anywhere in a value                               | `~/.bot/...`                                                                        |
| `meta`                                                              | dropped (OpenClaw's write stamp)                                                    |

A setting that already exists at its new place wins over the old one. Keys Hanzo Bot does
not have are dropped and listed. The result is checked with Hanzo Bot's own validator
(schema and plugin checks) before it is written, so `bot.json` always loads; a value it
rejects is dropped and listed rather than written.

### An existing bot.json

When `~/.bot/bot.json` exists, the converted config is merged beneath it and the old file is
kept as `bot.json.bak`:

- A value you set wins. The plan names each key where your value differs from OpenClaw's,
  under **Do by hand**, instead of listing it as moved.
- Values Hanzo Bot's first run wrote (from running `hanzo-bot` before the import) give way to
  OpenClaw's: the workspace, the gateway mode and bind, and, when the import brings your own
  Anthropic key (in any agent's auth profiles, in `.env`, or in the config), the route that sent
  Anthropic calls through `api.hanzo.ai`. The sign-in token the first run stored for that route
  is then removed from every agent, so it never goes to Anthropic.
- A route through `api.hanzo.ai` that you changed stays; the plan then says your imported key
  goes there too.
- The merged file is checked again. An imported key that would stop it loading next to your
  settings is dropped and listed.

## Environment variables

Every `OPENCLAW_<NAME>` in `~/.openclaw/.env` is written as `BOT_<NAME>` in `~/.bot/.env`.
`OPENCLAW_STATE_DIR`, `OPENCLAW_CONFIG_PATH`, `OPENCLAW_HOME` and `OPENCLAW_PROFILE` point at
the OpenClaw install and are not carried. Provider keys such as `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY` or `TELEGRAM_BOT_TOKEN` keep their names.

| OpenClaw                                                               | Hanzo Bot                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------- |
| `OPENCLAW_STATE_DIR` (`~/.openclaw`)                                   | `BOT_STATE_DIR` (`~/.bot`)                              |
| `OPENCLAW_CONFIG_PATH` (`~/.openclaw/openclaw.json`)                   | `BOT_CONFIG_PATH` (`~/.bot/bot.json`)                   |
| `openclaw --profile <name>` (`~/.openclaw-<name>`)                     | `hanzo-bot --profile <name>` (`~/.bot-<name>`)          |
| `OPENCLAW_HOME`                                                        | `BOT_HOME`                                              |
| `OPENCLAW_GATEWAY_TOKEN`, `OPENCLAW_GATEWAY_PORT`                      | `BOT_GATEWAY_TOKEN`, `BOT_GATEWAY_PORT`                 |
| `OPENCLAW_LOG_LEVEL`, `OPENCLAW_HIDE_BANNER`, `OPENCLAW_SKIP_CHANNELS` | `BOT_LOG_LEVEL`, `BOT_HIDE_BANNER`, `BOT_SKIP_CHANNELS` |

Variables you export in your shell profile or service unit are not touched; rename them there
the same way. If `bot.json` reads a `${BOT_*}` that no `.env` sets, the plan says which.

## Channels

| Channel                                                                                                                                         | After the import                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WhatsApp                                                                                                                                        | The login in `credentials/whatsapp/<account>/` moves as it is (both use Baileys 7). Keep one gateway on it: WhatsApp logs out the other.                                |
| Telegram, Discord, Slack, Google Chat, Microsoft Teams, Mattermost, LINE, Feishu, Zalo, IRC, Twitch, Nostr, Nextcloud Talk, Synology Chat, Tlon | Tokens in `bot.json` or `.env` move. A token that was in OpenClaw's secret store is entered again.                                                                      |
| Signal                                                                                                                                          | signal-cli keeps its keys in its own data dir, which both installs use. Nothing to do; run one gateway at a time.                                                       |
| iMessage, BlueBubbles                                                                                                                           | Configuration only; nothing to re-pair.                                                                                                                                 |
| Matrix, Zalo Personal                                                                                                                           | From an OpenClaw 2026.5+ install their session was in OpenClaw's database: sign in again with `hanzo-bot channels login`. From an older install the session files move. |
| OpenClaw-only channels (SMS, FaceTime, Google Meet, Zoom and Teams meetings)                                                                    | Not in Hanzo Bot; listed as not carried.                                                                                                                                |

Check them all with `hanzo-bot channels status --probe`.

## Skills

Skills are folders with a `SKILL.md`, the same format in both. Your workspace skills
(`workspace/skills/`) and managed skills (`skills/`) move as files, so they load in Hanzo Bot
the same way. Skill Workshop skills belong to one agent: each goes to that agent's workspace
as a project skill (`.agents/skills/`), which only that agent loads. A skill of yours with the
same name as a Hanzo Bot bundled skill overrides it, as it did in OpenClaw.

Skills installed from [ClawHub](https://clawhub.ai) keep their `.clawhub/` origin and lock
files, so the ClawHub CLI still updates them in their new place:

```bash
npx clawhub update --all --workdir ~/.bot/workspace
npx clawhub install <slug> --workdir ~/.bot/workspace
```

Hanzo Bot reads a skill's gating (`requires.bins`, `requires.env`, `os`) from
`metadata.bot`, `metadata.hanzo-bot`, or ClawHub's `metadata.openclaw`, so ClawHub skills are
checked the same way they were.

## Models and keys

Your provider keys and your model choice move unchanged: an OpenClaw install on
`anthropic/claude-opus-5` with an Anthropic key is a Hanzo Bot install on the same model with
the same key. If you ran `hanzo-bot` before importing, its first-run route for Anthropic
through `api.hanzo.ai` gives way to your key, wherever OpenClaw kept it (see
[an existing bot.json](#an-existing-botjson)).
`hanzo-bot models status` shows what it resolved.

Hanzo Bot can also route every model through the Hanzo gateway at `api.hanzo.ai`: one key
for many providers, billed to your Hanzo account. Create a key (see
[API keys](https://docs.hanzo.ai/docs/api-keys)), then:

```bash
echo 'HANZO_API_KEY=<your key>' >> ~/.bot/.env
hanzo-bot models set hanzo/enso
```

`hanzo/<model>` (and `zen/<model>`) refer to models served through the gateway. A fresh
install with no config asks you to sign in with a Hanzo account on first run.

## Hanzo account

OpenClaw has no account. Hanzo Bot works without one too, with your own keys. A Hanzo
account ([hanzo.id](https://hanzo.id)) adds the model gateway above. Running `hanzo-bot` with
no arguments signs you in and opens a launch menu; its **Run Locally** starts the gateway on
the `bot.json` you have, such as the one the import wrote, without rewriting it and with that
config's own auth, bind and Tailscale settings, as `hanzo-bot gateway run` would.

On a machine with an OpenClaw install and no `bot.json`, the first `hanzo-bot` command shows
the import commands and asks before setting up a fresh install; without a terminal to ask on,
it stops there.

## What Hanzo Bot adds

- The Hanzo model gateway: `hanzo/*` and `zen/*` models through `api.hanzo.ai`.
- Sign-in with a Hanzo account ([hanzo.id](https://hanzo.id)).
- `hanzo-bot social`: post and schedule through Hanzo Social.
- The `flow` plugin: typed workflows with resumable approvals.

## What OpenClaw has that Hanzo Bot does not

- The commands listed under [Commands](#commands) as having no counterpart.
- Config blocks: `mcp` (MCP servers), `accessGroups`, `cloudWorkers`, `desktop`, `proxy`,
  `security`, `surfaces`, `telemetry`, `transcripts`, `worktreeRoot`,
  `worktreeAcceleration`. The import drops them and lists each one.
- OpenClaw's plugin SDK and its plugin catalog; the provider plugins it split out
  (Anthropic, OpenAI and the rest are built into Hanzo Bot, so `plugins.entries.anthropic`
  and the like are dropped).
- The SMS, FaceTime and meeting channels.
- An encrypted secret store; Hanzo Bot reads secrets from `bot.json`, `.env`, the
  environment, or a file or command (`secrets` in `bot.json`).

## Going back

Nothing in `~/.openclaw`, or in any dir OpenClaw reaches from it, was changed. `hanzo-bot doctor`
lists OpenClaw's gateway service, even one still labelled `com.clawdbot.gateway` from the
Clawdbot days, and never removes it. Stop Hanzo Bot's gateway and start OpenClaw's:

```bash
hanzo-bot gateway stop
openclaw gateway start         # `openclaw gateway install` if you uninstalled its service
```

To remove the import, delete `~/.bot` (or only what the plan created).

## Troubleshooting

- **`no OpenClaw install at …`**: pass the right dir with `--from`, for example
  `hanzo-bot migrate openclaw --from ~/.openclaw-work`.
- **A `conflict` line in the plan**: that file already exists in Hanzo Bot with different
  content. Hanzo Bot's copy is kept; the plan names each file. Move yours by hand if you want it.
- **Port 18789 in use**: OpenClaw's gateway is still running. `openclaw gateway stop`, or
  uninstall its service with `openclaw gateway uninstall`.
- **WhatsApp logged out**: two gateways were connected to the same account. Stop one, then
  `hanzo-bot channels login --channel whatsapp` if needed.
- **A channel says it has no token**: it was in OpenClaw's secret store. Set it again.
- **`… leads into …, which OpenClaw uses, through the link …`**: a dir in `~/.bot` is a link
  into `~/.openclaw` or another dir OpenClaw uses (a shared workspace, say), so the import would
  change OpenClaw's files. The message names the link: replace it with a plain dir (a copy of
  what it points at), then run again.
- **`bot.json would not load after the merge`**: your existing `bot.json` and OpenClaw's config
  clash in a way no single imported key explains. Move `bot.json` aside, import, then copy your
  settings back.
- **`compressed transcript events need Node 22.15 or newer`**: OpenClaw stores large
  transcript events zstd-compressed; run the import with Node 22.15+.
- **`hanzo-bot doctor`** notices an OpenClaw install and prints the commands above, with or
  without a `bot.json`; it is safe to ignore once you have moved.
