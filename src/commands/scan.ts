import { listAdapters } from "../adapters/index.js";
import { renderScan } from "../core/render.js";
import { createCliContext } from "./shared.js";

export async function scanCommand(): Promise<void> {
  const context = createCliContext({ dryRun: true });
  const setups = [];
  for (const adapter of listAdapters()) {
    setups.push(await adapter.read(context));
  }
  console.log(renderScan(setups));
}
