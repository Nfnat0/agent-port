import fs from "fs-extra";
import { writeTextWithBackup } from "../core/fs.js";

const DEFAULT_CONFIG = {
  defaultSource: "claude",
  defaultTargets: ["codex", "gemini", "cursor"],
  generatedDir: ".agent-port/generated",
  portCategories: [
    "settings",
    "instruction",
    "rule",
    "memory",
    "skill",
    "custom-agent",
    "command",
    "hook",
    "mcp-server",
    "permission",
    "env-reference",
  ],
  safety: {
    copyPersonalMemory: false,
    applyExecutableHooks: false,
    allowPermissionExpansion: false,
  },
};

export interface InitOptions {
  force?: boolean;
}

export async function initCommand(options: InitOptions): Promise<void> {
  const filePath = "agent-port.config.json";
  if ((await fs.pathExists(filePath)) && !options.force) {
    console.log("agent-port.config.json already exists. Use --force to replace it with a backup.");
    return;
  }

  await writeTextWithBackup(filePath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  console.log("Created agent-port.config.json");
}
