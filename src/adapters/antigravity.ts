import path from "node:path";
import fg from "fast-glob";
import fs from "fs-extra";
import {
  collectConfigPaths,
  createCommonAdapter,
  readJsonSettings,
  readRuleFile,
} from "./common.js";
import type { AdapterContext, CanonicalSetupComponent } from "../core/model.js";

export const antigravityAdapter = createCommonAdapter({
  id: "antigravity",
  displayName: "Antigravity",
  detectPaths,
  async readComponents(context) {
    const configPaths = await collectConfigPaths(detectPaths(context));
    const components: CanonicalSetupComponent[] = [];
    const warnings: string[] = [];
    const root = path.join(context.cwd, ".antigravity");

    if (!(await fs.pathExists(root))) {
      warnings.push("Antigravity support is experimental. No known config file was found.");
      return { components, configPaths, warnings };
    }

    const settings = await readJsonSettings(
      "antigravity",
      path.join(root, "settings.json"),
      context,
      "Antigravity settings.json"
    );
    components.push(...settings.components);
    warnings.push(...settings.warnings);

    const files = await fg(["**/*.md", "**/*.mdc"], {
      cwd: root,
      absolute: true,
      dot: true,
      onlyFiles: true,
    });
    for (const file of files) {
      const rule = await readRuleFile("antigravity", file, context);
      if (rule.component) components.push(rule.component);
      if (rule.warning) warnings.push(rule.warning);
    }

    return { components, configPaths, warnings };
  },
});

function detectPaths(context: AdapterContext): string[] {
  return [path.join(context.cwd, ".antigravity")];
}
