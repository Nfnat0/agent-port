import path from "node:path";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";
import { cursorAdapter } from "../../src/adapters/cursor.js";
import { makeTempProject, testContext } from "../helpers.js";

describe("Cursor adapter", () => {
  it("parses .cursor/mcp.json and rule files", async () => {
    const { cwd, homeDir } = await makeTempProject();
    await fs.ensureDir(path.join(cwd, ".cursor", "rules"));
    await fs.writeJson(path.join(cwd, ".cursor", "mcp.json"), {
      mcpServers: {
        filesystem: { command: "mcp-filesystem", args: ["."] },
      },
    });
    await fs.writeFile(
      path.join(cwd, ".cursor", "rules", "style.mdc"),
      "---\ndescription: Style\nalwaysApply: true\n---\nUse concise code.\n"
    );

    const setup = await cursorAdapter.read(testContext(cwd, homeDir));
    expect(setup.components.some((item) => item.kind === "mcp-server" && item.title === "filesystem")).toBe(true);
    expect(setup.components.some((item) => item.kind === "rule" && item.title === "Style")).toBe(true);
  });
});
