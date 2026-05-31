import path from "node:path";
import type { AdapterContext, AgentId } from "./model.js";

export interface InstructionTarget {
  path: string;
  mode: "markdown" | "cursor-rule";
}

export interface McpTarget {
  path: string;
  format: "json" | "toml";
  key: "mcpServers" | "servers" | "mcp_servers";
}

export interface TargetCapabilities {
  instruction?: InstructionTarget;
  mcp?: McpTarget;
  generatedOnly?: boolean;
  supportNote?: string;
}

export function getTargetCapabilities(
  agent: AgentId,
  context: AdapterContext
): TargetCapabilities {
  switch (agent) {
    case "claude":
      return {
        instruction: { path: path.join(context.cwd, "CLAUDE.md"), mode: "markdown" },
        mcp: {
          path: path.join(context.cwd, ".claude", "settings.json"),
          format: "json",
          key: "mcpServers",
        },
      };
    case "codex":
      return {
        instruction: { path: path.join(context.cwd, "AGENTS.md"), mode: "markdown" },
        mcp: {
          path: path.join(context.cwd, ".codex", "config.toml"),
          format: "toml",
          key: "mcp_servers",
        },
      };
    case "gemini":
      return {
        instruction: { path: path.join(context.cwd, "GEMINI.md"), mode: "markdown" },
        mcp: {
          path: path.join(context.cwd, ".gemini", "settings.json"),
          format: "json",
          key: "mcpServers",
        },
      };
    case "cursor":
      return {
        instruction: {
          path: path.join(context.cwd, ".cursor", "rules", "agent-port-generated.mdc"),
          mode: "cursor-rule",
        },
        mcp: {
          path: path.join(context.cwd, ".cursor", "mcp.json"),
          format: "json",
          key: "mcpServers",
        },
      };
    case "copilot":
      return {
        instruction: {
          path: path.join(context.cwd, ".github", "copilot-instructions.md"),
          mode: "markdown",
        },
        mcp: {
          path: path.join(context.cwd, ".vscode", "mcp.json"),
          format: "json",
          key: "servers",
        },
      };
    case "antigravity":
      return {
        generatedOnly: true,
        supportNote:
          "Antigravity support is experimental. Generated artifacts are created for manual review.",
      };
  }
}
