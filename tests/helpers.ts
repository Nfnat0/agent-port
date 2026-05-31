import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import type {
  AdapterContext,
  AgentId,
  CanonicalAgentSetup,
  CanonicalInstruction,
  CanonicalMcpServer,
  CanonicalPermission,
  CanonicalSetupComponent,
} from "../src/core/model.js";
import { AGENT_DISPLAY_NAMES, DEFAULT_CATEGORIES } from "../src/core/model.js";

export async function makeTempProject(): Promise<{ cwd: string; homeDir: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "agent-port-test-"));
  const cwd = path.join(root, "project");
  const homeDir = path.join(root, "home");
  await fs.ensureDir(cwd);
  await fs.ensureDir(homeDir);
  return { cwd, homeDir };
}

export function testContext(cwd: string, homeDir: string): AdapterContext {
  return {
    cwd,
    homeDir,
    dryRun: true,
    yes: true,
    generatedDir: ".agent-port/generated",
    categories: [...DEFAULT_CATEGORIES],
  };
}

export function setup(
  agent: AgentId,
  components: CanonicalSetupComponent[]
): CanonicalAgentSetup {
  return {
    agent,
    displayName: AGENT_DISPLAY_NAMES[agent],
    detected: components.length > 0,
    configPaths: [],
    components,
    warnings: [],
  };
}

export function instruction(
  agent: AgentId,
  content: string,
  pathName = `${agent.toUpperCase()}.md`
): CanonicalInstruction {
  return {
    id: `instruction:${agent}:${pathName}`,
    kind: "instruction",
    title: pathName,
    source: { agent, path: pathName, format: "markdown" },
    portability: "native",
    risk: "low",
    warnings: [],
    content,
  };
}

export function mcpServer(
  agent: AgentId,
  name: string,
  overrides: Partial<CanonicalMcpServer> = {}
): CanonicalMcpServer {
  return {
    id: `mcp-server:${agent}:${name}`,
    kind: "mcp-server",
    title: name,
    source: { agent, path: "settings.json", format: "json" },
    portability: "native",
    risk: "low",
    warnings: [],
    name,
    transport: "stdio",
    command: "npx",
    args: ["-y", name],
    ...overrides,
  };
}

export function permission(
  agent: AgentId,
  overrides: Partial<CanonicalPermission> = {}
): CanonicalPermission {
  return {
    id: `permission:${agent}:tool-permissions`,
    kind: "permission",
    title: "Tool permissions",
    source: { agent, path: "settings.json", format: "json" },
    portability: "manual",
    risk: "medium",
    warnings: [],
    name: "tool-permissions",
    ...overrides,
  };
}
