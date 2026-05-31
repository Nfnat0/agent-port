import type { AgentAdapter, AgentId } from "../core/model.js";
import { AGENT_IDS } from "../core/model.js";
import { antigravityAdapter } from "./antigravity.js";
import { claudeAdapter } from "./claude.js";
import { codexAdapter } from "./codex.js";
import { copilotAdapter } from "./copilot.js";
import { cursorAdapter } from "./cursor.js";
import { geminiAdapter } from "./gemini.js";

const adapters: Record<AgentId, AgentAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  gemini: geminiAdapter,
  cursor: cursorAdapter,
  copilot: copilotAdapter,
  antigravity: antigravityAdapter,
};

export function getAdapter(agent: AgentId): AgentAdapter {
  const adapter = adapters[agent];
  if (!adapter) {
    throw new Error(`Unknown agent "${agent}". Expected one of: ${AGENT_IDS.join(", ")}`);
  }
  return adapter;
}

export function listAdapters(): AgentAdapter[] {
  return AGENT_IDS.map((id) => adapters[id]);
}

export function isAgentId(value: string): value is AgentId {
  return (AGENT_IDS as readonly string[]).includes(value);
}
