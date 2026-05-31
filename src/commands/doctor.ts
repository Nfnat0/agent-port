import { runDoctor } from "../core/doctor.js";
import { renderDoctorReport } from "../core/render.js";
import { createCliContext } from "./shared.js";

export async function doctorCommand(): Promise<void> {
  const context = createCliContext({ dryRun: true });
  const items = await runDoctor(context);
  console.log(renderDoctorReport(items));
}
