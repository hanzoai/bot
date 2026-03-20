/**
 * Workspace connection manager for the Hanzo Team AI bot protocol.
 *
 * Tracks which workspaces have connected to this bot instance.
 * In-memory only — workspace connections are re-established on restart
 * by the Team app calling POST /connect.
 */

export type WorkspaceConnection = {
  workspaceId: string;
  connectedAt: number;
  metadata?: Record<string, unknown>;
};

const workspaces = new Map<string, WorkspaceConnection>();

export function connectWorkspace(
  workspaceId: string,
  metadata?: Record<string, unknown>,
): WorkspaceConnection {
  const connection: WorkspaceConnection = {
    workspaceId,
    connectedAt: Date.now(),
    metadata,
  };
  workspaces.set(workspaceId, connection);
  return connection;
}

export function getWorkspace(workspaceId: string): WorkspaceConnection | undefined {
  return workspaces.get(workspaceId);
}

export function disconnectWorkspace(workspaceId: string): boolean {
  return workspaces.delete(workspaceId);
}

export function listWorkspaces(): WorkspaceConnection[] {
  return Array.from(workspaces.values());
}
