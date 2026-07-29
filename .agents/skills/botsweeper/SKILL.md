---
name: botsweeper
description: "Use for all BotSweeper work: Bot issue/PR sweep reports, commit-review reports, repair jobs, cloud fix PRs, @botsweeper maintainer mention commands, trusted BotSweeper-reviewed autofix/automerge, GitHub Actions monitoring, permissions, gates, and manual backfills."
---

# BotSweeper

BotSweeper lives at `~/Projects/botsweeper`. It is the one Bot
maintenance bot for sweeping, commit review, repair jobs, and guarded fix PRs.
Use this skill whenever asked about reports, findings, dispatch health,
repair/cloud PR creation, comment commands, automerge, permissions, or gates.

## Start

```bash
cd ~/Projects/botsweeper
git status --short --branch
git pull --ff-only
pnpm run build:all
```

Do not overwrite unrelated edits. If the tree is dirty, inspect first and keep
read-only report work read-only unless the requester asked to commit.

## One Bot, One App

Use the BotSweeper repo and the `botsweeper` GitHub App. Use only
`CLAWSWEEPER_*` configuration for this automation. Do not use legacy apps,
variables, labels, or skills.

Required app setup:

- `CLAWSWEEPER_APP_CLIENT_ID`: public app client ID for `botsweeper`.
- `CLAWSWEEPER_APP_PRIVATE_KEY`: private key used only inside
  `actions/create-github-app-token` steps.
- Target app permissions: read target scan context; write issues and pull
  requests; contents write for report commits, repair branches, and workflow
  inputs; Actions write on `bot/botsweeper` for comment-router
  re-review dispatch, workflow dispatch, run cancellation, and self-heal;
  optional Checks write for commit Check Runs.

Token boundary:

- Codex workers do not get mutation credentials.
- Review workers run with stripped secret/token env.
- Deterministic scripts own comments, labels, branch pushes, PR creation,
  closes, and merges through short-lived GitHub App tokens.
- Merge and write gates default closed.

## Commit Reports

Canonical commit reports:

```text
records/<repo-slug>/commits/<40-char-sha>.md
```

Use the lister:

```bash
pnpm commit-reports -- --since 6h
pnpm commit-reports -- --since "24 hours ago" --findings
pnpm commit-reports -- --since 7d --non-clean
pnpm commit-reports -- --repo hanzoai/bot --author steipete --since 7d
pnpm commit-reports -- --since 24h --json
```

Results: `nothing_found`, `findings`, `inconclusive`, `failed`,
`skipped_non_code`. One report per SHA; reruns overwrite the SHA-named report.

Manual rerun/backfill:

```bash
gh workflow run commit-review.yml --repo bot/botsweeper \
  -f target_repo=hanzoai/bot \
  -f commit_sha=<end-sha> \
  -f before_sha=<start-or-parent-sha> \
  -f create_checks=false \
  -f enabled=true
```

Use `create_checks=true` only when the requester explicitly wants target commit Check
Runs. Add `-f additional_prompt="..."` for focused one-off review instructions.

## Sweep Reports

Issue/PR reports live at:

```text
records/<repo-slug>/items/<number>.md
records/<repo-slug>/closed/<number>.md
```

Lead with counts, concrete findings, and report links. Do not post unsolicited
GitHub comments from report-reading work. Public surfaces are markdown reports,
durable BotSweeper review comments, and optional checks.

PR reports include Codex `/review`-style `reviewFindings` with priority,
confidence, repository-relative file, and line range. Public PR comments show a
short `Review findings:` list when findings exist; full review comments,
evidence links, likely owners, and runtime details stay inside the collapsed
`Review details` block.

Useful commands:

```bash
pnpm run status
pnpm run audit
pnpm run reconcile
pnpm run apply-decisions -- --dry-run
```

## Create One Repair Job

Create a job from issue/PR refs and a maintainer prompt:

```bash
pnpm run repair:create-job -- \
  --repo hanzoai/bot \
  --refs 123,456 \
  --prompt-file /tmp/botsweeper-prompt.md
```

Create from an existing BotSweeper report:

```bash
pnpm run repair:create-job -- \
  --from-report ../botsweeper/records/bot-bot/items/123.md
```

The job creator checks for an existing open PR, body match, or remote
`botsweeper/<cluster-id>` branch before writing another job. Use `--dry-run`
to inspect. Use `--force` only after deciding the duplicate guard is stale.

Validate, commit, then dispatch:

```bash
pnpm run repair:validate-job -- jobs/bot/inbox/botsweeper-bot-bot-123.md
pnpm run repair:dispatch -- jobs/bot/inbox/botsweeper-bot-bot-123.md \
  --mode autonomous \
  --runner blacksmith-4vcpu-ubuntu-2404 \
  --execution-runner blacksmith-16vcpu-ubuntu-2404 \
  --model gpt-5.6-sol
```

Do not dispatch a just-created job before the job file is committed and pushed;
the workflow reads the job path from GitHub.

## Replacement PRs

For a useful but uneditable/stale/unsafe source PR, make the maintainer prompt
explicit:

```md
Treat #123 as useful source work. If the source branch cannot be safely updated
because it is uneditable, stale, draft-only, unmergeable, or unsafe, create a
narrow BotSweeper replacement PR instead of waiting. Preserve the source PR
author as co-author, credit the source PR in the replacement PR body, and close
only that source PR after the replacement PR is opened.
```

The worker should emit `repair_strategy=replace_uneditable_branch` and list the
source PR URL in `source_prs`. The deterministic executor opens or updates
`botsweeper/<cluster-id>`, adds non-bot source authors as `Co-authored-by`
trailers, and closes superseded source PRs only after replacement exists.

## Gates

Open execution windows intentionally and close them after the run:

```bash
gh variable set CLAWSWEEPER_ALLOW_EXECUTE --repo bot/botsweeper --body 1
gh variable set CLAWSWEEPER_ALLOW_FIX_PR --repo bot/botsweeper --body 1
gh variable set CLAWSWEEPER_ALLOW_MERGE --repo bot/botsweeper --body 1
gh variable set CLAWSWEEPER_ALLOW_AUTOMERGE --repo bot/botsweeper --body 1
```

Reset gates only when explicitly requested; the active maintainer window may intentionally
leave them at `1`.

Important gates:

- `CLAWSWEEPER_ALLOW_EXECUTE`: allows deterministic write lanes.
- `CLAWSWEEPER_ALLOW_FIX_PR`: allows branch repair/replacement PRs.
- `CLAWSWEEPER_ALLOW_MERGE`: allows merge-capable applicators.
- `CLAWSWEEPER_ALLOW_AUTOMERGE`: allows comment-router automerge.
- `CLAWSWEEPER_COMMENT_ROUTER_EXECUTE`: lets scheduled comment routing
  post replies and dispatch repair.

## Maintainer Mentions

Prefer `@botsweeper` comments for all maintainer-facing control. Slash
commands still parse as compatibility aliases, but examples and live guidance
should use mentions.

```text
@botsweeper status
@botsweeper re-review
@botsweeper review
@botsweeper fix ci
@botsweeper address review
@botsweeper rebase
@botsweeper autofix
@botsweeper automerge
@botsweeper approve
@botsweeper explain
@botsweeper stop
@botsweeper <question or safe action request>
@botsweeper[bot] re-review
@bot-botsweeper fix ci
@bot-botsweeper[bot] fix ci
```

Accepted aliases: `review`, `re-review`, `rereview`, `review again`,
`rerun review`, and `run review`. `review` and `re-review` dispatch a fresh
BotSweeper issue/PR review without starting repair. `fix ci`,
`address review`, and `rebase` dispatch the
repair worker only for BotSweeper PRs or PRs opted into
`botsweeper:autofix` or `botsweeper:automerge`. `autofix` runs the bounded
review/fix loop without merging. `automerge` runs the bounded review/fix/merge
loop, but draft PRs stay fix-only until GitHub marks them ready for review.

Freeform maintainer mentions such as `@botsweeper why did automerge stop?`
or `@botsweeper: can you explain this failure?` dispatch a read-only assist
review with the mention text as one-off instructions. The answer lands in the
next public BotSweeper review comment. Action-looking prose does not directly
mutate GitHub; it must map to existing structured recommendations and pass the
normal deterministic gates.

Default accepted maintainers: `OWNER`, `MEMBER`, `COLLABORATOR`; fallback
repository permission accepts `admin`, `maintain`, or `write`. Contributor
comments are ignored without a reply.

Run router manually:

```bash
pnpm run repair:comment-router -- --repo hanzoai/bot --lookback-minutes 180
pnpm run repair:comment-router -- --repo hanzoai/bot --execute --wait-for-capacity
```

Scheduled routing stays dry unless
`CLAWSWEEPER_COMMENT_ROUTER_EXECUTE=1`.

## Trusted Autofix And Automerge

`@botsweeper autofix` opts an existing PR into the bounded review/fix loop.
`@botsweeper automerge` opts an existing PR into the bounded review/fix/merge
loop. The router:

- verifies maintainer authorization;
- labels the PR `botsweeper:autofix` or `botsweeper:automerge`;
- dispatches BotSweeper review for the current head SHA;
- creates or reuses a durable adopted job;
- repairs at most the configured caps;
- never merges autofix PRs or draft PRs;
- merges automerge PRs only when BotSweeper passed the exact current head,
  checks are green, GitHub says mergeable, no human-review label is present,
  the PR is not draft, and both merge gates are open.

Missing changelog is not a review finding or merge blocker. If repairing a user-facing change, add/update changelog automatically when practical; never ask or block solely on it.

If BotSweeper passes while merge gates are closed, it labels
`botsweeper:merge-ready` and comments instead of merging. `@botsweeper stop`
adds `botsweeper:human-review`.

When asked to create a PR and enable BotSweeper automerge, do not
leave the local Bot checkout on the PR branch. After the PR is created,
pushed, and the `@botsweeper automerge` request is posted or otherwise
confirmed, return the local checkout to `main` and fast-forward it when the
working tree is clean:

```bash
git switch main
git pull --ff-only
```

If unrelated local edits or an in-progress rebase prevent switching, report the
blocker instead of stashing, deleting, or overwriting work.

Repair caps:

```bash
CLAWSWEEPER_MAX_REPAIRS_PER_PR=10
CLAWSWEEPER_MAX_REPAIRS_PER_HEAD=1
```

## Security Boundary

Do not stage unapproved security-sensitive work for BotSweeper Repair. Route
vulnerability reports, CVE/GHSA/advisory work, leaked secrets/tokens/keys,
plaintext secret storage, SSRF, XSS, CSRF, RCE, auth bypass, privilege
escalation, and sensitive data exposure to central Bot security handling.

For PRs explicitly opted into `botsweeper:autofix` or
`botsweeper:automerge`, security-sensitive review findings may dispatch
bounded repair, but merge remains blocked until a later exact-head review is
clean and the normal merge gates pass. Trust deterministic BotSweeper security
markers, labels, and job frontmatter; do not infer security handling from vague
prose.

## Monitoring

Receiver workflows:

```bash
gh run list --repo bot/botsweeper --workflow "BotSweeper Commit Review" \
  --limit 12 --json databaseId,displayTitle,event,status,conclusion,createdAt,updatedAt,url
gh run list --repo bot/botsweeper --workflow "repair cluster worker" \
  --limit 12 --json databaseId,displayTitle,event,status,conclusion,createdAt,updatedAt,url
gh run list --repo bot/botsweeper --workflow "repair comment router" \
  --limit 12 --json databaseId,displayTitle,event,status,conclusion,createdAt,updatedAt,url
```

Target dispatcher:

```bash
gh run list --repo hanzoai/bot --workflow "BotSweeper Dispatch" \
  --event push --limit 8 --json databaseId,displayTitle,event,status,conclusion,headSha,url
```

Target commit check:

```bash
gh api "repos/hanzoai/bot/commits/<sha>/check-runs?per_page=100" \
  --jq '.check_runs[] | select(.name=="BotSweeper Commit Review") | [.status,.conclusion,.details_url] | @tsv'
```

## Reading Output

For findings or failures, summarize:

- target repo, item/PR/commit, run, report path
- result, confidence, severity, and exact blocker
- affected files or cluster refs
- validation commands and whether they passed
- whether mutation gates were open or closed
- next deterministic action

Keep the broom small: one cluster, one branch, one PR, narrow proof, clear
owner-visible evidence.
