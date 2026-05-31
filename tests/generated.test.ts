import path from "node:path";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";
import { applyPortPlan } from "../src/core/planner.js";
import { writeTextWithBackup } from "../src/core/fs.js";
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
    expect(result.warnings).toContain(
      "Redacted 1 secret-like value(s) before writing GEMINI.md."
    );
    expect(result.backupsCreated).toHaveLength(1);
  });

  it("rejects generated file paths outside the project", async () => {
    const { cwd, homeDir } = await makeTempProject();
    const context = testContext(cwd, homeDir);
    const plan = {
      source: setup("claude", []),
      targets: [setup("gemini", [])],
      changes: [],
      generatedFiles: [
        {
          target: "gemini" as const,
          path: "../outside.md",
          content: "outside\n",
          reason: "test",
        },
      ],
    };

    await expect(applyPortPlan(plan, { ...context, dryRun: false })).rejects.toThrow(
      "Refusing to write outside the project"
    );
    await expect(fs.pathExists(path.join(cwd, "..", "outside.md"))).resolves.toBe(false);

    const absolutePlan = {
      ...plan,
      generatedFiles: [
        {
          target: "gemini" as const,
          path: path.join(cwd, "..", "absolute-outside.md"),
          content: "outside\n",
          reason: "test",
        },
      ],
    };
    await expect(applyPortPlan(absolutePlan, { ...context, dryRun: false })).rejects.toThrow(
      "Refusing to write outside the project"
    );
    await expect(fs.pathExists(path.join(cwd, "..", "absolute-outside.md"))).resolves.toBe(
      false
    );
  });

  it("rejects generated file paths that point through symlinks", async () => {
    const { cwd, homeDir } = await makeTempProject();
    const outside = path.join(cwd, "..", "outside.md");
    await fs.writeFile(outside, "outside\n");
    await fs.symlink(outside, path.join(cwd, "GEMINI.md"));
    const context = testContext(cwd, homeDir);

    await expect(
      applyPortPlan(
        {
          source: setup("claude", []),
          targets: [setup("gemini", [])],
          changes: [],
          generatedFiles: [
            {
              target: "gemini",
              path: "GEMINI.md",
              content: "changed\n",
              reason: "test",
            },
          ],
        },
        { ...context, dryRun: false }
      )
    ).rejects.toThrow("Refusing to write through symlink");
    await expect(fs.readFile(outside, "utf8")).resolves.toBe("outside\n");
  });

  it("creates unique backups when the same file is written repeatedly", async () => {
    const { cwd } = await makeTempProject();
    const filePath = path.join(cwd, "settings.json");
    await fs.writeFile(filePath, "first\n");

    const first = await writeTextWithBackup(filePath, "second\n");
    const second = await writeTextWithBackup(filePath, "third\n");

    expect(first.backup).toBeDefined();
    expect(second.backup).toBeDefined();
    expect(second.backup).not.toBe(first.backup);
    expect(await fs.pathExists(first.backup!)).toBe(true);
    expect(await fs.pathExists(second.backup!)).toBe(true);
  });
});
