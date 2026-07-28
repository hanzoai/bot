// Verifies image-generation tool registration through the shared generation harness.
import { describeBotGenerationToolRegistration } from "./bot-tools.generation.test-support.js";

describeBotGenerationToolRegistration({
  suiteName: "bot tools image generation registration",
  toolName: "image_generate",
  toolLabel: "an image-generation tool",
});
