import path from "node:path";
import fg from "fast-glob";
import fs from "fs-extra";
import {
  collectConfigPaths,
  createCommonAdapter,
  readJsonSettings,
  readRuleFile,
} from "./common.js";
import type { AdapterContext } from "../core/model.js";

export const cursorAdapter = createCommonAdapter({
  id: "cursor",
  displayName: "Cursor",
  detectPaths,
  async readComponents(context) {
    const configPaths = await collectConfigPaths(detectPaths(context));
    const components = [];
    const warnings = [];

    const mcp = await readJsonSettings(
      "cursor",
      path.join(context.cwd, ".cursor", "mcp.json"),
      context,
      "Cursor mcp.json"
    );
    components.push(...mcp.components);
    warnings.push(...mcp.warnings);

    const settings = await readJsonSettings(
      "cursor",
      path.join(context.cwd, ".cursor", "settings.json"),
      context,
      "Cursor settings.json"
    );
    components.push(...settings.components);
    warnings.push(...settings.warnings);

    const rulesRoot = path.join(context.cwd, ".cursor", "rules");
    if (await fs.pathExists(rulesRoot)) {
      const ruleFiles = await fg(["**/*.mdc", "**/*.md"], {
        cwd: rulesRoot,
        absolute: true,
        dot: true,
        onlyFiles: true,
      });
      for (const file of ruleFiles) {
        const rule = await readRuleFile("cursor", file, context);
        if (rule.component) components.push(rule.component);
        if (rule.warning) warnings.push(rule.warning);
      }
    }

    return { components, configPaths, warnings };
  },
});

function detectPaths(context: AdapterContext): string[] {
  return [
    path.join(context.cwd, ".cursor", "mcp.json"),
    path.join(context.cwd, ".cursor", "settings.json"),
    path.join(context.cwd, ".cursor", "rules"),
  ];
}
