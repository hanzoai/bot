import type { GatewayBrowserClient } from "../gateway.ts";

export type NodesState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  nodesLoading: boolean;
  nodes: Array<Record<string, unknown>>;
  lastError: string | null;
};

export type NodeBillingSetParams = {
  nodeId: string;
  billingMode: "global" | "dedicated" | "local";
  budgetCents?: number;
};

export async function setNodeBilling(
  state: NodesState,
  params: NodeBillingSetParams,
): Promise<void> {
  if (!state.client || !state.connected) {
    return;
  }
  await state.client.request("node.billing.set", params);
  // Reload nodes to reflect the change.
  await loadNodes(state, { quiet: true });
}

export async function loadNodes(state: NodesState, opts?: { quiet?: boolean }) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.nodesLoading) {
    return;
  }
  state.nodesLoading = true;
  if (!opts?.quiet) {
    state.lastError = null;
  }
  try {
    const res = await state.client.request<{ nodes?: Record<string, unknown> }>("node.list", {});
    state.nodes = Array.isArray(res.nodes) ? res.nodes : [];
  } catch (err) {
    if (!opts?.quiet) {
      state.lastError = String(err);
    }
  } finally {
    state.nodesLoading = false;
  }
}
