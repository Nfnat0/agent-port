import { buildPortPlan } from "../core/planner.js";
import { renderPlan } from "../core/render.js";
import { createCliContext, parseAgent, parseTargets, writePlanFile } from "./shared.js";

export interface PlanOptions {
  from: string;
  to: string;
  out?: string;
  generatedDir?: string;
}

export async function planCommand(options: PlanOptions): Promise<void> {
  const context = createCliContext({ dryRun: true, generatedDir: options.generatedDir });
  const plan = await buildPortPlan({
    cwd: context.cwd,
    homeDir: context.homeDir,
    source: parseAgent(options.from),
    targets: parseTargets(options.to),
    dryRun: true,
    generatedDir: context.generatedDir,
  });

  if (options.out) {
    await writePlanFile(options.out, plan);
  }
  console.log(renderPlan(plan, false));
}
