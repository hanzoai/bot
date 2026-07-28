// Verifies PDF tool factory output is included in Bot tool registration.
import { describe, expect, it } from "vitest";
import { collectPresentBotTools } from "./bot-tools.registration.js";
import { createPdfTool } from "./tools/pdf-tool.js";

describe("createBotTools PDF registration", () => {
  it("includes the pdf tool when the pdf factory returns a tool", () => {
    const pdfTool = createPdfTool({
      agentDir: "/tmp/bot-agent-main",
      config: {
        agents: {
          defaults: {
            pdfModel: { primary: "openai/gpt-5.4-mini" },
          },
        },
      },
    });

    expect(pdfTool?.name).toBe("pdf");
    expect(collectPresentBotTools([pdfTool]).map((tool) => tool.name)).toEqual(["pdf"]);
  });
});
