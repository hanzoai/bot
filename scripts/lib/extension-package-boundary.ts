// Extension Package Boundary script supports Bot repository automation.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, posix, resolve } from "node:path";
import { privateLocalOnlyPluginSdkEntrypoints } from "./plugin-sdk-entries.mjs";

export const EXTENSION_PACKAGE_BOUNDARY_INCLUDE = ["./*.ts", "./src/**/*.ts"] as const;
export const EXTENSION_PACKAGE_BOUNDARY_EXCLUDE = [
  "./**/*.test.ts",
  "./dist/**",
  "./node_modules/**",
  "./src/test-support/**",
  "./src/**/*test-helpers.ts",
  "./src/**/*test-harness.ts",
  "./src/**/*test-support.ts",
] as const;

const privateLocalOnlyPluginSdkPackageDtsPaths = Object.fromEntries(
  privateLocalOnlyPluginSdkEntrypoints.map((entrypoint) => [
    `bot/plugin-sdk/${entrypoint}`,
    [`../packages/plugin-sdk/dist/src/plugin-sdk/${entrypoint}.d.ts`],
  ]),
) as Record<string, readonly string[]>;

function buildPackageBoundaryDtsPaths(params: {
  packageName: string;
  packageDir: string;
}): Record<string, readonly string[]> {
  const packageJson = JSON.parse(
    readFileSync(join("packages", params.packageDir, "package.json"), "utf8"),
  ) as { exports?: Record<string, unknown> };
  return Object.fromEntries(
    Object.entries(packageJson.exports ?? {}).flatMap(([exportKey, value]) => {
      const subpath =
        exportKey === "." ? "" : exportKey.startsWith("./") ? exportKey.slice(2) : null;
      const importPath =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>).import
          : value;
      if (subpath === null || subpath.includes("..") || typeof importPath !== "string") {
        return [];
      }
      if (!importPath.startsWith("./dist/") || !importPath.endsWith(".mjs")) {
        return [];
      }
      const specifier = subpath ? `${params.packageName}/${subpath}` : params.packageName;
      return [
        [
          specifier,
          [`../dist/plugin-sdk/packages/${params.packageDir}/src/${subpath || "index"}.d.ts`],
        ],
      ];
    }),
  );
}

export const EXTENSION_PACKAGE_BOUNDARY_BASE_PATHS = {
  "bot/plugin-sdk/*": ["../dist/plugin-sdk/*.d.ts"],
  ...privateLocalOnlyPluginSdkPackageDtsPaths,
  "bot/plugin-sdk/account-id": ["../dist/plugin-sdk/account-id.d.ts"],
  "bot/plugin-sdk/channel-entry-contract": ["../dist/plugin-sdk/channel-entry-contract.d.ts"],
  "bot/plugin-sdk/browser-maintenance": [
    "../packages/plugin-sdk/dist/extensions/browser/browser-maintenance.d.ts",
  ],
  "bot/plugin-sdk/channel-secret-basic-runtime": [
    "../dist/plugin-sdk/channel-secret-basic-runtime.d.ts",
  ],
  "bot/plugin-sdk/channel-secret-runtime": ["../dist/plugin-sdk/channel-secret-runtime.d.ts"],
  "bot/plugin-sdk/channel-streaming": ["../dist/plugin-sdk/channel-streaming.d.ts"],
  "bot/plugin-sdk/error-runtime": ["../dist/plugin-sdk/error-runtime.d.ts"],
  "bot/plugin-sdk/secret-ref-runtime": ["../dist/plugin-sdk/secret-ref-runtime.d.ts"],
  "bot/plugin-sdk/ssrf-runtime": ["../dist/plugin-sdk/ssrf-runtime.d.ts"],
  "@hanzo/bot-qa-channel/api.js": ["../dist/plugin-sdk/extensions/qa-channel/api.d.ts"],
  "@hanzo/bot-matrix/test-api.js": ["../dist/plugin-sdk/extensions/matrix/test-api.d.ts"],
  "@hanzo/bot-discord/api.js": ["../dist/plugin-sdk/extensions/discord/api.d.ts"],
  "@hanzo/bot-slack/api.js": ["../dist/plugin-sdk/extensions/slack/api.d.ts"],
  "@hanzo/bot-telegram/api.js": ["../dist/plugin-sdk/extensions/telegram/api.d.ts"],
  "@hanzo/bot-whatsapp/api.js": ["../dist/plugin-sdk/extensions/whatsapp/api.d.ts"],
  "@hanzo/bot-ai": ["../dist/plugin-sdk/packages/ai/src/index.d.ts"],
  "@hanzo/bot-ai/diagnostics": ["../dist/plugin-sdk/packages/ai/src/utils/diagnostics.d.ts"],
  "@hanzo/bot-ai/event-stream": ["../dist/plugin-sdk/packages/ai/src/utils/event-stream.d.ts"],
  "@hanzo/bot-ai/providers": ["../dist/plugin-sdk/packages/ai/src/providers.d.ts"],
  "@hanzo/bot-ai/transports": ["../dist/plugin-sdk/packages/ai/src/transports.d.ts"],
  "@hanzo/bot-ai/types": ["../dist/plugin-sdk/packages/ai/src/types.d.ts"],
  "@hanzo/bot-ai/validation": ["../dist/plugin-sdk/packages/ai/src/validation.d.ts"],
  "@hanzo/bot-ai/internal/anthropic": ["../dist/plugin-sdk/packages/ai/src/internal/anthropic.d.ts"],
  "@hanzo/bot-ai/internal/openai": ["../dist/plugin-sdk/packages/ai/src/internal/openai.d.ts"],
  "@hanzo/bot-ai/internal/retry-after": [
    "../dist/plugin-sdk/packages/ai/src/internal/retry-after.d.ts",
  ],
  "@hanzo/bot-ai/internal/runtime": ["../dist/plugin-sdk/packages/ai/src/internal/runtime.d.ts"],
  "@hanzo/bot-ai/internal/shared": ["../dist/plugin-sdk/packages/ai/src/internal/shared.d.ts"],
  "@hanzo/bot-llm-core": ["../dist/plugin-sdk/packages/llm-core/src/index.d.ts"],
  "@hanzo/bot-llm-core/diagnostics": [
    "../dist/plugin-sdk/packages/llm-core/src/utils/diagnostics.d.ts",
  ],
  "@hanzo/bot-llm-core/event-stream": [
    "../dist/plugin-sdk/packages/llm-core/src/utils/event-stream.d.ts",
  ],
  "@hanzo/bot-llm-core/types": ["../dist/plugin-sdk/packages/llm-core/src/types.d.ts"],
  "@hanzo/bot-llm-core/validation": ["../dist/plugin-sdk/packages/llm-core/src/validation.d.ts"],
  "@hanzo/bot-llm-core/*": ["../dist/plugin-sdk/packages/llm-core/src/*.d.ts"],
  "@hanzo/bot-model-catalog-core": ["../dist/plugin-sdk/packages/model-catalog-core/src/index.d.ts"],
  "@hanzo/bot-model-catalog-core/configured-model-refs": [
    "../dist/plugin-sdk/packages/model-catalog-core/src/configured-model-refs.d.ts",
  ],
  "@hanzo/bot-model-catalog-core/model-catalog-refs": [
    "../dist/plugin-sdk/packages/model-catalog-core/src/model-catalog-refs.d.ts",
  ],
  "@hanzo/bot-model-catalog-core/model-catalog-normalize": [
    "../dist/plugin-sdk/packages/model-catalog-core/src/model-catalog-normalize.d.ts",
  ],
  "@hanzo/bot-model-catalog-core/model-catalog-types": [
    "../dist/plugin-sdk/packages/model-catalog-core/src/model-catalog-types.d.ts",
  ],
  "@hanzo/bot-model-catalog-core/provider-id": [
    "../dist/plugin-sdk/packages/model-catalog-core/src/provider-id.d.ts",
  ],
  "@hanzo/bot-model-catalog-core/provider-model-id-normalization": [
    "../dist/plugin-sdk/packages/model-catalog-core/src/provider-model-id-normalization.d.ts",
  ],
  "@hanzo/bot-model-catalog-core/provider-model-id-normalize": [
    "../dist/plugin-sdk/packages/model-catalog-core/src/provider-model-id-normalize.d.ts",
  ],
  "@hanzo/bot-model-catalog-core/*": ["../dist/plugin-sdk/packages/model-catalog-core/src/*.d.ts"],
  "@hanzo/bot-markdown-core": ["../dist/plugin-sdk/packages/markdown-core/src/index.d.ts"],
  "@hanzo/bot-markdown-core/code-spans": [
    "../dist/plugin-sdk/packages/markdown-core/src/code-spans.d.ts",
  ],
  "@hanzo/bot-markdown-core/fences": ["../dist/plugin-sdk/packages/markdown-core/src/fences.d.ts"],
  "@hanzo/bot-markdown-core/frontmatter": [
    "../dist/plugin-sdk/packages/markdown-core/src/frontmatter.d.ts",
  ],
  "@hanzo/bot-markdown-core/ir": ["../dist/plugin-sdk/packages/markdown-core/src/ir.d.ts"],
  "@hanzo/bot-markdown-core/render": ["../dist/plugin-sdk/packages/markdown-core/src/render.d.ts"],
  "@hanzo/bot-markdown-core/render-aware-chunking": [
    "../dist/plugin-sdk/packages/markdown-core/src/render-aware-chunking.d.ts",
  ],
  "@hanzo/bot-markdown-core/tables": ["../dist/plugin-sdk/packages/markdown-core/src/tables.d.ts"],
  "@hanzo/bot-markdown-core/types": ["../dist/plugin-sdk/packages/markdown-core/src/types.d.ts"],
  "@hanzo/bot-markdown-core/*": ["../dist/plugin-sdk/packages/markdown-core/src/*.d.ts"],
  "@hanzo/bot-media-generation-core": [
    "../dist/plugin-sdk/packages/media-generation-core/src/index.d.ts",
  ],
  "@hanzo/bot-media-generation-core/capability-model-ref": [
    "../dist/plugin-sdk/packages/media-generation-core/src/capability-model-ref.d.ts",
  ],
  "@hanzo/bot-media-generation-core/catalog": [
    "../dist/plugin-sdk/packages/media-generation-core/src/catalog.d.ts",
  ],
  "@hanzo/bot-media-generation-core/model-ref": [
    "../dist/plugin-sdk/packages/media-generation-core/src/model-ref.d.ts",
  ],
  "@hanzo/bot-media-generation-core/normalization": [
    "../dist/plugin-sdk/packages/media-generation-core/src/normalization.d.ts",
  ],
  "@hanzo/bot-media-generation-core/*": [
    "../dist/plugin-sdk/packages/media-generation-core/src/*.d.ts",
  ],
  "@hanzo/bot-media-core": ["../dist/plugin-sdk/packages/media-core/src/index.d.ts"],
  "@hanzo/bot-media-core/base64": ["../dist/plugin-sdk/packages/media-core/src/base64.d.ts"],
  "@hanzo/bot-media-core/constants": ["../dist/plugin-sdk/packages/media-core/src/constants.d.ts"],
  "@hanzo/bot-media-core/content-length": [
    "../dist/plugin-sdk/packages/media-core/src/content-length.d.ts",
  ],
  "@hanzo/bot-media-core/file-name": ["../dist/plugin-sdk/packages/media-core/src/file-name.d.ts"],
  "@hanzo/bot-media-core/inbound-path-policy": [
    "../dist/plugin-sdk/packages/media-core/src/inbound-path-policy.d.ts",
  ],
  "@hanzo/bot-media-core/inline-image-data-url": [
    "../dist/plugin-sdk/packages/media-core/src/inline-image-data-url.d.ts",
  ],
  "@hanzo/bot-media-core/media-source-url": [
    "../dist/plugin-sdk/packages/media-core/src/media-source-url.d.ts",
  ],
  "@hanzo/bot-media-core/mime": ["../dist/plugin-sdk/packages/media-core/src/mime.d.ts"],
  "@hanzo/bot-media-core/read-byte-stream-with-limit": [
    "../dist/plugin-sdk/packages/media-core/src/read-byte-stream-with-limit.d.ts",
  ],
  "@hanzo/bot-media-core/*": ["../dist/plugin-sdk/packages/media-core/src/*.d.ts"],
  "@hanzo/bot-normalization-core/record-coerce": [
    "../dist/plugin-sdk/packages/normalization-core/src/record-coerce.d.ts",
  ],
  "@hanzo/bot-normalization-core/string-coerce": [
    "../dist/plugin-sdk/packages/normalization-core/src/string-coerce.d.ts",
  ],
  "@hanzo/bot-normalization-core/*": ["../dist/plugin-sdk/packages/normalization-core/src/*.d.ts"],
  "@hanzo/bot-retry": ["../dist/plugin-sdk/packages/retry/src/index.d.ts"],
  "@hanzo/bot-workboard-contract": ["../packages/workboard-contract/src/index.ts"],
  ...buildPackageBoundaryDtsPaths({
    packageName: "@hanzo/bot-acp-core",
    packageDir: "acp-core",
  }),
  "@hanzo/bot-acp-core/*": ["../dist/plugin-sdk/packages/acp-core/src/*.d.ts"],
  "@hanzo/bot-terminal-core": ["../dist/plugin-sdk/packages/terminal-core/src/index.d.ts"],
  "@hanzo/bot-terminal-core/ansi": ["../dist/plugin-sdk/packages/terminal-core/src/ansi.d.ts"],
  "@hanzo/bot-terminal-core/decorative-emoji": [
    "../dist/plugin-sdk/packages/terminal-core/src/decorative-emoji.d.ts",
  ],
  "@hanzo/bot-terminal-core/health-style": [
    "../dist/plugin-sdk/packages/terminal-core/src/health-style.d.ts",
  ],
  "@hanzo/bot-terminal-core/links": ["../dist/plugin-sdk/packages/terminal-core/src/links.d.ts"],
  "@hanzo/bot-terminal-core/note": ["../dist/plugin-sdk/packages/terminal-core/src/note.d.ts"],
  "@hanzo/bot-terminal-core/osc-progress": [
    "../dist/plugin-sdk/packages/terminal-core/src/osc-progress.d.ts",
  ],
  "@hanzo/bot-terminal-core/palette": ["../dist/plugin-sdk/packages/terminal-core/src/palette.d.ts"],
  "@hanzo/bot-terminal-core/progress-line": [
    "../dist/plugin-sdk/packages/terminal-core/src/progress-line.d.ts",
  ],
  "@hanzo/bot-terminal-core/prompt-select-styled": [
    "../dist/plugin-sdk/packages/terminal-core/src/prompt-select-styled.d.ts",
  ],
  "@hanzo/bot-terminal-core/prompt-select-styled-params": [
    "../dist/plugin-sdk/packages/terminal-core/src/prompt-select-styled-params.d.ts",
  ],
  "@hanzo/bot-terminal-core/prompt-style": [
    "../dist/plugin-sdk/packages/terminal-core/src/prompt-style.d.ts",
  ],
  "@hanzo/bot-terminal-core/restore": ["../dist/plugin-sdk/packages/terminal-core/src/restore.d.ts"],
  "@hanzo/bot-terminal-core/safe-text": [
    "../dist/plugin-sdk/packages/terminal-core/src/safe-text.d.ts",
  ],
  "@hanzo/bot-terminal-core/stream-writer": [
    "../dist/plugin-sdk/packages/terminal-core/src/stream-writer.d.ts",
  ],
  "@hanzo/bot-terminal-core/table": ["../dist/plugin-sdk/packages/terminal-core/src/table.d.ts"],
  "@hanzo/bot-terminal-core/terminal-link": [
    "../dist/plugin-sdk/packages/terminal-core/src/terminal-link.d.ts",
  ],
  "@hanzo/bot-terminal-core/theme": ["../dist/plugin-sdk/packages/terminal-core/src/theme.d.ts"],
  "@hanzo/bot-terminal-core/*": ["../dist/plugin-sdk/packages/terminal-core/src/*.d.ts"],
  "@hanzo/bot-*.js": ["../packages/plugin-sdk/dist/extensions/*.d.ts", "../extensions/*"],
  "@hanzo/bot-*": ["../packages/plugin-sdk/dist/extensions/*", "../extensions/*"],
  "bot/plugin-sdk/qa-channel": ["../dist/plugin-sdk/src/plugin-sdk/qa-channel.d.ts"],
  "bot/plugin-sdk/qa-channel-protocol": [
    "../dist/plugin-sdk/src/plugin-sdk/qa-channel-protocol.d.ts",
  ],
  "bot/plugin-sdk/qa-runtime": ["../dist/plugin-sdk/src/plugin-sdk/qa-runtime.d.ts"],
  "@hanzo/bot-plugin-sdk/*": ["../dist/plugin-sdk/*.d.ts"],
} as const;

function prefixExtensionPackageBoundaryPaths(
  paths: Record<string, readonly string[]>,
  prefix: string,
): Record<string, readonly string[]> {
  return Object.fromEntries(
    Object.entries(paths).map(([key, values]) => [
      key,
      values.map((value) => posix.join(prefix, value)),
    ]),
  );
}

function omitExtensionPackageBoundaryPaths(
  paths: Record<string, readonly string[]>,
  omittedKeys: readonly string[],
): Record<string, readonly string[]> {
  const omitted = new Set(omittedKeys);
  return Object.fromEntries(Object.entries(paths).filter(([key]) => !omitted.has(key)));
}

export const EXTENSION_PACKAGE_BOUNDARY_XAI_PATHS = {
  ...prefixExtensionPackageBoundaryPaths(
    omitExtensionPackageBoundaryPaths(EXTENSION_PACKAGE_BOUNDARY_BASE_PATHS, [
      "bot/plugin-sdk/channel-secret-basic-runtime",
      "bot/plugin-sdk/channel-secret-tts-runtime",
      "@hanzo/bot-matrix/test-api.js",
      "@hanzo/bot-discord/api.js",
      "@hanzo/bot-slack/api.js",
      "@hanzo/bot-telegram/api.js",
      "@hanzo/bot-whatsapp/api.js",
    ]),
    "../",
  ),
  "bot/plugin-sdk/channel-entry-contract": [
    "../../dist/plugin-sdk/channel-entry-contract.d.ts",
  ],
  "bot/plugin-sdk/browser-maintenance": [
    "../../dist/plugin-sdk/src/plugin-sdk/browser-maintenance.d.ts",
  ],
  "@hanzo/bot-qa-channel/api.js": ["../../dist/plugin-sdk/extensions/qa-channel/api.d.ts"],
  "@hanzo/bot-*.js": ["../../packages/plugin-sdk/dist/extensions/*.d.ts", "../*"],
  "@hanzo/bot-*": ["../*"],
  "@hanzo/bot-plugin-sdk/*": ["../../dist/plugin-sdk/*.d.ts"],
  "@hanzo/bot-anthropic-vertex/api.js": ["./.boundary-stubs/anthropic-vertex-api.d.ts"],
  "@hanzo/bot-ollama/api.js": ["./.boundary-stubs/ollama-api.d.ts"],
  "@hanzo/bot-ollama/runtime-api.js": ["./.boundary-stubs/ollama-runtime-api.d.ts"],
  "@hanzo/bot-speech-core/runtime-api.js": ["./.boundary-stubs/speech-core-runtime-api.d.ts"],
} as const;

type ExtensionPackageBoundaryTsConfigJson = {
  extends?: unknown;
  compilerOptions?: {
    rootDir?: unknown;
    paths?: unknown;
  };
  include?: unknown;
  exclude?: unknown;
};

type ExtensionPackageBoundaryPackageJson = {
  devDependencies?: Record<string, string>;
};

function readJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function collectBundledExtensionIds(rootDir = resolve(".")): string[] {
  return readdirSync(join(rootDir, "extensions"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
}

function resolveExtensionTsconfigPath(extensionId: string, rootDir = resolve(".")): string {
  return join(rootDir, "extensions", extensionId, "tsconfig.json");
}

function resolveExtensionPackageJsonPath(extensionId: string, rootDir = resolve(".")): string {
  return join(rootDir, "extensions", extensionId, "package.json");
}

export function readExtensionPackageBoundaryTsconfig(
  extensionId: string,
  rootDir = resolve("."),
): ExtensionPackageBoundaryTsConfigJson {
  return readJsonFile(
    resolveExtensionTsconfigPath(extensionId, rootDir),
  ) as ExtensionPackageBoundaryTsConfigJson;
}

export function readExtensionPackageBoundaryPackageJson(
  extensionId: string,
  rootDir = resolve("."),
): ExtensionPackageBoundaryPackageJson {
  return readJsonFile(
    resolveExtensionPackageJsonPath(extensionId, rootDir),
  ) as ExtensionPackageBoundaryPackageJson;
}

export function isOptInExtensionPackageBoundaryTsconfig(
  tsconfig: ExtensionPackageBoundaryTsConfigJson,
): boolean {
  return tsconfig.extends === "../tsconfig.package-boundary.base.json";
}

export function collectExtensionsWithTsconfig(rootDir = resolve(".")): string[] {
  return collectBundledExtensionIds(rootDir).filter((extensionId) =>
    existsSync(resolveExtensionTsconfigPath(extensionId, rootDir)),
  );
}

export function collectOptInExtensionPackageBoundaries(rootDir = resolve(".")): string[] {
  return collectExtensionsWithTsconfig(rootDir).filter((extensionId) =>
    isOptInExtensionPackageBoundaryTsconfig(
      readExtensionPackageBoundaryTsconfig(extensionId, rootDir),
    ),
  );
}
