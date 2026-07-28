// STT live audio tests validate live speech-to-text audio fixtures.
import {
  expectBotLiveTranscriptMarker,
  normalizeTranscriptForMatch,
  BOT_LIVE_TRANSCRIPT_MARKER_RE,
} from "bot/plugin-sdk/provider-test-contracts";
import { describe, expect, it } from "vitest";

describe("normalizeTranscriptForMatch", () => {
  it("normalizes punctuation and common Bot live transcription variants", () => {
    expect(normalizeTranscriptForMatch("Open-Claw integration OK")).toBe("botintegrationok");
    expect(normalizeTranscriptForMatch("Testing OpenFlaw realtime transcription")).toMatch(
      /open(?:claw|flaw)/,
    );
    expect(normalizeTranscriptForMatch("OpenCore xAI realtime transcription")).toMatch(
      BOT_LIVE_TRANSCRIPT_MARKER_RE,
    );
    expect(normalizeTranscriptForMatch("OpenCL xAI realtime transcription")).toMatch(
      BOT_LIVE_TRANSCRIPT_MARKER_RE,
    );
    expectBotLiveTranscriptMarker("OpenClar integration OK");
  });
});
