import path from "node:path";
import {
  collectConfigPaths,
  createCommonAdapter,
  readInstruction,
  readJsonSettings,
} from "./common.js";
import type { AdapterContext } from "../core/model.js";

export const geminiAdapter = createCommonAdapter({
  id: "gemini",
  displayName: "Gemini CLI",
  detectPaths,
  async readComponents(context) {
    const configPaths = await collectConfigPaths(detectPaths(context));
    const components = [];
    const warnings = [];

    const instruction = await readInstruction(
      "gemini",
      path.join(context.cwd, "GEMINI.md"),
      context,
      "GEMINI.md"
    );
    if (instruction.component) components.push(instruction.component);
    if (instruction.warning) warnings.push(instruction.warning);

    for (const settingsPath of [
      path.join(context.cwd, ".gemini", "settings.json"),
      path.join(context.homeDir, ".gemini", "settings.json"),
    ]) {
      const settings = await readJsonSettings("gemini", settingsPath, context, "Gemini settings.json");
      components.push(...settings.components);
      warnings.push(...settings.warnings);
    }

    return { components, configPaths, warnings };
  },
});

function detectPaths(context: AdapterContext): string[] {
  return [
    path.join(context.homeDir, ".gemini", "settings.json"),
    path.join(context.cwd, ".gemini", "settings.json"),
    path.join(context.cwd, "GEMINI.md"),
  ];
}
