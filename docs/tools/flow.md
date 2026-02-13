---
title: Flow
summary: "Typed workflow runtime for Hanzo Bot with resumable approval gates."
description: Typed workflow runtime for Hanzo Bot — composable pipelines with approval gates.
read_when:
  - You want deterministic multi-step workflows with explicit approvals
  - You need to resume a workflow without re-running earlier steps
---

# Flow

Flow is a workflow shell that lets Hanzo Bot run multi-step tool sequences as a single, deterministic operation with explicit approval checkpoints.

## Hook

Your assistant can build the tools that manage itself. Ask for a workflow, and 30 minutes later you have a CLI plus pipelines that run as one call. Flow is the missing piece: deterministic pipelines, explicit approvals, and resumable state.

## Why

Today, complex workflows require many back-and-forth tool calls. Each call costs tokens, and the LLM has to orchestrate every step. Flow moves that orchestration into a typed runtime:

- **One call instead of many**: Hanzo Bot runs one Flow tool call and gets a structured result.
- **Approvals built in**: Side effects (send email, post comment) halt the workflow until explicitly approved.
- **Resumable**: Halted workflows return a token; approve and resume without re-running everything.

## Why a DSL instead of plain programs?

Flow is intentionally small. The goal is not "a new language," it's a predictable, AI-friendly pipeline spec with first-class approvals and resume tokens.

- **Approve/resume is built in**: A normal program can prompt a human, but it can’t _pause and resume_ with a durable token without you inventing that runtime yourself.
- **Determinism + auditability**: Pipelines are data, so they’re easy to log, diff, replay, and review.
- **Constrained surface for AI**: A tiny grammar + JSON piping reduces “creative” code paths and makes validation realistic.
- **Safety policy baked in**: Timeouts, output caps, sandbox checks, and allowlists are enforced by the runtime, not each script.
- **Still programmable**: Each step can call any CLI or script. If you want JS/TS, generate `.flow` files from code.

## How it works

Hanzo Bot launches the local `flow` CLI in **tool mode** and parses a JSON envelope from stdout.
If the pipeline pauses for approval, the tool returns a `resumeToken` so you can continue later.

## Pattern: small CLI + JSON pipes + approvals

Build tiny commands that speak JSON, then chain them into a single Flow call. (Example command names below — swap in your own.)

```bash
inbox list --json
inbox categorize --json
inbox apply --json
```

```json
{
  "action": "run",
  "pipeline": "exec --json --shell 'inbox list --json' | exec --stdin json --shell 'inbox categorize --json' | exec --stdin json --shell 'inbox apply --json' | approve --preview-from-stdin --limit 5 --prompt 'Apply changes?'",
  "timeoutMs": 30000
}
```

If the pipeline requests approval, resume with the token:

```json
{
  "action": "resume",
  "token": "<resumeToken>",
  "approve": true
}
```

AI triggers the workflow; Flow executes the steps. Approval gates keep side effects explicit and auditable.

Example: map input items into tool calls:

```bash
gog.gmail.search --query 'newer_than:1d' \
  | bot.invoke --tool message --action send --each --item-key message --args-json '{"provider":"telegram","to":"..."}'
```

## JSON-only LLM steps (llm-task)

For workflows that need a **structured LLM step**, enable the optional
`llm-task` plugin tool and call it from Flow. This keeps the workflow
deterministic while still letting you classify/summarize/draft with a model.

Enable the tool:

```json
{
  "plugins": {
    "entries": {
      "llm-task": { "enabled": true }
    }
  },
  "agents": {
    "list": [
      {
        "id": "main",
        "tools": { "allow": ["llm-task"] }
      }
    ]
  }
}
```

Use it in a pipeline:

```flow
bot.invoke --tool llm-task --action json --args-json '{
  "prompt": "Given the input email, return intent and draft.",
  "input": { "subject": "Hello", "body": "Can you help?" },
  "schema": {
    "type": "object",
    "properties": {
      "intent": { "type": "string" },
      "draft": { "type": "string" }
    },
    "required": ["intent", "draft"],
    "additionalProperties": false
  }
}'
```

See [LLM Task](/tools/llm-task) for details and configuration options.

## Workflow files (.flow)

Flow can run YAML/JSON workflow files with `name`, `args`, `steps`, `env`, `condition`, and `approval` fields. In Hanzo Bot tool calls, set `pipeline` to the file path.

```yaml
name: inbox-triage
args:
  tag:
    default: "family"
steps:
  - id: collect
    command: inbox list --json
  - id: categorize
    command: inbox categorize --json
    stdin: $collect.stdout
  - id: approve
    command: inbox apply --approve
    stdin: $categorize.stdout
    approval: required
  - id: execute
    command: inbox apply --execute
    stdin: $categorize.stdout
    condition: $approve.approved
```

Notes:

- `stdin: $step.stdout` and `stdin: $step.json` pass a prior step’s output.
- `condition` (or `when`) can gate steps on `$step.approved`.

## Install Flow

Install the Flow CLI on the **same host** that runs the Hanzo Bot Gateway (see the [Flow repo](https://github.com/bot/flow)), and ensure `flow` is on `PATH`.
If you want to use a custom binary location, pass an **absolute** `flowPath` in the tool call.

## Enable the tool

Flow is an **optional** plugin tool (not enabled by default).

Recommended (additive, safe):

```json
{
  "tools": {
    "alsoAllow": ["flow"]
  }
}
```

Or per-agent:

```json
{
  "agents": {
    "list": [
      {
        "id": "main",
        "tools": {
          "alsoAllow": ["flow"]
        }
      }
    ]
  }
}
```

Avoid using `tools.allow: ["flow"]` unless you intend to run in restrictive allowlist mode.

Note: allowlists are opt-in for optional plugins. If your allowlist only names
plugin tools (like `flow`), Hanzo Bot keeps core tools enabled. To restrict core
tools, include the core tools or groups you want in the allowlist too.

## Example: Email triage

Without Flow:

```
User: "Check my email and draft replies"
→ hanzo-bot calls gmail.list
→ LLM summarizes
→ User: "draft replies to #2 and #5"
→ LLM drafts
→ User: "send #2"
→ hanzo-bot calls gmail.send
(repeat daily, no memory of what was triaged)
```

With Flow:

```json
{
  "action": "run",
  "pipeline": "email.triage --limit 20",
  "timeoutMs": 30000
}
```

Returns a JSON envelope (truncated):

```json
{
  "ok": true,
  "status": "needs_approval",
  "output": [{ "summary": "5 need replies, 2 need action" }],
  "requiresApproval": {
    "type": "approval_request",
    "prompt": "Send 2 draft replies?",
    "items": [],
    "resumeToken": "..."
  }
}
```

User approves → resume:

```json
{
  "action": "resume",
  "token": "<resumeToken>",
  "approve": true
}
```

One workflow. Deterministic. Safe.

## Tool parameters

### `run`

Run a pipeline in tool mode.

```json
{
  "action": "run",
  "pipeline": "gog.gmail.search --query 'newer_than:1d' | email.triage",
  "cwd": "/path/to/workspace",
  "timeoutMs": 30000,
  "maxStdoutBytes": 512000
}
```

Run a workflow file with args:

```json
{
  "action": "run",
  "pipeline": "/path/to/inbox-triage.flow",
  "argsJson": "{\"tag\":\"family\"}"
}
```

### `resume`

Continue a halted workflow after approval.

```json
{
  "action": "resume",
  "token": "<resumeToken>",
  "approve": true
}
```

### Optional inputs

- `flowPath`: Absolute path to the Flow binary (omit to use `PATH`).
- `cwd`: Working directory for the pipeline (defaults to the current process working directory).
- `timeoutMs`: Kill the subprocess if it exceeds this duration (default: 20000).
- `maxStdoutBytes`: Kill the subprocess if stdout exceeds this size (default: 512000).
- `argsJson`: JSON string passed to `flow run --args-json` (workflow files only).

## Output envelope

Flow returns a JSON envelope with one of three statuses:

- `ok` → finished successfully
- `needs_approval` → paused; `requiresApproval.resumeToken` is required to resume
- `cancelled` → explicitly denied or cancelled

The tool surfaces the envelope in both `content` (pretty JSON) and `details` (raw object).

## Approvals

If `requiresApproval` is present, inspect the prompt and decide:

- `approve: true` → resume and continue side effects
- `approve: false` → cancel and finalize the workflow

Use `approve --preview-from-stdin --limit N` to attach a JSON preview to approval requests without custom jq/heredoc glue. Resume tokens are now compact: Flow stores workflow resume state under its state dir and hands back a small token key.

## OpenProse

OpenProse pairs well with Flow: use `/prose` to orchestrate multi-agent prep, then run a Flow pipeline for deterministic approvals. If a Prose program needs Flow, allow the `flow` tool for sub-agents via `tools.subagents.tools`. See [OpenProse](/prose).

## Safety

- **Local subprocess only** — no network calls from the plugin itself.
- **No secrets** — Flow doesn't manage OAuth; it calls Hanzo Bot tools that do.
- **Sandbox-aware** — disabled when the tool context is sandboxed.
- **Hardened** — `flowPath` must be absolute if specified; timeouts and output caps enforced.

## Troubleshooting

- **`flow subprocess timed out`** → increase `timeoutMs`, or split a long pipeline.
- **`flow output exceeded maxStdoutBytes`** → raise `maxStdoutBytes` or reduce output size.
- **`flow returned invalid JSON`** → ensure the pipeline runs in tool mode and prints only JSON.
- **`flow failed (code …)`** → run the same pipeline in a terminal to inspect stderr.

## Learn more

- [Plugins](/tools/plugin)
- [Plugin tool authoring](/plugins/agent-tools)

## Case study: community workflows

One public example: a “second brain” CLI + Flow pipelines that manage three Markdown vaults (personal, partner, shared). The CLI emits JSON for stats, inbox listings, and stale scans; Flow chains those commands into workflows like `weekly-review`, `inbox-triage`, `memory-consolidation`, and `shared-task-sync`, each with approval gates. AI handles judgment (categorization) when available and falls back to deterministic rules when not.

- Thread: [https://x.com/plattenschieber/status/2014508656335770033](https://x.com/plattenschieber/status/2014508656335770033)
- Repo: [https://github.com/bloomedai/brain-cli](https://github.com/bloomedai/brain-cli)
