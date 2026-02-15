---
summary: "Gateway parity checklist for migrating from Bot Gateway to Hanzo Node runtime"
read_when:
  - Porting gateway capabilities into Hanzo Node
  - Tracking migration parity and cutover readiness
title: "Hanzo Node Gateway Parity Checklist"
---

# Hanzo Node Gateway parity checklist

Source of truth for method/event names:

- `src/gateway/server-methods-list.ts`
- `src/gateway/server-methods.ts` (role + scope rules)

This checklist tracks parity for moving the current Gateway runtime into `hanzod` while keeping the Bot UI and channel behavior equivalent.

## Protocol and auth parity

- [ ] Keep WS frame compatibility with existing clients (`request`, `response`, `event`)
- [ ] Keep `connect.challenge` event semantics
- [ ] Keep roles: `operator` and `node`
- [ ] Keep scopes: `operator.admin`, `operator.read`, `operator.write`, `operator.approvals`, `operator.pairing`
- [ ] Keep device token flow and pairing approval workflow
- [ ] Keep auth modes for local/remote (token/password)

## Connectivity, Auth, and Status

- [ ] `health`
- [ ] `status`
- [ ] `logs.tail`
- [ ] `usage.status`
- [ ] `usage.cost`
- [ ] `system-presence`
- [ ] `system-event`

## Gateway Config, Wizard, and Update

- [ ] `config.get`
- [ ] `config.set`
- [ ] `config.apply`
- [ ] `config.patch`
- [ ] `config.schema`
- [ ] `wizard.start`
- [ ] `wizard.next`
- [ ] `wizard.cancel`
- [ ] `wizard.status`
- [ ] `update.run`

## Agent, Team, and Identity

- [ ] `agent`
- [ ] `agent.wait`
- [ ] `agent.identity.get`
- [ ] `agent.identity.full`
- [ ] `agent.did.get`
- [ ] `agent.did.create`
- [ ] `agent.wallet.get`
- [ ] `agent.wallet.create`
- [ ] `agents.list`
- [ ] `agents.create`
- [ ] `agents.update`
- [ ] `agents.delete`
- [ ] `agents.files.list`
- [ ] `agents.files.get`
- [ ] `agents.files.set`
- [ ] `team.presets.list`
- [ ] `team.presets.get`
- [ ] `team.provision`
- [ ] `team.provision.all`

## Chat, Send, Channels

- [ ] `chat.history`
- [ ] `chat.send`
- [ ] `chat.abort`
- [ ] `send`
- [ ] `channels.status`
- [ ] `channels.logout`

## Sessions, Heartbeats, and Cron

- [ ] `sessions.list`
- [ ] `sessions.preview`
- [ ] `sessions.patch`
- [ ] `sessions.reset`
- [ ] `sessions.delete`
- [ ] `sessions.compact`
- [ ] `last-heartbeat`
- [ ] `set-heartbeats`
- [ ] `wake`
- [ ] `cron.list`
- [ ] `cron.status`
- [ ] `cron.add`
- [ ] `cron.update`
- [ ] `cron.remove`
- [ ] `cron.run`
- [ ] `cron.runs`

## Models, Voice, and TTS

- [ ] `models.list`
- [ ] `talk.mode`
- [ ] `voicewake.get`
- [ ] `voicewake.set`
- [ ] `tts.status`
- [ ] `tts.providers`
- [ ] `tts.enable`
- [ ] `tts.disable`
- [ ] `tts.convert`
- [ ] `tts.setProvider`

## Node, Device Pairing, and Invocations

- [ ] `node.pair.request`
- [ ] `node.pair.list`
- [ ] `node.pair.approve`
- [ ] `node.pair.reject`
- [ ] `node.pair.verify`
- [ ] `device.pair.list`
- [ ] `device.pair.approve`
- [ ] `device.pair.reject`
- [ ] `device.token.rotate`
- [ ] `device.token.revoke`
- [ ] `node.rename`
- [ ] `node.list`
- [ ] `node.describe`
- [ ] `node.invoke`
- [ ] `node.invoke.result`
- [ ] `node.event`

## Exec Approvals

- [ ] `exec.approvals.get`
- [ ] `exec.approvals.set`
- [ ] `exec.approvals.node.get`
- [ ] `exec.approvals.node.set`
- [ ] `exec.approval.request`
- [ ] `exec.approval.resolve`

## Skills and Browser

- [ ] `skills.status`
- [ ] `skills.bins`
- [ ] `skills.install`
- [ ] `skills.update`
- [ ] `browser.request`

## Gateway event parity

- [ ] `connect.challenge`
- [ ] `agent`
- [ ] `chat`
- [ ] `presence`
- [ ] `tick`
- [ ] `talk.mode`
- [ ] `shutdown`
- [ ] `health`
- [ ] `heartbeat`
- [ ] `cron`
- [ ] `node.pair.requested`
- [ ] `node.pair.resolved`
- [ ] `node.invoke.request`
- [ ] `device.pair.requested`
- [ ] `device.pair.resolved`
- [ ] `voicewake.changed`
- [ ] `exec.approval.requested`
- [ ] `exec.approval.resolved`

## Dynamic channel and plugin parity

- [ ] Load plugin-provided gateway methods from channel plugins (same behavior as `listChannelPlugins().flatMap(plugin.gatewayMethods)`)
- [ ] Keep all built-in channel adapters at feature parity (WhatsApp, Telegram, Discord, Slack, Signal, iMessage, web, and others)
- [ ] Keep extension channel parity (Matrix, Teams, Zalo, Zalo Personal, voice-call, and any installed plugin channels)

## Service and operations parity

- [ ] Local mode: start/stop/restart as background service on host OS
- [ ] Remote mode: connect to remote runtime via tunnel/tailnet
- [ ] Preserve `gateway status`, `health`, logs, and doctor workflows
- [ ] Preserve config file compatibility during transition

## Cutover gates

- [ ] All RPC methods and events above implemented in `hanzod`
- [ ] Existing UI clients can connect without protocol changes
- [ ] Existing CLI calls pass parity tests against `hanzod`
- [ ] Channel E2E smoke tests pass on `hanzod` runtime
- [ ] Remote + local operator flows validated
