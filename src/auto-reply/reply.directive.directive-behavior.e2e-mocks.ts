import { vi, type Mock } from "vitest";

const { runEmbeddedPiAgentMock: _runMock, loadModelCatalogMock: _catMock } = vi.hoisted(() => ({
  runEmbeddedPiAgentMock: vi.fn() as Mock,
  loadModelCatalogMock: vi.fn() as Mock,
}));

export const runEmbeddedPiAgentMock: Mock = _runMock;

vi.mock("../agents/pi-embedded.js", () => ({
  abortEmbeddedPiRun: vi.fn().mockReturnValue(false),
  runEmbeddedPiAgent: _runMock,
  queueEmbeddedPiMessage: vi.fn().mockReturnValue(false),
  resolveEmbeddedSessionLane: (key: string) => `session:${key.trim() || "main"}`,
  isEmbeddedPiRunActive: vi.fn().mockReturnValue(false),
  isEmbeddedPiRunStreaming: vi.fn().mockReturnValue(false),
}));

vi.mock("../agents/model-catalog.js", () => ({
  loadModelCatalog: _catMock,
}));
