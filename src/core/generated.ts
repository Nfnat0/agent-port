import path from "node:path";
import {
  type CanonicalCommand,
  type CanonicalCustomAgent,
  type CanonicalHook,
  type CanonicalMcpServer,
  type CanonicalRule,
  type CanonicalSkill,
  type GeneratedFile,
  type AgentId,
} from "./model.js";
import { slugify } from "./fingerprints.js";
import { redactSecrets } from "./secrets.js";

export function generatedPath(
  generatedDir: string,
  target: AgentId,
  category: string,
  name: string
): string {
  return path.join(generatedDir, target, category, `${slugify(name)}.md`);
}

export function generatedFile(
  target: AgentId,
  filePath: string,
  content: string,
  reason: string
): GeneratedFile {
  return {
    target,
    path: filePath,
    content: ensureTrailingNewline(redactSecrets(content)),
    reason,
  };
}

export function renderSkillCard(skill: CanonicalSkill): string {
  return [
    `# Skill: ${skill.name}`,
    "",
    "## Description",
    skill.description ?? "No description was found in the source skill metadata.",
    "",
    "## Procedure",
    skill.content?.trim() || "Review the source files listed below before using this skill.",
    "",
    "## Source",
    `Generated from ${skill.source.agent} skill: ${skill.name}`,
    "",
    "## Source files",
    ...skill.files.map((file) => `- ${file}`),
  ].join("\n");
}

export function renderCustomAgentCard(agent: CanonicalCustomAgent): string {
  return [
    `# Custom Agent: ${agent.name}`,
    "",
    "## Role",
    agent.description ?? "No description was found in the source agent metadata.",
    "",
    "## System prompt",
    agent.systemPrompt?.trim() || "No system prompt was found.",
    "",
    "## Allowed tools",
    ...(agent.allowedTools?.length ? agent.allowedTools : ["Manual review required."]).map(
      (tool) => `- ${tool}`
    ),
    "",
    "## Activation hints",
    ...(agent.activationHints?.length ? agent.activationHints : ["Use when the role matches the task."]).map(
      (hint) => `- ${hint}`
    ),
    "",
    "## Source",
    `Generated from ${agent.source.agent} custom agent: ${agent.name}`,
    "",
    "## Source files",
    ...agent.files.map((file) => `- ${file}`),
  ].join("\n");
}

export function renderCommandCard(command: CanonicalCommand): string {
  return [
    `# Command: ${command.name}`,
    "",
    "## Description",
    command.description ?? "No description was found in the source command metadata.",
    "",
    "## Prompt",
    command.prompt?.trim() || command.command || "Manual review required.",
    "",
    "## Source",
    `Generated from ${command.source.agent} command: ${command.name}`,
    "",
    "## Source files",
    ...command.files.map((file) => `- ${file}`),
  ].join("\n");
}

export function renderHookCard(hook: CanonicalHook): string {
  return [
    `# Hook: ${hook.name}`,
    "",
    "## Event",
    hook.event,
    "",
    "## Command",
    hook.command || hook.content || "Manual review required.",
    "",
    "## Risk",
    "Hooks are high-risk and are never executed or installed by agent-port.",
    "",
    "## Source",
    `Generated from ${hook.source.agent} hook: ${hook.name}`,
  ].join("\n");
}

export function renderRuleCard(rule: CanonicalRule): string {
  return [
    `# Rule: ${rule.title}`,
    "",
    rule.content.trim(),
    "",
    "## Source",
    `Generated from ${rule.source.agent} rule: ${rule.title}`,
  ].join("\n");
}

export function renderMcpServerCard(server: CanonicalMcpServer): string {
  const lines = [
    `# MCP Server: ${server.name}`,
    "",
    `Transport: ${server.transport}`,
  ];

  if (server.command) {
    lines.push(`Command: ${server.command}`);
  }
  if (server.args?.length) {
    lines.push(`Args: ${server.args.join(" ")}`);
  }
  if (server.url) {
    lines.push(`URL: ${server.url}`);
  }
  if (server.env && Object.keys(server.env).length > 0) {
    lines.push("", "Environment:");
    for (const [key, value] of Object.entries(server.env)) {
      lines.push(`- ${key}=${value}`);
    }
  }

  lines.push("", "## Source", `Generated from ${server.source.agent} MCP server: ${server.name}`);
  return lines.join("\n");
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}
