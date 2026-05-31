import path from "node:path";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";
import { codexAdapter } from "../../src/adapters/codex.js";
import { makeTempProject, testContext } from "../helpers.js";

describe("Codex adapter", () => {
  it("parses Codex TOML config and AGENTS.md", async () => {
    const { cwd, homeDir } = await makeTempProject();
    await fs.writeFile(path.join(cwd, "AGENTS.md"), "Codex instructions\n");
    await fs.ensureDir(path.join(cwd, ".codex"));
    await fs.writeFile(
      path.join(cwd, ".codex", "config.toml"),
      [
        'approval_policy = "on-request"',
        'sandbox_mode = "workspace-write"',
        "",
        "[mcp_servers.github]",
        'command = "npx"',
        'args = ["github"]',
      ].join("\n")
    );

    const setup = await codexAdapter.read(testContext(cwd, homeDir));
    expect(setup.components.some((item) => item.kind === "instruction")).toBe(true);
    expect(setup.components.some((item) => item.kind === "mcp-server" && item.title === "github")).toBe(true);
    expect(setup.components.some((item) => item.kind === "permission")).toBe(true);
  });
});
