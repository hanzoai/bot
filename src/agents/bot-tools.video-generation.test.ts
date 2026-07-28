// Verifies video-generation tool registration through the shared generation harness.
import { describeBotGenerationToolRegistration } from "./bot-tools.generation.test-support.js";

describeBotGenerationToolRegistration({
  suiteName: "bot tools video generation registration",
  toolName: "video_generate",
  toolLabel: "a video-generation tool",
});
