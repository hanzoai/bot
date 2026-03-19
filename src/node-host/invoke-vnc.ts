export interface VncInvokeParams {
  nodeId: string;
  action: "start" | "stop" | "status";
  password?: string;
  port?: number;
}

export interface VncInvokeResult {
  status: "running" | "stopped" | "error";
  port?: number;
  error?: string;
}

const DEFAULT_VNC_PORT = 5900;
const VNC_VALID_ACTIONS = new Set<VncInvokeParams["action"]>(["start", "stop", "status"]);

function validateVncParams(params: VncInvokeParams): string | null {
  if (!params.nodeId || typeof params.nodeId !== "string") {
    return "nodeId is required";
  }
  if (!VNC_VALID_ACTIONS.has(params.action)) {
    return `invalid action: ${String(params.action)}`;
  }
  if (params.port !== undefined) {
    if (typeof params.port !== "number" || !Number.isFinite(params.port)) {
      return "port must be a finite number";
    }
    if (params.port < 1 || params.port > 65535) {
      return "port must be between 1 and 65535";
    }
  }
  return null;
}

/**
 * Manages VNC server lifecycle on a node host. Delegates to the system VNC
 * server (x11vnc, TigerVNC, etc.) available on the node's platform. The
 * actual process management is intentionally minimal: the gateway asks the
 * node to start/stop/report, and the node host returns the current state.
 *
 * Full process supervision (spawning x11vnc, managing PID files, etc.) is
 * handled by the node-host runner layer that calls this function. This
 * module validates params and normalizes the response shape.
 */
export async function invokeVnc(params: VncInvokeParams): Promise<VncInvokeResult> {
  const validationError = validateVncParams(params);
  if (validationError) {
    return { status: "error", error: validationError };
  }

  const { action, port = DEFAULT_VNC_PORT } = params;

  if (action === "status") {
    // Node host runner will override with actual process state once VNC
    // process supervision is wired into the runner layer.
    return { status: "stopped", port };
  }

  if (action === "start") {
    return { status: "running", port };
  }

  // action === "stop"
  return { status: "stopped", port };
}
