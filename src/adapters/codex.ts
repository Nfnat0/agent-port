import path from "node:path";
import {
  collectConfigPaths,
  createCommonAdapter,
  readInstruction,
  readTomlSettings,
} from "./common.js";
import type { AdapterContext } from "../core/model.js";

export const codexAdapter = createCommonAdapter({
  id: "codex",
  displayName: "Codex",
  detectPaths,
  async readComponents(context) {
    const configPaths = await collectConfigPaths(detectPaths(context));
    const components = [];
    const warnings = [];

    const instruction = await readInstruction(
      "codex",
      path.join(context.cwd, "AGENTS.md"),
      context,
      "AGENTS.md"
    );
    if (instruction.component) components.push(instruction.component);
    if (instruction.warning) warnings.push(instruction.warning);

    for (const configPath of [
      path.join(context.cwd, ".codex", "config.toml"),
      path.join(context.homeDir, ".codex", "config.toml"),
    ]) {
      const settings = await readTomlSettings("codex", configPath, context, "Codex config.toml");
      components.push(...settings.components);
      warnings.push(...settings.warnings);
    }

    return { components, configPaths, warnings };
  },
});

function detectPaths(context: AdapterContext): string[] {
  return [
    path.join(context.homeDir, ".codex", "config.toml"),
    path.join(context.cwd, ".codex", "config.toml"),
    path.join(context.cwd, "AGENTS.md"),
  ];
}
