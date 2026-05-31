import path from "node:path";
import { createCommonAdapter, collectConfigPaths, readInstruction, readJsonSettings, readMarkdownCollection } from "./common.js";
import type { AdapterContext } from "../core/model.js";

export const claudeAdapter = createCommonAdapter({
  id: "claude",
  displayName: "Claude Code",
  detectPaths,
  async readComponents(context) {
    const configPaths = await collectConfigPaths(detectPaths(context));
    const components = [];
    const warnings = [];

    const instruction = await readInstruction(
      "claude",
      path.join(context.cwd, "CLAUDE.md"),
      context,
      "CLAUDE.md"
    );
    if (instruction.component) components.push(instruction.component);
    if (instruction.warning) warnings.push(instruction.warning);

    for (const settingsPath of [
      path.join(context.cwd, ".claude", "settings.json"),
      path.join(context.homeDir, ".claude", "settings.json"),
    ]) {
      const settings = await readJsonSettings("claude", settingsPath, context);
      components.push(...settings.components);
      warnings.push(...settings.warnings);
    }

    for (const kind of ["skill", "custom-agent", "command"] as const) {
      const roots =
        kind === "skill"
          ? [
              path.join(context.cwd, ".claude", "skills"),
              path.join(context.homeDir, ".claude", "skills"),
            ]
          : kind === "custom-agent"
            ? [
                path.join(context.cwd, ".claude", "agents"),
                path.join(context.cwd, ".claude", "subagents"),
                path.join(context.homeDir, ".claude", "agents"),
                path.join(context.homeDir, ".claude", "subagents"),
              ]
            : [
                path.join(context.cwd, ".claude", "commands"),
                path.join(context.homeDir, ".claude", "commands"),
              ];
      const collection = await readMarkdownCollection({
        agent: "claude",
        context,
        roots,
        kind,
      });
      components.push(...collection.components);
      configPaths.push(...collection.configPaths);
      warnings.push(...collection.warnings);
    }

    return { components, configPaths, warnings };
  },
});

function detectPaths(context: AdapterContext): string[] {
  return [
    path.join(context.homeDir, ".claude"),
    path.join(context.cwd, ".claude"),
    path.join(context.cwd, "CLAUDE.md"),
  ];
}
