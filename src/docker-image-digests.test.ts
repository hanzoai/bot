import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

// Dockerfile.sandbox is NOT here, and Dockerfile.sandbox-browser no longer
// exists. The rename that gave the sandbox recipe its right name moved the
// 910-line ARG-based file into `Dockerfile.sandbox` and deleted the two small
// digest-pinned ones that used to wear those names. This list checks a LITERAL
// `FROM image@sha256:…` on the first line, which that recipe cannot have — its
// bases arrive as `ARG UV_IMAGE=…`, so its first FROM reads `FROM ${UV_IMAGE}`.
// The property still holds for it; it is proven by the dedicated tests below,
// which follow the ARG to the value it resolves to.
const DIGEST_PINNED_DOCKERFILES = [
  "Dockerfile",
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

  it("pins Dockerfile.sandbox's third-party bases by digest, ARG-declared or not", async () => {
    // Dockerfile.sandbox cannot join the list above: its bases arrive through
    // `ARG NODE_BASE=…` / `ARG UV_IMAGE=…` so its first FROM line reads
    // `FROM ${UV_IMAGE} AS uvsrc`, which is not a literal image reference. The
    // property still has to hold — this is the image that runs untrusted code,
    // and a floating tag means two builds of one commit are two different
    // images while the lane pushes on pull_request.
    const dockerfile = await readFile(resolve(repoRoot, "Dockerfile.sandbox"), "utf8");
    const args = [...dockerfile.matchAll(/^ARG\s+(\w+)=(\S+)$/gm)].map(([, name, value]) => ({
      name,
      value,
    }));

    const bases = args.filter(({ name }) => /_(BASE|IMAGE)$/.test(name));
    expect(bases.length, "Dockerfile.sandbox should declare its bases as ARGs").toBeGreaterThan(0);

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

  it("pins every hand-fetched tarball in Dockerfile.sandbox by sha256", async () => {
    // The file's own rule: a tarball is verified before anything is unpacked.
    // It held for node/go/bun/deno/zig and had to keep holding when the three
    // Hanzo binaries joined them — a GitHub release asset can be replaced under
    // a tag that never moves, which is the one way a "pinned" version lies.
    const dockerfile = await readFile(resolve(repoRoot, "Dockerfile.sandbox"), "utf8");
    const sums = [...dockerfile.matchAll(/^ARG\s+(\w*_SHA256\w*)=(\S+)$/gm)];
    expect(sums.length, "Dockerfile.sandbox should pin its tarballs by checksum").toBeGreaterThan(0);
    for (const [, name, value] of sums) {
      expect(value, `ARG ${name} must be a sha256`).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("gives the sandbox image a version of its own, in one place", async () => {
    // The tag and the image's contents come from ONE file. Inheriting bot's
    // package.json is what let `2026.6.7-desktop` be republished from source two
    // months newer than the number, so the number now belongs to the image.
    const version = (await readFile(resolve(repoRoot, "docker/sandbox.version"), "utf8")).trim();
    expect(version, "docker/sandbox.version must be a bare semver").toMatch(/^\d+\.\d+\.\d+$/);

    const hanzoYml = parse(await readFile(resolve(repoRoot, "hanzo.yml"), "utf8")) as {
      version?: string;
    };
    expect(hanzoYml.version, "hanzo.yml must derive the image version from that file").toContain(
      "docker/sandbox.version",
    );

    const dockerfile = await readFile(resolve(repoRoot, "Dockerfile.sandbox"), "utf8");
    expect(dockerfile, "Dockerfile.sandbox must stamp the version into the image it tags").toContain(
      "COPY docker/sandbox.version /etc/sandbox-version",
    );
  });

  it("builds every stage hanzo.yml selects, under its own tag", async () => {
    // The lane and the recipe agree, or they fail apart SILENTLY. hanzoai/ci
    // passes `args.STAGE` to `FROM ${STAGE} AS final` and tags the result with
    // `tag-suffix`; nothing checks that the two words are the same word, and
    // nothing checks that the stage exists. A typo in either place publishes a
    // real image under a name that means something else — `admin` built from
    // `desktop`, or a `STAGE` BuildKit resolves to nothing at all.
    //
    // It matters most for `admin`, which is the one tag no caller can ask for:
    // hanzoai/cloud substitutes it in for one identity, so a wrong image here
    // reaches exactly the person with the fewest reasons to double-check it.
    const dockerfile = await readFile(resolve(repoRoot, "Dockerfile.sandbox"), "utf8");
    const stages = new Set(
      [...dockerfile.matchAll(/^FROM\s+\S+\s+AS\s+(\w+)$/gm)].map(([, s]) => s),
    );

    const hanzoYml = parse(await readFile(resolve(repoRoot, "hanzo.yml"), "utf8")) as {
      images?: { name?: string; dockerfile?: string; "tag-suffix"?: string; args?: { STAGE?: string } }[];
    };
    const box = (hanzoYml.images ?? []).filter((i) => i.dockerfile === "Dockerfile.sandbox");
    expect(box.length, "hanzo.yml should publish the box image").toBeGreaterThan(0);

    for (const image of box) {
      const stage = image.args?.STAGE;
      expect(stage, `${image.name} must select a stage`).toBeDefined();
      expect(stages.has(stage as string), `STAGE ${stage} is not a stage in Dockerfile.sandbox`).toBe(
        true,
      );
      expect(image["tag-suffix"], `${image.name} must publish the stage it builds`).toBe(stage);
    }

    // The operator's box is published, or the substitution in hanzoai/cloud
    // resolves to a tag nothing ever pushed and a SuperAdmin's `dev` sandbox is
    // an ImagePullBackOff.
    expect(
      box.map((i) => i.args?.STAGE),
      "the admin image has a consumer (cloud apps/sandbox/runtime.go imageFor)",
    ).toContain("admin");
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
