import { applyPortPlan } from "../core/planner.js";
import { confirmApply, createCliContext, readPlanFile } from "./shared.js";

export interface ApplyOptions {
  yes?: boolean;
}

export async function applyCommand(planPath: string, options: ApplyOptions): Promise<void> {
  const context = createCliContext({ dryRun: false, yes: options.yes ?? false });
  const plan = await readPlanFile(planPath);
  if (!(await confirmApply(options.yes ?? false))) {
    console.log("No files were changed.");
    return;
  }

  const result = await applyPortPlan(plan, context);
  console.log(`Applied ${result.filesWritten.length} file(s).`);
  if (result.backupsCreated.length > 0) {
    console.log(`Backups created: ${result.backupsCreated.length}`);
  }
  for (const warning of result.warnings) {
    console.log(`! ${warning}`);
  }
}
