// Safe loader for package-local Bot profiles referenced by Claw metadata.
import { isScalar, parseDocument, visit } from "yaml";
import { FsSafeError, root as fsSafeRoot } from "../infra/fs-safe.js";
import { isSafeClawRelativePath } from "./schema-portability.js";
import { parseClawBotProfile } from "./schema.js";
import type { ClawDiagnostic, ClawManifest, ClawBotProfile } from "./types.js";

const MAX_PROFILE_BYTES = 256 * 1024;

function diagnostic(code: string, message: string, path = "$"): ClawDiagnostic {
  return { level: "error", code, phase: "parse", path, message };
}

function parseProfileYaml(
  raw: string,
  path: string,
): { ok: true; value: unknown } | { ok: false; diagnostics: ClawDiagnostic[] } {
  const document = parseDocument(raw.startsWith("\uFEFF") ? raw.slice(1) : raw, {
    prettyErrors: false,
    uniqueKeys: true,
  });
  if (document.errors.length > 0) {
    return {
      ok: false,
      diagnostics: document.errors.map((error) =>
        diagnostic("invalid_bot_profile", `Could not parse ${path}: ${error.message}`),
      ),
    };
  }
  let unsupportedFeature: string | undefined;
  visit(document, {
    Alias() {
      unsupportedFeature ??= "aliases";
    },
    Node(_key, node) {
      if (node.anchor) {
        unsupportedFeature ??= "anchors";
      } else if (node.tag) {
        unsupportedFeature ??= "explicit tags";
      }
    },
    Pair(_key, pair) {
      if (isScalar(pair.key) && pair.key.value === "<<") {
        unsupportedFeature ??= "merge keys";
      }
    },
  });
  if (unsupportedFeature) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "unsupported_bot_profile_yaml_feature",
          `${path} uses ${unsupportedFeature}; Bot profile YAML must map directly to JSON data.`,
        ),
      ],
    };
  }
  try {
    return { ok: true, value: document.toJSON() };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "invalid_bot_profile",
          `Could not parse ${path}: ${(error as Error).message}`,
        ),
      ],
    };
  }
}

async function readProfileFile(packageRoot: string, path: string): Promise<Buffer> {
  const packageFiles = await fsSafeRoot(packageRoot);
  const read = await packageFiles.read(path, {
    hardlinks: "reject",
    maxBytes: MAX_PROFILE_BYTES,
    nonBlockingRead: true,
    symlinks: "reject",
  });
  return read.buffer;
}

export async function readClawBotProfile(params: {
  packageRoot: string;
  manifest: ClawManifest;
}): Promise<
  | { ok: true; profile?: ClawBotProfile; raw?: Buffer; path?: string }
  | { ok: false; diagnostics: ClawDiagnostic[] }
> {
  const declaredPath = params.manifest.metadata?.["bot.config"];
  if (declaredPath === undefined) {
    return { ok: true };
  }
  if (
    declaredPath.includes("\\") ||
    !isSafeClawRelativePath(declaredPath) ||
    !/\.ya?ml$/i.test(declaredPath)
  ) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          "invalid_bot_profile_path",
          "metadata.bot.config must reference a forward-slash package-relative .yml or .yaml file.",
          "$.metadata.bot.config",
        ),
      ],
    };
  }

  let raw: Buffer;
  try {
    raw = await readProfileFile(params.packageRoot, declaredPath);
  } catch (error) {
    const unsafe =
      error instanceof FsSafeError &&
      (error.code === "hardlink" || error.code === "symlink" || error.code === "path-mismatch");
    const tooLarge = error instanceof FsSafeError && error.code === "too-large";
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          unsafe
            ? "bot_profile_unsafe"
            : tooLarge
              ? "bot_profile_too_large"
              : "bot_profile_read_failed",
          unsafe
            ? "The Bot profile must be a regular, non-symlinked, non-hardlinked file."
            : tooLarge
              ? `The Bot profile exceeds ${MAX_PROFILE_BYTES} bytes.`
              : `Could not read ${declaredPath}: ${(error as Error).message}`,
          "$.metadata.bot.config",
        ),
      ],
    };
  }

  const yaml = parseProfileYaml(raw.toString("utf8"), declaredPath);
  if (!yaml.ok) {
    return yaml;
  }
  const parsed = parseClawBotProfile(yaml.value);
  if (!parsed.ok) {
    return {
      ok: false,
      diagnostics: parsed.diagnostics.map((entry) => ({
        ...entry,
        path: `$.metadata.bot.config${entry.path.slice(1)}`,
      })),
    };
  }
  return { ok: true, profile: parsed.profile, raw, path: declaredPath };
}
