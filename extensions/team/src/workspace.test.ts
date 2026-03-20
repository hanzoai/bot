import { describe, it, expect, beforeEach } from "vitest";
import {
  connectWorkspace,
  getWorkspace,
  disconnectWorkspace,
  listWorkspaces,
} from "./workspace.js";

describe("workspace connection manager", () => {
  beforeEach(() => {
    // Clear all existing connections by disconnecting known ones
    for (const ws of listWorkspaces()) {
      disconnectWorkspace(ws.workspaceId);
    }
  });

  it("connects a workspace and retrieves it", () => {
    const conn = connectWorkspace("ws-1");
    expect(conn.workspaceId).toBe("ws-1");
    expect(typeof conn.connectedAt).toBe("number");

    const retrieved = getWorkspace("ws-1");
    expect(retrieved).toBeDefined();
    expect(retrieved?.workspaceId).toBe("ws-1");
  });

  it("stores metadata on connect", () => {
    connectWorkspace("ws-2", { name: "Test Workspace" });
    const retrieved = getWorkspace("ws-2");
    expect(retrieved?.metadata).toEqual({ name: "Test Workspace" });
  });

  it("overwrites on reconnect", () => {
    connectWorkspace("ws-3", { version: 1 });
    const first = getWorkspace("ws-3")!;
    connectWorkspace("ws-3", { version: 2 });
    const second = getWorkspace("ws-3")!;
    expect(second.metadata).toEqual({ version: 2 });
    expect(second.connectedAt).toBeGreaterThanOrEqual(first.connectedAt);
  });

  it("disconnects a workspace", () => {
    connectWorkspace("ws-4");
    expect(getWorkspace("ws-4")).toBeDefined();
    const removed = disconnectWorkspace("ws-4");
    expect(removed).toBe(true);
    expect(getWorkspace("ws-4")).toBeUndefined();
  });

  it("returns false disconnecting unknown workspace", () => {
    expect(disconnectWorkspace("unknown")).toBe(false);
  });

  it("lists all connected workspaces", () => {
    connectWorkspace("ws-a");
    connectWorkspace("ws-b");
    const all = listWorkspaces();
    const ids = all.map((w) => w.workspaceId).sort();
    expect(ids).toEqual(["ws-a", "ws-b"]);
  });
});
