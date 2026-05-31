import path from "node:path";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";
import { geminiAdapter } from "../../src/adapters/gemini.js";
import { makeTempProject, testContext } from "../helpers.js";

describe("Gemini adapter", () => {
  it("parses settings.json, GEMINI.md, and handles malformed config gracefully", async () => {
    const { cwd, homeDir } = await makeTempProject();
    await fs.writeFile(path.join(cwd, "GEMINI.md"), "Gemini instructions\n");
    await fs.ensureDir(path.join(cwd, ".gemini"));
    await fs.writeJson(path.join(cwd, ".gemini", "settings.json"), {
      mcpServers: {
        github: { command: "npx", args: ["github"], env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" } },
      },
      includeTools: ["read"],
    });

    const setup = await geminiAdapter.read(testContext(cwd, homeDir));
    expect(setup.components.some((item) => item.kind === "instruction")).toBe(true);
    expect(setup.components.some((item) => item.kind === "mcp-server" && item.title === "github")).toBe(true);
    expect(setup.components.some((item) => item.kind === "permission")).toBe(true);

    await fs.writeFile(path.join(cwd, ".gemini", "settings.json"), "{nope");
    const malformed = await geminiAdapter.read(testContext(cwd, homeDir));
    expect(malformed.warnings.some((warning) => warning.includes("Invalid JSON"))).toBe(true);
  });
});
