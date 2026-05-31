import { getAdapter } from "../adapters/index.js";
import { createCliContext, parseAgent } from "./shared.js";
import { sanitizeUnknownSecrets } from "../core/secrets.js";
import { writeTextWithBackup } from "../core/fs.js";

export interface ExportOptions {
  out?: string;
}

export async function exportCommand(sourceValue: string, options: ExportOptions): Promise<void> {
  const context = createCliContext({ dryRun: true });
  const source = parseAgent(sourceValue);
  const setup = await getAdapter(source).read(context);
  const output = `${JSON.stringify(sanitizeUnknownSecrets(setup), null, 2)}\n`;

  if (options.out) {
    await writeTextWithBackup(options.out, output);
    console.log(`Wrote ${options.out}`);
    return;
  }

  console.log(output.trimEnd());
}
