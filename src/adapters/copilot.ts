import path from "node:path";
import {
  collectConfigPaths,
  createCommonAdapter,
  readInstruction,
  readJsonSettings,
} from "./common.js";
import type { AdapterContext } from "../core/model.js";

export const copilotAdapter = createCommonAdapter({
  id: "copilot",
  displayName: "GitHub Copilot",
  detectPaths,
  async readComponents(context) {
    const configPaths = await collectConfigPaths(detectPaths(context));
    const components = [];
    const warnings = [];

    const instruction = await readInstruction(
      "copilot",
      path.join(context.cwd, ".github", "copilot-instructions.md"),
      context,
      "copilot-instructions.md"
    );
    if (instruction.component) components.push(instruction.component);
    if (instruction.warning) warnings.push(instruction.warning);

    for (const filePath of [
      path.join(context.cwd, ".vscode", "mcp.json"),
      path.join(context.cwd, ".vscode", "settings.json"),
    ]) {
      const settings = await readJsonSettings("copilot", filePath, context);
      components.push(...settings.components);
      warnings.push(...settings.warnings);
    }

    return { components, configPaths, warnings };
  },
});

function detectPaths(context: AdapterContext): string[] {
  return [
    path.join(context.cwd, ".github", "copilot-instructions.md"),
    path.join(context.cwd, ".vscode", "mcp.json"),
    path.join(context.cwd, ".vscode", "settings.json"),
  ];
}
