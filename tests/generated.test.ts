import path from "node:path";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";
import { applyPortPlan } from "../src/core/planner.js";
import { makeTempProject, setup, testContext } from "./helpers.js";

describe("generated artifact writer", () => {
  it("creates backups and redacts secret-like values before writing", async () => {
    const { cwd, homeDir } = await makeTempProject();
    await fs.writeFile(path.join(cwd, "GEMINI.md"), "existing\n");
    const context = testContext(cwd, homeDir);

    const result = await applyPortPlan(
      {
        source: setup("claude", []),
        targets: [setup("gemini", [])],
        changes: [],
        generatedFiles: [
          {
            target: "gemini",
            path: "GEMINI.md",
            content: "secret sk-abcdefghijklmnopqrstuvwxyz123456\n",
            reason: "test",
          },
        ],
      },
      { ...context, dryRun: false }
    );

    const content = await fs.readFile(path.join(cwd, "GEMINI.md"), "utf8");
    expect(content).toContain("[REDACTED_SECRET]");
    expect(result.backupsCreated).toHaveLength(1);
  });
});
