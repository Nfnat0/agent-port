import path from "node:path";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";
import { copilotAdapter } from "../../src/adapters/copilot.js";
import { makeTempProject, testContext } from "../helpers.js";

describe("Copilot adapter", () => {
  it("parses Copilot instructions and VS Code MCP config", async () => {
    const { cwd, homeDir } = await makeTempProject();
    await fs.ensureDir(path.join(cwd, ".github"));
    await fs.writeFile(path.join(cwd, ".github", "copilot-instructions.md"), "Copilot instructions\n");
    await fs.ensureDir(path.join(cwd, ".vscode"));
    await fs.writeJson(path.join(cwd, ".vscode", "mcp.json"), {
      servers: {
        docs: { command: "node", args: ["docs-server.js"] },
      },
    });

    const setup = await copilotAdapter.read(testContext(cwd, homeDir));
    expect(setup.components.some((item) => item.kind === "instruction")).toBe(true);
    expect(setup.components.some((item) => item.kind === "mcp-server" && item.title === "docs")).toBe(true);
  });
});
