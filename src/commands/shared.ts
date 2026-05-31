import os from "node:os";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import fs from "fs-extra";
import type { AgentId, AdapterContext, PortPlan } from "../core/model.js";
import { DEFAULT_CATEGORIES } from "../core/model.js";
import { isAgentId } from "../adapters/index.js";
import { writeTextWithBackup } from "../core/fs.js";
import { sanitizeUnknownSecrets } from "../core/secrets.js";

export function createCliContext(options: {
  dryRun?: boolean;
  yes?: boolean;
  generatedDir?: string;
}): AdapterContext {
  return {
    cwd: process.cwd(),
    homeDir: os.homedir(),
    dryRun: options.dryRun ?? true,
    yes: options.yes ?? false,
    generatedDir: options.generatedDir ?? ".agent-port/generated",
    categories: [...DEFAULT_CATEGORIES],
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
