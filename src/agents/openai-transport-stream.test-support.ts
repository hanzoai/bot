import "./ai-transport-runtime-host.js";
import "@hanzo/bot-ai/transports";

const completionsTesting = globalThis.botOpenAICompletionsTransportTestApi;
const responsesTesting = globalThis.botOpenAIResponsesTransportTestApi;
if (!completionsTesting || !responsesTesting) {
  throw new Error("OpenAI transport test APIs are unavailable outside test mode");
}

export const testing = {
  ...responsesTesting,
  ...completionsTesting,
};
