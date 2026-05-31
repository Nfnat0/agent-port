import path from "node:path";
import fs from "fs-extra";
import { getAdapter } from "../adapters/index.js";
import {
  type AdapterContext,
  type AgentId,
  type ApplyResult,
  type PortPlan,
  DEFAULT_CATEGORIES,
} from "./model.js";
import { redactSecrets, scanUnknownForSecrets } from "./secrets.js";
import { writeTextWithBackup } from "./fs.js";

export interface BuildPlanOptions {
  cwd: string;
  homeDir: string;
  source: AgentId;
  targets: AgentId[];
  dryRun?: boolean;
  yes?: boolean;
  generatedDir?: string;
}

export function createContext(options: {
  cwd: string;
  homeDir: string;
  dryRun?: boolean;
  yes?: boolean;
  generatedDir?: string;
}): AdapterContext {
  return {
    cwd: options.cwd,
    homeDir: options.homeDir,
    dryRun: options.dryRun ?? true,
    yes: options.yes ?? false,
    generatedDir: options.generatedDir ?? ".agent-port/generated",
    categories: [...DEFAULT_CATEGORIES],
  };
}

export async function buildPortPlan(options: BuildPlanOptions): Promise<PortPlan> {
  const context = createContext(options);
  const sourceAdapter = getAdapter(options.source);
  const source = await sourceAdapter.read(context);
  const targets = [];
  const changes = [];
  const generatedFiles = [];

  for (const targetId of options.targets) {
    const targetAdapter = getAdapter(targetId);
    const target = await targetAdapter.read(context);
    targets.push(target);
    const targetChanges = await targetAdapter.planApply(source, target, context);
    changes.push(...targetChanges);
    generatedFiles.push(
      ...((await targetAdapter.generateFiles?.(source, target, targetChanges, context)) ?? [])
    );
  }

  return { source, targets, changes, generatedFiles };
}

export async function applyPortPlan(
  plan: PortPlan,
  context: AdapterContext
): Promise<ApplyResult> {
  const filesWritten: string[] = [];
  const backupsCreated: string[] = [];
  const warnings: string[] = [];

  for (const file of plan.generatedFiles) {
    const findings = scanUnknownForSecrets(file.content, file.path);
    let content = redactSecrets(file.content);
    if (findings.length > 0) {
      warnings.push(
        `Redacted ${findings.length} secret-like value(s) before writing ${file.path}.`
      );
    }

    const absolute = await resolveWritablePlanPath(file.path, context.cwd);
    const result = await writeTextWithBackup(absolute, content);
    filesWritten.push(file.path);
    if (result.backup) {
      backupsCreated.push(result.backup);
    }
  }

  return { filesWritten, backupsCreated, warnings };
}

async function resolveWritablePlanPath(filePath: string, cwd: string): Promise<string> {
  const root = await fs.realpath(cwd);
  const absolute = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(root, filePath);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside the project: ${filePath}`);
  }

  if (await fs.pathExists(absolute)) {
    const stat = await fs.lstat(absolute);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to write through symlink: ${filePath}`);
    }
  }

  const parent = await nearestExistingParent(path.dirname(absolute));
  const realParent = await fs.realpath(parent);
  const parentRelative = path.relative(root, realParent);
  if (parentRelative.startsWith("..") || path.isAbsolute(parentRelative)) {
    throw new Error(`Refusing to write outside the project: ${filePath}`);
  }

  return absolute;
}

async function nearestExistingParent(directory: string): Promise<string> {
  let current = path.resolve(directory);
  while (!(await fs.pathExists(current))) {
    const next = path.dirname(current);
    if (next === current) {
      return current;
    }
    current = next;
  }
  return current;
}
