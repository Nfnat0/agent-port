import path from "node:path";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";
import { runDoctor } from "../src/core/doctor.js";
import { makeTempProject, testContext } from "./helpers.js";

describe("doctor", () => {
  it("does not report malformed detected config as readable", async () => {
    const { cwd, homeDir } = await makeTempProject();
    await fs.ensureDir(path.join(cwd, ".gemini"));
    await fs.writeFile(path.join(cwd, ".gemini", "settings.json"), "{ invalid json");

    const items = await runDoctor(testContext(cwd, homeDir));

    expect(items).toContainEqual({
      status: "warn",
      message: "Gemini CLI config has errors",
    });
    expect(items).not.toContainEqual({
      status: "ok",
      message: "Gemini CLI config is readable",
    });
  });
});
