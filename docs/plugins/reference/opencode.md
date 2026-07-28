---
summary: "Adds OpenCode model provider support to Bot."
read_when:
  - You are installing, configuring, or auditing the opencode plugin
title: "OpenCode plugin"
---

# OpenCode plugin

Adds OpenCode model provider support to Bot.

## Distribution

- Package: `@hanzo/bot-opencode-provider`
- Install route: included in Bot

## Surface

providers: `opencode`; contracts: `mediaUnderstandingProviders`

<!-- bot-plugin-reference:manual-start -->

## Native sessions

Bot auto-detects the `opencode` CLI on the Gateway and paired nodes. Stored
sessions then appear in the **OpenCode** sessions-sidebar group, with transcript
browsing through the official `opencode --pure db ... --format json` and
`opencode --pure export` commands. Local rows also offer **Continue**, which
creates an Bot session whose first turn resumes the native OpenCode session
through ACP. OpenCode retains the full server-side model context, and the catalog
viewer continues to show that history. Bot also imports the recent native
history into the adopted session transcript. Very long transcripts import only
their most recent 200 items using a 512 KiB serialized-item budget. Paired-node
rows remain view-only.

The restricted environment and `--pure` mode prevent catalog browsing from
loading project plugins or inheriting unrelated Gateway credentials.

Turn **OpenCode Session Catalog** off under **Config > Plugins > OpenCode** to
disable discovery. It is enabled by default.

<!-- bot-plugin-reference:manual-end -->

## Related docs

- [opencode](/providers/opencode)
