import path from "node:path";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";
import { claudeAdapter } from "../../src/adapters/claude.js";
import { makeTempProject, testContext } from "../helpers.js";

describe("Claude adapter", () => {
  it("parses CLAUDE.md and handles missing files gracefully", async () => {
    const { cwd, homeDir } = await makeTempProject();
    await fs.writeFile(path.join(cwd, "CLAUDE.md"), "Claude instructions\n");
    await fs.ensureDir(path.join(cwd, ".claude", "skills", "review"));
    await fs.writeFile(
      path.join(cwd, ".claude", "skills", "review", "SKILL.md"),
      "---\ndescription: Review code\n---\nCheck for bugs.\n"
    );
    await fs.ensureDir(path.join(cwd, ".claude", "skills", "review", "references"));
    await fs.writeFile(
      path.join(cwd, ".claude", "skills", "review", "references", "details.md"),
      "Supporting notes should not become a separate skill.\n"
    );
    await fs.ensureDir(path.join(cwd, ".claude", "agents"));
    await fs.writeFile(
      path.join(cwd, ".claude", "agents", "security-reviewer.md"),
      "---\ndescription: Review security-sensitive code\ntools: Read, Bash\n---\nFind auth bugs.\n"
    );

    const setup = await claudeAdapter.read(testContext(cwd, homeDir));
    expect(setup.components.some((item) => item.kind === "instruction")).toBe(true);
    expect(setup.components.some((item) => item.kind === "skill" && item.title === "review")).toBe(true);
    expect(setup.components.filter((item) => item.kind === "skill")).toHaveLength(1);
    const agent = setup.components.find(
      (item) => item.kind === "custom-agent" && item.title === "security-reviewer"
    );
    expect(agent).toEqual(
      expect.objectContaining({ allowedTools: ["Read", "Bash"] })
    );

    const empty = await claudeAdapter.read(testContext(path.join(cwd, "missing"), homeDir));
    expect(empty.components).toEqual([]);
  });
});
