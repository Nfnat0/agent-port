import path from "node:path";
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
    let content = redactSecrets(file.content);
    const findings = scanUnknownForSecrets(content, file.path);
    if (findings.length > 0) {
      warnings.push(
        `Redacted ${findings.length} secret-like value(s) before writing ${file.path}.`
      );
      content = redactSecrets(content);
    }

    const absolute = path.isAbsolute(file.path)
      ? file.path
      : path.join(context.cwd, file.path);
    const result = await writeTextWithBackup(absolute, content);
    filesWritten.push(file.path);
    if (result.backup) {
      backupsCreated.push(result.backup);
    }
  }

  return { filesWritten, backupsCreated, warnings };
}
