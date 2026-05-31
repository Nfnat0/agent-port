import path from "node:path";
import fs from "fs-extra";
import { afterEach, describe, expect, it } from "vitest";
import { createCliContext } from "../src/commands/shared.js";
import { makeTempProject } from "./helpers.js";

const originalCwd = process.cwd();

describe("CLI context", () => {
  afterEach(() => {
    process.chdir(originalCwd);
  });

  it("loads project config and lets CLI flags override generatedDir", async () => {
    const { cwd } = await makeTempProject();
    await fs.writeJson(path.join(cwd, "agent-port.config.json"), {
      generatedDir: "configured-generated",
      portCategories: ["instruction", "mcp-server"],
    });
    process.chdir(cwd);

    const configured = createCliContext({ dryRun: true });
    expect(configured.generatedDir).toBe("configured-generated");
    expect(configured.categories).toEqual(["instruction", "mcp-server"]);

    const overridden = createCliContext({
      dryRun: true,
      generatedDir: "flag-generated",
    });
    expect(overridden.generatedDir).toBe("flag-generated");
    expect(overridden.categories).toEqual(["instruction", "mcp-server"]);
  });

  it("accepts category aliases from older config files", async () => {
    const { cwd } = await makeTempProject();
    await fs.writeJson(path.join(cwd, "agent-port.config.json"), {
      portCategories: ["instructions", "customAgents", "mcpServers"],
    });
    process.chdir(cwd);

    const context = createCliContext({ dryRun: true });
    expect(context.categories).toEqual(["instruction", "custom-agent", "mcp-server"]);
  });
});
