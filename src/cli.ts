import { Command } from "commander";
import { applyCommand } from "./commands/apply.js";
import { doctorCommand } from "./commands/doctor.js";
import { exportCommand } from "./commands/export.js";
import { fromCommand } from "./commands/from.js";
import { initCommand } from "./commands/init.js";
import { planCommand } from "./commands/plan.js";
import { scanCommand } from "./commands/scan.js";
import { asError } from "./commands/shared.js";

export async function runCli(argv = process.argv): Promise<void> {
  const program = new Command();
  program
    .name("agent-port")
    .description("Port AI coding agent environments across tools with safe, reviewable plans.")
    .version("0.1.0");

  program.command("scan").description("Scan for known agent setup artifacts.").action(scanCommand);

  program
    .command("from")
    .description("Create a porting plan from one agent to one or more target agents.")
    .argument("<source>", "source agent")
    .argument("[rest...]", "use: to <targets...>")
    .option("--apply", "write the planned changes")
    .option("--yes", "skip confirmation when applying")
    .option("--out <path>", "write the plan JSON to a file")
    .option("--generated-dir <path>", "directory for generated fallback artifacts")
    .action(fromCommand);

  program
    .command("plan")
    .description("Create a plan from explicit flags.")
    .requiredOption("--from <agent>", "source agent")
    .requiredOption("--to <agents>", "comma-separated target agents")
    .option("--out <path>", "write the plan JSON to a file")
    .option("--generated-dir <path>", "directory for generated fallback artifacts")
    .action(planCommand);

  program
    .command("apply")
    .description("Apply a previously saved plan.")
    .argument("<plan>", "plan JSON path")
    .option("--yes", "skip confirmation")
    .action(applyCommand);

  program.command("doctor").description("Validate current setup files.").action(doctorCommand);

  program
    .command("init")
    .description("Create an optional project-local agent-port config.")
    .option("--force", "replace existing config after creating a backup")
    .action(initCommand);

  program
    .command("export")
    .description("Export a detected source setup into a portable manifest.")
    .argument("<source>", "source agent")
    .option("--out <path>", "manifest output path")
    .action(exportCommand);

  try {
    await program.parseAsync(argv);
  } catch (error) {
    const typed = asError(error);
    console.error(`agent-port: ${typed.message}`);
    process.exitCode = 1;
  }
}
