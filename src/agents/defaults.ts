// Defaults for agent metadata when upstream does not supply them.
// Routes through Hanzo LLM Gateway (api.hanzo.ai) by default.
// The default model is `enso` (Enso Pro) — the balanced orchestrated tier that
// routes each request to the best-fit model, so an easy turn bills cheap and only
// a hard one escalates. Override via HANZO_DEFAULT_PROVIDER / HANZO_DEFAULT_MODEL
// env vars (BOT_DEFAULT_PROVIDER / BOT_DEFAULT_MODEL also accepted for backwards compat).
export const DEFAULT_PROVIDER =
  process.env.HANZO_DEFAULT_PROVIDER ?? process.env.BOT_DEFAULT_PROVIDER ?? "hanzo";
export const DEFAULT_MODEL =
  process.env.HANZO_DEFAULT_MODEL ?? process.env.BOT_DEFAULT_MODEL ?? "enso";
// Conservative fallback used when model metadata is unavailable.
export const DEFAULT_CONTEXT_TOKENS = 200_000;
