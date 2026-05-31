import { applyPortPlan, buildPortPlan } from "../core/planner.js";
import { renderPlan } from "../core/render.js";
import { confirmApply, createCliContext, parseAgent, parseFromRest, writePlanFile } from "./shared.js";

export interface FromOptions {
  apply?: boolean;
  yes?: boolean;
  out?: string;
  generatedDir?: string;
}

export async function fromCommand(
  sourceValue: string,
  rest: string[],
  options: FromOptions
): Promise<void> {
  const source = parseAgent(sourceValue);
  const targets = parseFromRest(rest);
  const shouldApply = options.apply ?? false;
  const context = createCliContext({
    dryRun: !shouldApply,
    yes: options.yes ?? false,
    generatedDir: options.generatedDir,
  });

  const plan = await buildPortPlan({
    cwd: context.cwd,
    homeDir: context.homeDir,
    source,
    targets,
    dryRun: !shouldApply,
    yes: options.yes,
    generatedDir: context.generatedDir,
  });

  if (options.out) {
    await writePlanFile(options.out, plan);
  }

  if (!shouldApply) {
    console.log(renderPlan(plan, false));
    return;
  }

  if (!(await confirmApply(options.yes ?? false))) {
    console.log("No files were changed.");
    return;
  }

  const result = await applyPortPlan(plan, context);
  console.log(renderPlan(plan, true));
  for (const warning of result.warnings) {
    console.log(`! ${warning}`);
  }
  if (result.backupsCreated.length > 0) {
    console.log(`Backups created: ${result.backupsCreated.length}`);
  }
}
