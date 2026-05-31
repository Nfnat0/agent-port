import chalk from "chalk";
import type {
  AgentId,
  CanonicalAgentSetup,
  Change,
  PortPlan,
  SetupComponentKind,
} from "./model.js";
import { AGENT_DISPLAY_NAMES } from "./model.js";

const CHANGE_SYMBOLS: Record<Change["type"], string> = {
  add: "+",
  update: "~",
  skip: "-",
  warn: "!",
  "create-file": "+",
  "manual-review": "!",
  approximate: "≈",
};

export function renderScan(setups: CanonicalAgentSetup[]): string {
  const lines = ["agent-port", "", "Detected agents", ""];

  for (const setup of setups) {
    const symbol = setup.detected ? chalk.green("✓") : chalk.gray("?");
    const paths = setup.configPaths.length ? setup.configPaths.join(", ") : "config path not found";
    lines.push(`  ${symbol} ${setup.displayName.padEnd(18)} ${paths}`);
  }

  lines.push("", "Setup inventory", "");
  for (const setup of setups.filter((item) => item.detected)) {
    lines.push(`  ${setup.displayName}`);
    const counts = countKinds(setup);
    for (const [label, kind] of INVENTORY_LABELS) {
      lines.push(`    ${label.padEnd(18)} ${counts[kind] ?? 0}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function renderPlan(plan: PortPlan, didApply: boolean): string {
  const lines = [`Source: ${plan.source.displayName}`, "", "Found:", ...renderInventory(plan.source), "", "Plan:"];

  for (const target of plan.targets) {
    lines.push(`  ${target.displayName}`);
    const targetChanges = plan.changes.filter((change) => change.target === target.agent);
    if (targetChanges.length === 0) {
      lines.push("    - no compatible changes");
    }
    for (const change of targetChanges) {
      const symbol = colorSymbol(change);
      const detail = change.detail ? ` ${change.detail}` : "";
      const path = change.path ? chalk.gray(` (${change.path})`) : "";
      lines.push(`    ${symbol} ${change.title}${detail}${path}`);
    }
    lines.push("");
  }

  if (didApply) {
    lines.push("Changes were written.");
  } else {
    lines.push("No files were changed.", "Run again with --apply to write changes.");
  }

  return lines.join("\n").trimEnd();
}

export function renderDoctorReport(items: Array<{ status: "ok" | "warn"; message: string }>): string {
  const lines = ["Doctor report", ""];
  for (const item of items) {
    const symbol = item.status === "ok" ? chalk.green("✓") : chalk.yellow("!");
    lines.push(`  ${symbol} ${item.message}`);
  }
  return lines.join("\n");
}

export function renderAgentName(agent: AgentId): string {
  return AGENT_DISPLAY_NAMES[agent] ?? agent;
}

function renderInventory(setup: CanonicalAgentSetup): string[] {
  const counts = countKinds(setup);
  return INVENTORY_LABELS.map(([label, kind]) => `  ${label.padEnd(16)} ${counts[kind] ?? 0}`);
}

function countKinds(setup: CanonicalAgentSetup): Partial<Record<SetupComponentKind, number>> {
  const counts: Partial<Record<SetupComponentKind, number>> = {};
  for (const component of setup.components) {
    counts[component.kind] = (counts[component.kind] ?? 0) + 1;
  }
  return counts;
}

function colorSymbol(change: Change): string {
  const symbol = CHANGE_SYMBOLS[change.type];
  if (change.type === "skip") {
    return chalk.gray(symbol);
  }
  if (change.type === "manual-review" || change.type === "warn") {
    return chalk.yellow(symbol);
  }
  if (change.type === "approximate") {
    return chalk.cyan(symbol);
  }
  return chalk.green(symbol);
}

const INVENTORY_LABELS: Array<[string, SetupComponentKind]> = [
  ["Instructions", "instruction"],
  ["Rules", "rule"],
  ["Skills", "skill"],
  ["Custom agents", "custom-agent"],
  ["Commands", "command"],
  ["Hooks", "hook"],
  ["MCP servers", "mcp-server"],
  ["Permissions", "permission"],
];
