---
summary: "Secrets management: SecretRef contract, runtime snapshot behavior, and safe one-way scrubbing"
read_when:
  - Configuring SecretRefs for provider credentials and `auth-profiles.json` refs
  - Operating secrets reload, audit, configure, and apply safely in production
  - Understanding startup fail-fast, inactive-surface filtering, and last-known-good behavior
title: "Secrets Management"
---

# Secrets management

Bot supports additive secret references so credentials do not need to be stored as plaintext in config files.

Plaintext still works. SecretRefs are opt-in per credential.

## Goals and runtime model

Secrets are resolved into an in-memory runtime snapshot.

- Resolution is eager during activation, not lazy on request paths.
- Startup fails fast when an effectively active SecretRef cannot be resolved.
- Reload uses atomic swap: full success, or keep the last-known-good snapshot.
- Runtime requests read from the active in-memory snapshot only.

This keeps secret-provider outages off hot request paths.

## Active-surface filtering

SecretRefs are validated only on effectively active surfaces.

- Enabled surfaces: unresolved refs block startup/reload.
- Inactive surfaces: unresolved refs do not block startup/reload.
- Inactive refs emit non-fatal diagnostics with code `SECRETS_REF_IGNORED_INACTIVE_SURFACE`.

Examples of inactive surfaces:

- Disabled channel/account entries.
- Top-level channel credentials that no enabled account inherits.
- Disabled tool/feature surfaces.
- Web search provider-specific keys that are not selected by `tools.web.search.provider`.
  In auto mode (provider unset), provider-specific keys are also active for provider auto-detection.
- `gateway.remote.token` / `gateway.remote.password` SecretRefs are active (when `gateway.remote.enabled` is not `false`) if one of these is true:
  - `gateway.mode=remote`
  - `gateway.remote.url` is configured
  - `gateway.tailscale.mode` is `serve` or `funnel`
    In local mode without those remote surfaces:
  - `gateway.remote.token` is active when token auth can win and no env/auth token is configured.
  - `gateway.remote.password` is active only when password auth can win and no env/auth password is configured.

## Gateway auth surface diagnostics

When a SecretRef is configured on `gateway.auth.password`, `gateway.remote.token`, or
`gateway.remote.password`, gateway startup/reload logs the surface state explicitly:

- `active`: the SecretRef is part of the effective auth surface and must resolve.
- `inactive`: the SecretRef is ignored for this runtime because another auth surface wins, or
  because remote auth is disabled/not active.

These entries are logged with `SECRETS_GATEWAY_AUTH_SURFACE` and include the reason used by the
active-surface policy, so you can see why a credential was treated as active or inactive.

## Onboarding reference preflight

When onboarding runs in interactive mode and you choose secret reference storage, Bot performs a fast preflight check before saving:

- Env refs: validates env var name and confirms a non-empty value is visible during onboarding.
- File refs (`sops`): validates `secrets.sources.file`, decrypts, and resolves the JSON pointer.
- Provider refs (`file` or `exec`): validates the selected provider, resolves the provided `id`, and checks value type.

If validation fails, onboarding shows the error and lets you retry with a different ref/source.

## SecretRef contract

Use one object shape everywhere:

```json5
{ source: "env" | "file" | "exec", provider: "default", id: "..." }
```

### `source: "env"`

```json5
{ source: "env", provider: "default", id: "OPENAI_API_KEY" }
```

Validation:

- `provider` must match `^[a-z][a-z0-9_-]{0,63}$`
- `id` must match `^[A-Z][A-Z0-9_]{0,127}$`

### `source: "file"`

```json5
{ source: "file", provider: "filemain", id: "/providers/openai/apiKey" }
```

Validation:

- `provider` must match `^[a-z][a-z0-9_-]{0,63}$`
- `id` must be an absolute JSON pointer (`/...`)
- RFC6901 escaping in segments: `~` => `~0`, `/` => `~1`

### `source: "exec"`

```json5
{ source: "exec", provider: "vault", id: "providers/openai/apiKey" }
```

Validation:

- `provider` must match `^[a-z][a-z0-9_-]{0,63}$`
- `id` must match `^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$`

## Provider config

Define providers under `secrets.providers`:

```json5
{
  secrets: {
    providers: {
      default: { source: "env" },
      filemain: {
        source: "file",
        path: "~/.hanzo/bot/secrets.json",
        mode: "json", // or "singleValue"
      },
      vault: {
        source: "exec",
        command: "/usr/local/bin/bot-vault-resolver",
        args: ["--profile", "prod"],
        passEnv: ["PATH", "VAULT_ADDR"],
        jsonOnly: true,
      },
    },
    defaults: {
      env: "default",
      file: "filemain",
      exec: "vault",
    },
    resolution: {
      maxProviderConcurrency: 4,
      maxRefsPerProvider: 512,
      maxBatchBytes: 262144,
    },
  },
}
```

### Env provider

- Optional allowlist via `allowlist`.
- Missing/empty env values fail resolution.

### File provider

- Reads local file from `path`.
- `mode: "json"` expects JSON object payload and resolves `id` as pointer.
- `mode: "singleValue"` expects ref id `"value"` and returns file contents.
- Path must pass ownership/permission checks.
- Windows fail-closed note: if ACL verification is unavailable for a path, resolution fails. For trusted paths only, set `allowInsecurePath: true` on that provider to bypass path security checks.

### Exec provider

- Runs configured absolute binary path, no shell.
- By default, `command` must point to a regular file (not a symlink).
- Set `allowSymlinkCommand: true` to allow symlink command paths (for example Homebrew shims). Bot validates the resolved target path.
- Enable `allowSymlinkCommand` only when required for trusted package-manager paths, and pair it with `trustedDirs` (for example `["/opt/homebrew"]`).
- When `trustedDirs` is set, checks apply to the resolved target path.
- Supports timeout, no-output timeout, output byte limits, env allowlist, and trusted dirs.
- Windows fail-closed note: if ACL verification is unavailable for the command path, resolution fails. For trusted paths only, set `allowInsecurePath: true` on that provider to bypass path security checks.

Request payload (stdin):

```json
{ "protocolVersion": 1, "provider": "vault", "ids": ["providers/openai/apiKey"] }
```

Response payload (stdout):

```json
{ "protocolVersion": 1, "values": { "providers/openai/apiKey": "sk-..." } }
```

Optional per-id errors:

```json
{
  "protocolVersion": 1,
  "values": {},
  "errors": { "providers/openai/apiKey": { "message": "not found" } }
}
```

## Exec integration examples

### 1Password CLI

```json5
{
  secrets: {
    providers: {
      onepassword_openai: {
        source: "exec",
        command: "/opt/homebrew/bin/op",
        allowSymlinkCommand: true, // required for Homebrew symlinked binaries
        trustedDirs: ["/opt/homebrew"],
        args: ["read", "op://Personal/Bot QA API Key/password"],
        passEnv: ["HOME"],
        jsonOnly: false,
      },
    },
  },
  models: {
    providers: {
      openai: {
        baseUrl: "https://api.openai.com/v1",
        models: [{ id: "gpt-5", name: "gpt-5" }],
        apiKey: { source: "exec", provider: "onepassword_openai", id: "value" },
      },
    },
  },
}
```

### HashiCorp Vault CLI

```json5
{
  secrets: {
    providers: {
      vault_openai: {
        source: "exec",
        command: "/opt/homebrew/bin/vault",
        allowSymlinkCommand: true, // required for Homebrew symlinked binaries
        trustedDirs: ["/opt/homebrew"],
        args: ["kv", "get", "-field=OPENAI_API_KEY", "secret/bot"],
        passEnv: ["VAULT_ADDR", "VAULT_TOKEN"],
        jsonOnly: false,
      },
    },
  },
  models: {
    providers: {
      openai: {
        baseUrl: "https://api.openai.com/v1",
        models: [{ id: "gpt-5", name: "gpt-5" }],
        apiKey: { source: "exec", provider: "vault_openai", id: "value" },
      },
    },
  },
}
```

### `sops`

```json5
{
  secrets: {
    providers: {
      sops_openai: {
        source: "exec",
        command: "/opt/homebrew/bin/sops",
        allowSymlinkCommand: true, // required for Homebrew symlinked binaries
        trustedDirs: ["/opt/homebrew"],
        args: ["-d", "--extract", '["providers"]["openai"]["apiKey"]', "/path/to/secrets.enc.json"],
        passEnv: ["SOPS_AGE_KEY_FILE"],
        jsonOnly: false,
      },
    },
  },
  models: {
    providers: {
      openai: {
        baseUrl: "https://api.openai.com/v1",
        models: [{ id: "gpt-5", name: "gpt-5" }],
        apiKey: { source: "exec", provider: "sops_openai", id: "value" },
      },
    },
  },
}
```

## Supported credential surface

### `~/.hanzoai/bot.json`

- [SecretRef Credential Surface](/reference/secretref-credential-surface)

### `~/.hanzo/bot/agents/<agentId>/agent/auth-profiles.json`

- `profiles.<profileId>.keyRef` for `type: "api_key"`
- `profiles.<profileId>.tokenRef` for `type: "token"`

OAuth credential storage changes are out of scope.

## Required behavior and precedence

- Field without a ref: unchanged.
- Field with a ref: required on active surfaces during activation.
- If both plaintext and ref are present, ref takes precedence on supported precedence paths.

Warning and audit signals:

- `SECRETS_REF_OVERRIDES_PLAINTEXT` (runtime warning)
- `REF_SHADOWED` (audit finding when `auth-profiles.json` credentials take precedence over `bot.json` refs)

Google Chat compatibility behavior:

- `serviceAccountRef` takes precedence over plaintext `serviceAccount`.
- Plaintext value is ignored when sibling ref is set.

## Activation triggers

Secret activation runs on:

- Startup (preflight plus final activation)
- Config reload hot-apply path
- Config reload restart-check path
- Manual reload via `secrets.reload`

Activation contract:

- Success swaps the snapshot atomically.
- Startup failure aborts gateway startup.
- Runtime reload failure keeps the last-known-good snapshot.

## Degraded and recovered signals

When reload-time activation fails after a healthy state, Bot enters degraded secrets state.

One-shot system event and log codes:

- `SECRETS_RELOADER_DEGRADED`
- `SECRETS_RELOADER_RECOVERED`

Behavior:

- Degraded: runtime keeps last-known-good snapshot.
- Recovered: emitted once after the next successful activation.
- Repeated failures while already degraded log warnings but do not spam events.
- Startup fail-fast does not emit degraded events because runtime never became active.

## Command-path resolution

Command paths can opt into supported SecretRef resolution via gateway snapshot RPC.

There are two broad behaviors:

- Strict command paths (for example `bot memory` remote-memory paths and `bot qr --remote`) read from the active snapshot and fail fast when a required SecretRef is unavailable.
- Read-only command paths (for example `bot status`, `bot status --all`, `bot channels status`, `bot channels resolve`, and read-only doctor/config repair flows) also prefer the active snapshot, but degrade instead of aborting when a targeted SecretRef is unavailable in that command path.

Read-only behavior:

- When the gateway is running, these commands read from the active snapshot first.
- If gateway resolution is incomplete or the gateway is unavailable, they attempt targeted local fallback for the specific command surface.
- If a targeted SecretRef is still unavailable, the command continues with degraded read-only output and explicit diagnostics such as “configured but unavailable in this command path”.
- This degraded behavior is command-local only. It does not weaken runtime startup, reload, or send/auth paths.

Other notes:

- Snapshot refresh after backend secret rotation is handled by `bot secrets reload`.
- Gateway RPC method used by these command paths: `secrets.resolve`.

## Audit and configure workflow

Default operator flow:

```bash
hanzo-bot secrets audit --check
hanzo-bot secrets configure
hanzo-bot secrets audit --check
```

### `secrets audit`

Findings include:

- plaintext values at rest (`bot.json`, `auth-profiles.json`, `.env`)
- unresolved refs
- precedence shadowing (`auth-profiles.json` taking priority over `bot.json` refs)
- legacy residues (`auth.json`, OAuth reminders)

### `secrets configure`

Interactive helper that:

- configures `secrets.providers` first (`env`/`file`/`exec`, add/edit/remove)
- lets you select secret-bearing fields in `bot.json`
- captures SecretRef details (`source`, `provider`, `id`)
- runs preflight resolution
- can apply immediately

Helpful modes:

- `hanzo-bot secrets configure --providers-only`
- `hanzo-bot secrets configure --skip-provider-setup`

`configure` apply defaults:

- scrub matching static credentials from `auth-profiles.json` for targeted providers
- scrub legacy static `api_key` entries from `auth.json`
- scrub matching known secret lines from `<config-dir>/.env`

### `secrets apply`

Apply a saved plan:

```bash
hanzo-bot secrets apply --from /tmp/bot-secrets-plan.json
hanzo-bot secrets apply --from /tmp/bot-secrets-plan.json --dry-run
```

For strict target/path contract details and exact rejection rules, see:

- [Secrets Apply Plan Contract](/gateway/secrets-plan-contract)

## One-way safety policy

Bot intentionally does **not** write rollback backups that contain pre-migration plaintext secret values.

Safety model:

- preflight must succeed before write mode
- runtime activation is validated before commit
- apply updates files using atomic file replacement and best-effort restore on failure

## Legacy auth compatibility notes

For static credentials, Bot runtime no longer depends on plaintext `auth.json`.

- Runtime credential source is the resolved in-memory snapshot.
- Legacy static `api_key` entries are scrubbed when discovered.
- OAuth-related compatibility behavior remains separate.

## Web UI note

Some SecretInput unions are easier to configure in raw editor mode than in form mode.

## Related docs

- CLI commands: [secrets](/cli/secrets)
- Plan contract details: [Secrets Apply Plan Contract](/gateway/secrets-plan-contract)
- Credential surface: [SecretRef Credential Surface](/reference/secretref-credential-surface)
- Auth setup: [Authentication](/gateway/authentication)
- Security posture: [Security](/gateway/security)
- Environment precedence: [Environment Variables](/help/environment)
