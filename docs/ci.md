---
title: CI Pipeline
description: How the HanzoBot CI pipeline works
summary: "CI job graph, scope gates, and local command equivalents"
read_when:
  - You need to understand why a CI job did or did not run
  - You are debugging failing GitHub Actions checks
---

# CI Pipeline

The CI runs on every push to `main` and every pull request. It uses smart scoping to skip expensive jobs when only docs or native code changed.

## Job Overview

| Job               | Purpose                                                 | When it runs                                      |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------- |
| `docs-scope`      | Detect docs-only changes                                | Always                                            |
| `changed-scope`   | Detect which areas changed (node/macos/android/windows) | Non-docs PRs                                      |
| `check`           | TypeScript types, lint, format                          | Push to `main`, or PRs with Node-relevant changes |
| `check-docs`      | Markdown lint + broken link check                       | Docs changed                                      |
| `code-analysis`   | LOC threshold check (1000 lines)                        | PRs only                                          |
| `secrets`         | Leaked secrets, workflow audit, dependency advisories   | Always                                            |
| `build-artifacts` | Build dist once, share with other jobs                  | Non-docs, node changes                            |
| `release-check`   | Validate npm pack contents                              | After build                                       |
| `checks`          | Node/Bun tests + protocol check                         | Non-docs, node changes                            |
| `checks-windows`  | Windows-specific tests                                  | Non-docs, windows-relevant changes                |
| `macos`           | Swift lint/build/test + TS tests                        | PRs with macos changes                            |
| `android`         | Gradle build + tests                                    | Non-docs, android changes                         |

## Fail-Fast Order

Jobs are ordered so cheap checks fail before expensive ones run:

1. `docs-scope` + `code-analysis` + `check` (parallel, ~1-2 min)
2. `build-artifacts` (blocked on above)
3. `checks`, `checks-windows`, `macos`, `android` (blocked on build)

Scope logic lives in `scripts/ci-changed-scope.mjs` and is covered by unit tests in `src/scripts/ci-changed-scope.test.ts`.

## Runners

| Runner                           | Jobs                                       |
| -------------------------------- | ------------------------------------------ |
| `blacksmith-16vcpu-ubuntu-2404`  | Most Linux jobs, including scope detection |
| `blacksmith-32vcpu-windows-2025` | `checks-windows`                           |
| `macos-latest`                   | `macos`, `ios`                             |

## Local Equivalents

```bash
pnpm check          # types + lint + format
pnpm test           # vitest tests
pnpm check:docs     # docs format + lint + broken links
pnpm release:check  # validate npm pack
pnpm audit --prod --audit-level=high   # the last step of `secrets`
```

## Accepted advisories

`secrets` ends with `pnpm audit --prod --audit-level=high`. Two advisories are
named in `pnpm.auditConfig.ignoreGhsas` because no published release fixes
either one. Naming them one at a time is what keeps the step worth reading: an
advisory that is not on this list still fails the job.

| Advisory              | Package                         | Why it is accepted                                                                                                                                                                                                          |
| --------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GHSA-jfgx-wxx8-mp94` | `@mariozechner/pi-coding-agent` | Every published version is in range, 0.50.0 through 0.73.1, so there is nothing to move to. 69 files import the agent engine. The tool directory it writes lives under `$HOME`, not a temp dir other accounts can reach.    |
| `GHSA-jmr9-qjv8-65gv` | `extract-zip`                   | Reached only from the tool installer above, which hands it a `.zip` on Windows; Linux and macOS take the `.tar.gz` branch and never call it. The archive comes over TLS from a fixed release URL, so its contents are ours. |

Reviewed 2026-08-16. Read both again when `@mariozechner/pi-coding-agent`
next moves: a release that fixes one should delete its row, not widen the table.

Everything else the audit reports is below `high` and does not gate. Raising a
package to its fixed version belongs in `pnpm.overrides`, pinned inside the
major the tree already resolves — `>=` there follows the newest publish across
major versions, which is how `linkify-it` and `fast-uri` each arrived a major
ahead of what imports them.
