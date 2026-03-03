import { html, nothing } from "lit";
import type {
  DevicePairingList,
  DeviceTokenSummary,
  PairedDevice,
  PendingDevice,
} from "../controllers/devices.ts";
import type { ExecApprovalsFile, ExecApprovalsSnapshot } from "../controllers/exec-approvals.ts";
import { formatRelativeTimestamp, formatList } from "../format.ts";
import { renderExecApprovals, resolveExecApprovalsState } from "./nodes-exec-approvals.ts";

const BILLING_URL = "https://billing.hanzo.ai";

export type NodesProps = {
  loading: boolean;
  nodes: Array<Record<string, unknown>>;
  devicesLoading: boolean;
  devicesError: string | null;
  devicesList: DevicePairingList | null;
  configForm: Record<string, unknown> | null;
  configLoading: boolean;
  configSaving: boolean;
  configDirty: boolean;
  configFormMode: "form" | "raw";
  execApprovalsLoading: boolean;
  execApprovalsSaving: boolean;
  execApprovalsDirty: boolean;
  execApprovalsSnapshot: ExecApprovalsSnapshot | null;
  execApprovalsForm: ExecApprovalsFile | null;
  execApprovalsSelectedAgent: string | null;
  execApprovalsTarget: "gateway" | "node";
  execApprovalsTargetNodeId: string | null;
  onRefresh: () => void;
  onDevicesRefresh: () => void;
  onDeviceApprove: (requestId: string) => void;
  onDeviceReject: (requestId: string) => void;
  onDeviceRotate: (deviceId: string, role: string, scopes?: string[]) => void;
  onDeviceRevoke: (deviceId: string, role: string) => void;
  onLoadConfig: () => void;
  onLoadExecApprovals: () => void;
  onBindDefault: (nodeId: string | null) => void;
  onBindAgent: (agentIndex: number, nodeId: string | null) => void;
  onSaveBindings: () => void;
  onExecApprovalsTargetChange: (kind: "gateway" | "node", nodeId: string | null) => void;
  onExecApprovalsSelectAgent: (agentId: string) => void;
  onExecApprovalsPatch: (path: Array<string | number>, value: unknown) => void;
  onExecApprovalsRemove: (path: Array<string | number>) => void;
  onSaveExecApprovals: () => void;
  onNodeBillingSet: (nodeId: string, billingMode: string, budgetCents?: number) => void;
};

export function renderNodes(props: NodesProps) {
  const bindingState = resolveBindingsState(props);
  const approvalsState = resolveExecApprovalsState(props);
  return html`
    ${renderConnectDevice()}
    ${renderNodeDashboards(props)}
    ${renderExecApprovals(approvalsState)}
    ${renderBindings(bindingState)}
    ${renderDevices(props)}
  `;
}

// ---------------------------------------------------------------------------
// Connect Device
// ---------------------------------------------------------------------------

function renderConnectDevice() {
  return html`
    <section class="card">
      <div class="card-title">Connect a Device</div>
      <div class="card-sub">Install Hanzo Bot on your machine to connect it as a node.</div>
      <div
        style="
          margin-top: 16px;
          display: grid;
          gap: 16px;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        "
      >
        <div
          style="
            padding: 14px;
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            background: var(--bg);
          "
        >
          <div style="font-weight: 600; font-size: 13px; margin-bottom: 8px">CLI (macOS / Linux)</div>
          <code
            style="
              display: block;
              padding: 8px 10px;
              background: var(--bg-content, var(--bg));
              border-radius: var(--radius-sm);
              font-size: 12px;
              color: var(--text-strong);
              user-select: all;
            "
            >npx @hanzo/bot</code
          >
          <div class="muted" style="font-size: 11px; margin-top: 6px">
            Installs and starts the bot agent. Auth via IAM on first run.
          </div>
        </div>
        <div
          style="
            padding: 14px;
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            background: var(--bg);
          "
        >
          <div style="font-weight: 600; font-size: 13px; margin-bottom: 8px">Desktop App (macOS)</div>
          <a
            href="https://hanzo.bot/download"
            target="_blank"
            rel="noreferrer"
            class="btn btn--outline btn--sm"
            style="display: inline-flex; align-items: center; gap: 6px"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" x2="12" y1="15" y2="3"></line>
            </svg>
            Download Bot.app
          </a>
          <div class="muted" style="font-size: 11px; margin-top: 6px">
            Native app with auto-updates. Auth via IAM on launch.
          </div>
        </div>
      </div>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// Per-node Dashboard Cards
// ---------------------------------------------------------------------------

function renderNodeDashboards(props: NodesProps) {
  if (props.nodes.length === 0) {
    return html`
      <section class="card">
        <div class="row" style="justify-content: space-between;">
          <div>
            <div class="card-title">Nodes</div>
            <div class="card-sub">Paired devices and live links.</div>
          </div>
          <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? "Loading\u2026" : "Refresh"}
          </button>
        </div>
        <div class="muted" style="margin-top: 16px;">No nodes found.</div>
      </section>
    `;
  }

  return html`
    <section>
      <div class="row" style="justify-content: space-between; margin-bottom: 12px;">
        <div>
          <div class="card-title" style="font-size: 16px;">Nodes</div>
          <div class="card-sub">Paired devices, billing, and live status.</div>
        </div>
        <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? "Loading\u2026" : "Refresh"}
        </button>
      </div>
      <div
        style="
          display: grid;
          gap: 16px;
          grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
        "
      >
        ${props.nodes.map((n) => renderNodeCard(n, props))}
      </div>
    </section>
  `;
}

function renderNodeCard(node: Record<string, unknown>, props: NodesProps) {
  const connected = Boolean(node.connected);
  const paired = Boolean(node.paired);
  const title =
    (typeof node.displayName === "string" && node.displayName.trim()) ||
    (typeof node.nodeId === "string" ? node.nodeId : "unknown");
  const nodeId = typeof node.nodeId === "string" ? node.nodeId : "";
  const caps = Array.isArray(node.caps) ? (node.caps as unknown[]) : [];
  const commands = Array.isArray(node.commands) ? (node.commands as unknown[]) : [];
  const billingMode = typeof node.billingMode === "string" ? node.billingMode : "global";
  const budgetCents = typeof node.dedicatedBudgetCents === "number" ? node.dedicatedBudgetCents : 0;
  const spentCents = typeof node.dedicatedSpentCents === "number" ? node.dedicatedSpentCents : 0;
  const remainingCents = Math.max(0, budgetCents - spentCents);

  const topUpUrl = nodeId ? `${BILLING_URL}?node=${encodeURIComponent(nodeId)}` : BILLING_URL;

  return html`
    <div class="card" style="padding: 16px;">
      <!-- Header: name + status -->
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div>
          <div style="font-weight: 600; font-size: 14px;">${title}</div>
          <div class="muted" style="font-size: 11px; margin-top: 2px;">
            ${nodeId}
            ${typeof node.remoteIp === "string" ? ` \u00b7 ${node.remoteIp}` : ""}
            ${typeof node.version === "string" ? ` \u00b7 v${node.version}` : ""}
          </div>
        </div>
        <span
          class="chip ${connected ? "chip-ok" : "chip-warn"}"
          style="font-size: 11px; padding: 2px 8px;"
        >
          ${connected ? "Running" : "Offline"}
        </span>
      </div>

      <!-- Billing section -->
      <div
        style="
          margin-top: 14px;
          padding: 12px;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          background: var(--bg);
        "
      >
        <div class="row" style="justify-content: space-between; align-items: center;">
          <div>
            <div class="muted" style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
              Credits Balance
            </div>
            <div style="font-size: 22px; font-weight: 700; margin-top: 2px;">
              ${
                billingMode === "dedicated"
                  ? `$${(remainingCents / 100).toFixed(2)}`
                  : billingMode === "local"
                    ? "Local"
                    : "Global"
              }
            </div>
            ${
              billingMode === "dedicated"
                ? html`<div class="muted" style="font-size: 11px; margin-top: 2px;">
                  $${(budgetCents / 100).toFixed(2)} budget \u00b7
                  $${(spentCents / 100).toFixed(2)} spent
                </div>`
                : billingMode === "local"
                  ? html`
                      <div class="muted" style="font-size: 11px; margin-top: 2px">Using local API keys</div>
                    `
                  : html`
                      <div class="muted" style="font-size: 11px; margin-top: 2px">Uses your account balance</div>
                    `
            }
          </div>
          ${
            billingMode !== "local"
              ? html`
                <a
                  href=${topUpUrl}
                  target="_blank"
                  rel="noreferrer"
                  class="btn primary btn--sm"
                  style="white-space: nowrap;"
                >
                  + Buy Credits
                </a>
              `
              : nothing
          }
        </div>

        <!-- Billing mode selector -->
        <div style="margin-top: 10px; border-top: 1px solid var(--border); padding-top: 10px;">
          <label class="field" style="margin: 0;">
            <span style="font-size: 11px;">Billing Mode</span>
            <select
              .value=${billingMode}
              style="font-size: 12px;"
              @change=${(e: Event) => {
                const val = (e.target as HTMLSelectElement).value;
                props.onNodeBillingSet(nodeId, val);
              }}
            >
              <option value="global" ?selected=${billingMode === "global"}>
                Global Balance
              </option>
              <option value="dedicated" ?selected=${billingMode === "dedicated"}>
                Dedicated Budget
              </option>
              <option value="local" ?selected=${billingMode === "local"}>
                Local Only
              </option>
            </select>
          </label>
        </div>
      </div>

      <!-- Capabilities -->
      ${
        caps.length > 0 || commands.length > 0
          ? html`
            <div class="chip-row" style="margin-top: 10px;">
              <span class="chip">${paired ? "paired" : "unpaired"}</span>
              ${caps.slice(0, 6).map((c) => html`<span class="chip">${String(c)}</span>`)}
              ${commands.slice(0, 4).map((c) => html`<span class="chip">${String(c)}</span>`)}
            </div>
          `
          : html`
            <div class="chip-row" style="margin-top: 10px;">
              <span class="chip">${paired ? "paired" : "unpaired"}</span>
            </div>
          `
      }
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

function renderDevices(props: NodesProps) {
  const list = props.devicesList ?? { pending: [], paired: [] };
  const pending = Array.isArray(list.pending) ? list.pending : [];
  const paired = Array.isArray(list.paired) ? list.paired : [];
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Devices</div>
          <div class="card-sub">Pairing requests + role tokens.</div>
        </div>
        <button class="btn" ?disabled=${props.devicesLoading} @click=${props.onDevicesRefresh}>
          ${props.devicesLoading ? "Loading\u2026" : "Refresh"}
        </button>
      </div>
      ${
        props.devicesError
          ? html`<div class="callout danger" style="margin-top: 12px;">${props.devicesError}</div>`
          : nothing
      }
      <div class="list" style="margin-top: 16px;">
        ${
          pending.length > 0
            ? html`
              <div class="muted" style="margin-bottom: 8px;">Pending</div>
              ${pending.map((req) => renderPendingDevice(req, props))}
            `
            : nothing
        }
        ${
          paired.length > 0
            ? html`
              <div class="muted" style="margin-top: 12px; margin-bottom: 8px;">Paired</div>
              ${paired.map((device) => renderPairedDevice(device, props))}
            `
            : nothing
        }
        ${
          pending.length === 0 && paired.length === 0
            ? html`
                <div class="muted">No paired devices.</div>
              `
            : nothing
        }
      </div>
    </section>
  `;
}

function renderPendingDevice(req: PendingDevice, props: NodesProps) {
  const name = req.displayName?.trim() || req.deviceId;
  const age = typeof req.ts === "number" ? formatRelativeTimestamp(req.ts) : "n/a";
  const role = req.role?.trim() ? `role: ${req.role}` : "role: -";
  const repair = req.isRepair ? " \u00b7 repair" : "";
  const ip = req.remoteIp ? ` \u00b7 ${req.remoteIp}` : "";
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${name}</div>
        <div class="list-sub">${req.deviceId}${ip}</div>
        <div class="muted" style="margin-top: 6px;">
          ${role} \u00b7 requested ${age}${repair}
        </div>
      </div>
      <div class="list-meta">
        <div class="row" style="justify-content: flex-end; gap: 8px; flex-wrap: wrap;">
          <button class="btn btn--sm primary" @click=${() => props.onDeviceApprove(req.requestId)}>
            Approve
          </button>
          <button class="btn btn--sm" @click=${() => props.onDeviceReject(req.requestId)}>
            Reject
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderPairedDevice(device: PairedDevice, props: NodesProps) {
  const name = device.displayName?.trim() || device.deviceId;
  const ip = device.remoteIp ? ` \u00b7 ${device.remoteIp}` : "";
  const roles = `roles: ${formatList(device.roles)}`;
  const scopes = `scopes: ${formatList(device.scopes)}`;
  const tokens = Array.isArray(device.tokens) ? device.tokens : [];
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${name}</div>
        <div class="list-sub">${device.deviceId}${ip}</div>
        <div class="muted" style="margin-top: 6px;">${roles} \u00b7 ${scopes}</div>
        ${
          tokens.length === 0
            ? html`
                <div class="muted" style="margin-top: 6px">Tokens: none</div>
              `
            : html`
              <div class="muted" style="margin-top: 10px;">Tokens</div>
              <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 6px;">
                ${tokens.map((token) => renderTokenRow(device.deviceId, token, props))}
              </div>
            `
        }
      </div>
    </div>
  `;
}

function renderTokenRow(deviceId: string, token: DeviceTokenSummary, props: NodesProps) {
  const status = token.revokedAtMs ? "revoked" : "active";
  const scopes = `scopes: ${formatList(token.scopes)}`;
  const when = formatRelativeTimestamp(
    token.rotatedAtMs ?? token.createdAtMs ?? token.lastUsedAtMs ?? null,
  );
  return html`
    <div class="row" style="justify-content: space-between; gap: 8px;">
      <div class="list-sub">${token.role} \u00b7 ${status} \u00b7 ${scopes} \u00b7 ${when}</div>
      <div class="row" style="justify-content: flex-end; gap: 6px; flex-wrap: wrap;">
        <button
          class="btn btn--sm"
          @click=${() => props.onDeviceRotate(deviceId, token.role, token.scopes)}
        >
          Rotate
        </button>
        ${
          token.revokedAtMs
            ? nothing
            : html`
              <button
                class="btn btn--sm danger"
                @click=${() => props.onDeviceRevoke(deviceId, token.role)}
              >
                Revoke
              </button>
            `
        }
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Exec Node Binding
// ---------------------------------------------------------------------------

type BindingAgent = {
  id: string;
  name: string | undefined;
  index: number;
  isDefault: boolean;
  binding: string | null;
};

type BindingNode = NodeTargetOption;

type BindingState = {
  ready: boolean;
  disabled: boolean;
  configDirty: boolean;
  configLoading: boolean;
  configSaving: boolean;
  defaultBinding?: string | null;
  agents: BindingAgent[];
  nodes: BindingNode[];
  onBindDefault: (nodeId: string | null) => void;
  onBindAgent: (agentIndex: number, nodeId: string | null) => void;
  onSave: () => void;
  onLoadConfig: () => void;
  formMode: "form" | "raw";
};

function resolveBindingsState(props: NodesProps): BindingState {
  const config = props.configForm;
  const nodes = resolveExecNodes(props.nodes);
  const { defaultBinding, agents } = resolveAgentBindings(config);
  const ready = Boolean(config);
  const disabled = props.configSaving || props.configFormMode === "raw";
  return {
    ready,
    disabled,
    configDirty: props.configDirty,
    configLoading: props.configLoading,
    configSaving: props.configSaving,
    defaultBinding,
    agents,
    nodes,
    onBindDefault: props.onBindDefault,
    onBindAgent: props.onBindAgent,
    onSave: props.onSaveBindings,
    onLoadConfig: props.onLoadConfig,
    formMode: props.configFormMode,
  };
}

function renderBindings(state: BindingState) {
  const supportsBinding = state.nodes.length > 0;
  const defaultValue = state.defaultBinding ?? "";
  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between; align-items: center;">
        <div>
          <div class="card-title">Exec node binding</div>
          <div class="card-sub">
            Pin agents to a specific node when using <span class="mono">exec host=node</span>.
          </div>
        </div>
        <button
          class="btn"
          ?disabled=${state.disabled || !state.configDirty}
          @click=${state.onSave}
        >
          ${state.configSaving ? "Saving\u2026" : "Save"}
        </button>
      </div>

      ${
        state.formMode === "raw"
          ? html`
              <div class="callout warn" style="margin-top: 12px">
                Switch the Config tab to <strong>Form</strong> mode to edit bindings here.
              </div>
            `
          : nothing
      }

      ${
        !state.ready
          ? html`<div class="row" style="margin-top: 12px; gap: 12px;">
            <div class="muted">Load config to edit bindings.</div>
            <button class="btn" ?disabled=${state.configLoading} @click=${state.onLoadConfig}>
              ${state.configLoading ? "Loading\u2026" : "Load config"}
            </button>
          </div>`
          : html`
            <div class="list" style="margin-top: 16px;">
              <div class="list-item">
                <div class="list-main">
                  <div class="list-title">Default binding</div>
                  <div class="list-sub">Used when agents do not override a node binding.</div>
                </div>
                <div class="list-meta">
                  <label class="field">
                    <span>Node</span>
                    <select
                      ?disabled=${state.disabled || !supportsBinding}
                      @change=${(event: Event) => {
                        const target = event.target as HTMLSelectElement;
                        const value = target.value.trim();
                        state.onBindDefault(value ? value : null);
                      }}
                    >
                      <option value="" ?selected=${defaultValue === ""}>Any node</option>
                      ${state.nodes.map(
                        (node) =>
                          html`<option
                            value=${node.id}
                            ?selected=${defaultValue === node.id}
                          >
                            ${node.label}
                          </option>`,
                      )}
                    </select>
                  </label>
                  ${
                    !supportsBinding
                      ? html`
                          <div class="muted">No nodes with system.run available.</div>
                        `
                      : nothing
                  }
                </div>
              </div>

              ${
                state.agents.length === 0
                  ? html`
                      <div class="muted">No agents found.</div>
                    `
                  : state.agents.map((agent) => renderAgentBinding(agent, state))
              }
            </div>
          `
      }
    </section>
  `;
}

function renderAgentBinding(agent: BindingAgent, state: BindingState) {
  const bindingValue = agent.binding ?? "__default__";
  const label = agent.name?.trim() ? `${agent.name} (${agent.id})` : agent.id;
  const supportsBinding = state.nodes.length > 0;
  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${label}</div>
        <div class="list-sub">
          ${agent.isDefault ? "default agent" : "agent"} \u00b7
          ${
            bindingValue === "__default__"
              ? `uses default (${state.defaultBinding ?? "any"})`
              : `override: ${agent.binding}`
          }
        </div>
      </div>
      <div class="list-meta">
        <label class="field">
          <span>Binding</span>
          <select
            ?disabled=${state.disabled || !supportsBinding}
            @change=${(event: Event) => {
              const target = event.target as HTMLSelectElement;
              const value = target.value.trim();
              state.onBindAgent(agent.index, value === "__default__" ? null : value);
            }}
          >
            <option value="__default__" ?selected=${bindingValue === "__default__"}>
              Use default
            </option>
            ${state.nodes.map(
              (node) =>
                html`<option
                  value=${node.id}
                  ?selected=${bindingValue === node.id}
                >
                  ${node.label}
                </option>`,
            )}
          </select>
        </label>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveExecNodes(nodes: Array<Record<string, unknown>>): BindingNode[] {
  const list: BindingNode[] = [];
  for (const node of nodes) {
    const commands = Array.isArray(node.commands) ? node.commands : [];
    const supports = commands.some((cmd) => String(cmd) === "system.run");
    if (!supports) {
      continue;
    }
    const nodeId = typeof node.nodeId === "string" ? node.nodeId.trim() : "";
    if (!nodeId) {
      continue;
    }
    const displayName =
      typeof node.nodeId === "string" &&
      node.displayName &&
      typeof node.displayName === "string" &&
      node.displayName.trim()
        ? node.displayName.trim()
        : nodeId;
    list.push({
      id: nodeId,
      label: displayName === nodeId ? nodeId : `${displayName} \u00b7 ${nodeId}`,
    });
  }
  list.sort((a, b) => a.label.localeCompare(b.label));
  return list;
}

function resolveAgentBindings(config: Record<string, unknown> | null): {
  defaultBinding?: string | null;
  agents: BindingAgent[];
} {
  const fallbackAgent: BindingAgent = {
    id: "main",
    name: undefined,
    index: 0,
    isDefault: true,
    binding: null,
  };
  if (!config || typeof config !== "object") {
    return { defaultBinding: null, agents: [fallbackAgent] };
  }
  const tools = (config.tools ?? {}) as Record<string, unknown>;
  const exec = (tools.exec ?? {}) as Record<string, unknown>;
  const defaultBinding =
    typeof exec.node === "string" && exec.node.trim() ? exec.node.trim() : null;

  const agentsNode = (config.agents ?? {}) as Record<string, unknown>;
  if (!Array.isArray(agentsNode.list) || agentsNode.list.length === 0) {
    return { defaultBinding, agents: [fallbackAgent] };
  }

  const agents = resolveConfigAgents(config).map((entry) => {
    const toolsEntry = (entry.record.tools ?? {}) as Record<string, unknown>;
    const execEntry = (toolsEntry.exec ?? {}) as Record<string, unknown>;
    const binding =
      typeof execEntry.node === "string" && execEntry.node.trim() ? execEntry.node.trim() : null;
    return {
      id: entry.id,
      name: entry.name,
      index: entry.index,
      isDefault: entry.isDefault,
      binding,
    };
  });

  if (agents.length === 0) {
    agents.push(fallbackAgent);
  }

  return { defaultBinding, agents };
}
