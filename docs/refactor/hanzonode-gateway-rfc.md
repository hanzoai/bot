---
summary: "RFC to make Hanzo Node the runtime and gateway while keeping Bot UI and channels fully functional"
read_when:
  - Planning Hanzo Node as the single runtime for local and remote bot operation
  - Integrating desktop and mobile clients with gateway and node capabilities
title: "Hanzo Node Gateway RFC"
---

# Hanzo Node Gateway RFC

## Decision

Adopt a node-first architecture where `hanzod` is the single runtime for:

- gateway RPC and events,
- channel routing and delivery,
- session and auth state,
- node capability invocation,
- approvals and policy enforcement.

The Bot desktop app becomes a first-class client and local capability host, not the primary runtime itself.

## Feasibility

Feasible, and aligns with the current direction already present in this repo:

- Operator and node roles already exist in the gateway protocol.
- Local and remote operation models already exist.
- Node invocation and approval mechanisms already exist.

This is an implementation migration, not a product redefinition.

## Target architecture

## Runtime (`hanzod`)

`hanzod` owns the control plane and data plane:

- WebSocket RPC + event protocol compatibility.
- Session store, identity, and auth tokens.
- Channel adapters (core + plugin channels).
- Node registry and `node.invoke` dispatch.
- Approval engine (including privileged actions).

## Desktop app

Desktop app is both:

- Operator UI (chat, dashboard, status, config), and
- Optional local node host for OS capabilities (automation, notifications, accessibility, camera, mic, screen, etc).

The app can run in two modes:

- Local mode: ensure `hanzod` service is up, attach as operator and optional node.
- Remote mode: attach to remote `hanzod` over SSH/tailnet.

## Cloud and hybrid execution

Model inference can run in cloud while privileged actions stay local:

- Cloud side: orchestration, model calls, multi-agent scheduling.
- Local side (`hanzod` + desktop node): permissioned OS and device actions.

This preserves security boundaries while enabling cloud-scale reasoning.

## Mobile path

Same protocol supports mobile clients later:

- Mobile as operator-only client,
- Mobile as node-capability client,
- Or dual-role client.

Feasible for automation support, with platform limits:

- Android automation is generally more permissive.
- iOS automation is constrained by platform policy and available APIs.

## Compatibility requirements

`hanzod` must preserve:

- existing method and event names,
- role and scope enforcement,
- channel behavior and plugin method loading,
- config semantics for local and remote modes,
- operator flows used by desktop, web, and CLI clients.

Use `/refactor/hanzonode-gateway-parity` as the executable checklist.

## Migration phases

## Phase 0: Protocol freeze

- Freeze current RPC/event surface and auth semantics.
- Generate fixture suite from current gateway method/event contracts.

Exit criteria:

- Contract tests green against current runtime.

## Phase 1: `hanzod` core skeleton

- Implement WS server, auth handshake, roles/scopes, and health/status methods.
- Add compatibility test harness against frozen fixtures.

Exit criteria:

- Basic client connect + auth + status parity.

## Phase 2: Stateful control plane

- Port config, sessions, agents, cron, usage, wizard, and identity/team methods.
- Port event broadcaster semantics.

Exit criteria:

- Control UI and CLI can operate on `hanzod` for non-channel workflows.

## Phase 3: Node and approvals

- Port node registry, pair/device token lifecycle, invoke workflow, and approvals.
- Wire desktop app as operator and node-capability host.

Exit criteria:

- End-to-end privileged action path works with approval policy.

## Phase 4: Channel adapters

- Port built-in channels and plugin channel method plumbing.
- Keep routing and allowlist behavior unchanged.

Exit criteria:

- Channel E2E smoke tests pass.

## Phase 5: Desktop default runtime

- Desktop app boots/attaches to `hanzod` by default.
- Local background service and remote attach both supported.

Exit criteria:

- Desktop app no longer depends on legacy gateway runtime.

## Phase 6: Decommission legacy gateway runtime

- Keep compatibility bridge until release confidence is high.
- Remove legacy runtime only after parity gates pass.

Exit criteria:

- Full production cutover with rollback path removed.

## Risks and mitigations

- Risk: protocol drift breaks existing clients.
  - Mitigation: fixture-based compatibility tests from current method/event surface.
- Risk: channel regressions.
  - Mitigation: per-channel parity matrix and smoke suite before cutover.
- Risk: permissions UX mismatch on desktop.
  - Mitigation: keep approvals and permission prompts in desktop UI while runtime moves to `hanzod`.
- Risk: mixed local/remote confusion.
  - Mitigation: strict mode model (`local` vs `remote`) and explicit runtime target in UI.

## Immediate work package

1. Build and enforce the parity checklist (`/refactor/hanzonode-gateway-parity`).
2. Stand up `hanzod` protocol shell with role/scope/auth compatibility.
3. Integrate desktop app with `hanzod` local attach and remote attach.
4. Port node invoke + approval path first (highest product leverage).
5. Port channels next, starting with highest-volume production channels.

## Definition of done

`hanzod` is the only runtime required for:

- Bot UI chat/dashboard,
- channel ingress/egress,
- node-capability invocation with approvals,
- local and remote operator access,
- cloud-hybrid execution where cloud handles reasoning and local node handles privileged execution.
