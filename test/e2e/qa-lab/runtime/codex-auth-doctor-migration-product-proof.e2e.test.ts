// QA Lab product proof for the legacy Codex auth doctor migration matrix.
import { afterEach, describe, it } from "vitest";
import { closeBotAgentDatabasesForTest } from "../../../../src/state/bot-agent-db.js";
import {
  createBotTestInstance,
  type BotTestInstance,
} from "../../../helpers/bot-test-instance.js";
import {
  type CodexAuthMigrationShape,
  runCodexAuthDoctorMigrationProof,
} from "./codex-auth-product-proof.test-support.js";

type MigrationCell = {
  name: string;
  shape: CodexAuthMigrationShape;
};

const cells: MigrationCell[] = [
  {
    name: "oauth-only",
    shape: "oauth-only",
  },
  {
    name: "mixed-no-pin",
    shape: "mixed",
  },
];

let instance: BotTestInstance | undefined;

afterEach(async () => {
  closeBotAgentDatabasesForTest();
  await instance?.cleanup();
  instance = undefined;
});

describe("Codex doctor migration product proof", () => {
  it.each(cells)(
    "repairs the $name legacy store into canonical per-agent SQLite",
    { timeout: 180_000 },
    async ({ name, shape }) => {
      instance = await createBotTestInstance({
        name: `qa-codex-doctor-${name}`,
      });

      const accountId = `qa-codex-${name}-account`;
      const canonicalStore = await runCodexAuthDoctorMigrationProof(instance, {
        accountId,
        oauthAccess: "test-access",
        shape,
      });

      console.log(
        `[qa-codex-doctor-migration-product-proof] ${JSON.stringify({
          cell: name,
          canonicalProfileIds: Object.keys(canonicalStore?.profiles ?? {}).toSorted(),
          openaiOrder: canonicalStore?.order?.openai,
          legacyJsonRemoved: true,
        })}`,
      );
    },
  );
});
