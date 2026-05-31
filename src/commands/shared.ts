import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import fs from "fs-extra";
import type { AgentId, AdapterContext, PortPlan, SetupComponentKind } from "../core/model.js";
import { DEFAULT_CATEGORIES } from "../core/model.js";
import { isAgentId } from "../adapters/index.js";
import { writeTextWithBackup } from "../core/fs.js";
import { sanitizeUnknownSecrets } from "../core/secrets.js";

export function createCliContext(options: {
  dryRun?: boolean;
  yes?: boolean;
  generatedDir?: string;
}): AdapterContext {
  const cwd = process.cwd();
  const config = readProjectConfig(cwd);
  return {
    cwd,
    homeDir: os.homedir(),
    dryRun: options.dryRun ?? true,
    yes: options.yes ?? false,
    generatedDir: options.generatedDir ?? stringValue(config.generatedDir) ?? ".agent-port/generated",
    categories: categoryValues(config.portCategories) ?? [...DEFAULT_CATEGORIES],
  };
}

export function parseAgent(value: string): AgentId {
  if (isAgentId(value)) {
    return value;
  }
  throw new Error(`Unknown agent "${value}".`);
}

export function parseTargets(value: string | string[]): AgentId[] {
  const raw = Array.isArray(value) ? value : value.split(",");
  const targets = raw
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter(Boolean)
    .map(parseAgent);
  if (targets.length === 0) {
    throw new Error("At least one target agent is required.");
  }
  return targets;
}

export function parseFromRest(rest: string[]): AgentId[] {
  if (rest[0] !== "to") {
    throw new Error('Expected syntax: agent-port from <source> to <targets...>');
  }
  return parseTargets(rest.slice(1));
}

export async function confirmApply(yes: boolean): Promise<boolean> {
  if (yes) {
    return true;
  }

  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question("Apply these changes? [y/N] ");
    return answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

export async function writePlanFile(filePath: string, plan: PortPlan): Promise<void> {
  const sanitized = sanitizeUnknownSecrets(plan);
  await writeTextWithBackup(filePath, `${JSON.stringify(sanitized, null, 2)}\n`);
}

export async function readPlanFile(filePath: string): Promise<PortPlan> {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content) as PortPlan;
}

export function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function readProjectConfig(cwd: string): Record<string, unknown> {
  const filePath = path.join(cwd, "agent-port.config.json");
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const value = fs.readJsonSync(filePath) as unknown;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function categoryValues(value: unknown): SetupComponentKind[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const allowed = new Set<string>(DEFAULT_CATEGORIES);
  const categories = value
    .map((item) => (typeof item === "string" ? normalizeCategory(item) : undefined))
    .filter((item): item is SetupComponentKind => !!item && allowed.has(item));
  return categories.length > 0 ? categories : undefined;
}

function normalizeCategory(value: string): SetupComponentKind | undefined {
  const aliases: Record<string, SetupComponentKind> = {
    instructions: "instruction",
    rules: "rule",
    memories: "memory",
    skills: "skill",
    customAgents: "custom-agent",
    commands: "command",
    hooks: "hook",
    mcpServers: "mcp-server",
    permissions: "permission",
    envReferences: "env-reference",
  };
  if ((DEFAULT_CATEGORIES as readonly string[]).includes(value)) {
    return value as SetupComponentKind;
  }
  return aliases[value];
}
