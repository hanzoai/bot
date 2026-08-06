import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

const DIGEST_PINNED_DOCKERFILES = [
  "Dockerfile",
  "Dockerfile.sandbox",
  "Dockerfile.sandbox-browser",
  "scripts/docker/cleanup-smoke/Dockerfile",
  "scripts/docker/install-sh-e2e/Dockerfile",
  "scripts/docker/install-sh-nonroot/Dockerfile",
  "scripts/docker/install-sh-smoke/Dockerfile",
  "scripts/e2e/Dockerfile",
  "scripts/e2e/Dockerfile.qr-import",
] as const;

type DependabotDockerGroup = {
  patterns?: string[];
};

type DependabotUpdate = {
  "package-ecosystem"?: string;
  directory?: string;
  schedule?: { interval?: string };
  groups?: Record<string, DependabotDockerGroup>;
};

type DependabotConfig = {
  updates?: DependabotUpdate[];
};

describe("docker base image pinning", () => {
  it("pins selected Dockerfile FROM lines to immutable sha256 digests", async () => {
    for (const dockerfilePath of DIGEST_PINNED_DOCKERFILES) {
      const dockerfile = await readFile(resolve(repoRoot, dockerfilePath), "utf8");
      const fromLine = dockerfile
        .split(/\r?\n/)
        .find((line) => line.trimStart().startsWith("FROM "));
      expect(fromLine, `${dockerfilePath} should define a FROM line`).toBeDefined();
      expect(fromLine, `${dockerfilePath} FROM must be digest-pinned`).toMatch(
        /^FROM\s+\S+@sha256:[a-f0-9]{64}$/,
      );
    }
  });

  it("pins Dockerfile.box's third-party bases by digest, ARG-declared or not", async () => {
    // Dockerfile.box cannot join the list above: its bases arrive through
    // `ARG NODE_BASE=…` / `ARG UV_IMAGE=…` so its first FROM line reads
    // `FROM ${UV_IMAGE} AS uvsrc`, which is not a literal image reference. The
    // property still has to hold — this is the image that runs untrusted code,
    // and a floating tag means two builds of one commit are two different
    // images while the lane pushes on pull_request.
    const dockerfile = await readFile(resolve(repoRoot, "Dockerfile.box"), "utf8");
    const args = [...dockerfile.matchAll(/^ARG\s+(\w+)=(\S+)$/gm)].map(([, name, value]) => ({
      name,
      value,
    }));

    const bases = args.filter(({ name }) => /_(BASE|IMAGE)$/.test(name));
    expect(bases.length, "Dockerfile.box should declare its bases as ARGs").toBeGreaterThan(0);

    for (const { name, value } of bases) {
      // CLOUD_IMAGE is OURS and versioned by us: it moves every time the
      // apps/sandbox wire moves, so a reviewed `v` tag is the unit, not a
      // digest nobody can read. Everything third-party is immutable or nothing.
      if (name === "CLOUD_IMAGE") {
        expect(value, `${name} must name an explicit version`).toMatch(/:v\d+\.\d+\.\d+$/);
        continue;
      }
      expect(value, `ARG ${name} must be digest-pinned`).toMatch(/@sha256:[a-f0-9]{64}$/);
    }

    // Every FROM either names a stage built here or an ARG resolved above.
    // A bare `FROM debian:bookworm-slim` would slip past the ARG check entirely.
    const stages = new Set(
      [...dockerfile.matchAll(/^FROM\s+\S+\s+AS\s+(\w+)$/gm)].map(([, s]) => s),
    );
    for (const [, ref] of dockerfile.matchAll(/^FROM\s+(\S+)/gm)) {
      const bare = ref.replace(/^\$\{(\w+)\}$/, "$1");
      expect(
        stages.has(bare) || args.some((a) => a.name === bare),
        `FROM ${ref} is neither a stage in this file nor an ARG declared in it`,
      ).toBe(true);
    }
  });

  it("keeps Dependabot Docker updates enabled for root Dockerfiles", async () => {
    const raw = await readFile(resolve(repoRoot, ".github/dependabot.yml"), "utf8");
    const config = parse(raw) as DependabotConfig;
    const dockerUpdate = config.updates?.find(
      (update) => update["package-ecosystem"] === "docker" && update.directory === "/",
    );

    expect(dockerUpdate).toBeDefined();
    expect(dockerUpdate?.schedule?.interval).toBe("weekly");
    expect(dockerUpdate?.groups?.["docker-images"]?.patterns).toContain("*");
  });
});
