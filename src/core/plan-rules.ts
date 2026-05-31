import path from "node:path";
import * as TOML from "@iarna/toml";
import { readJsonIfExists, readTextIfExists, displayPath } from "./fs.js";
import {
  generatedFile,
  generatedPath,
  renderCommandCard,
  renderCustomAgentCard,
  renderHookCard,
  renderMcpServerCard,
  renderRuleCard,
  renderSkillCard,
} from "./generated.js";
import { contentHash, normalizeContent, slugify } from "./fingerprints.js";
import type {
  AdapterContext,
  AgentId,
  CanonicalAgentSetup,
  CanonicalCommand,
  CanonicalCustomAgent,
  CanonicalHook,
  CanonicalInstruction,
  CanonicalMcpServer,
  CanonicalRule,
  CanonicalSetupComponent,
  CanonicalSkill,
  Change,
  GeneratedFile,
  RiskLevel,
} from "./model.js";
import { AGENT_DISPLAY_NAMES } from "./model.js";
import { isEnvReference, redactSecrets, scanUnknownForSecrets } from "./secrets.js";
import {
  assessComponentRisk,
  isPermissionExpansion,
  shouldBlockMemoryCopy,
  unsupportedTransportWarning,
} from "./safety.js";
import { getTargetCapabilities } from "./targets.js";

const MARKER_START = "<!-- agent-port:start";
const MARKER_END = "<!-- agent-port:end -->";

export function planChangesForTarget(
  source: CanonicalAgentSetup,
  target: CanonicalAgentSetup,
  context: AdapterContext
): Change[] {
  const changes: Change[] = [];
  const capabilities = getTargetCapabilities(target.agent, context);

  for (const component of source.components) {
    if (!context.categories.includes(component.kind)) {
      continue;
    }

    switch (component.kind) {
      case "instruction":
        changes.push(planInstruction(component, source.agent, target, context));
        break;
      case "rule":
        changes.push(planRule(component, target, context));
        break;
      case "skill":
        changes.push(planApproximation(component, target.agent, context, "skills", "skill"));
        break;
      case "custom-agent":
        changes.push(planApproximation(component, target.agent, context, "agents", "custom agent"));
        break;
      case "command":
        changes.push(planApproximation(component, target.agent, context, "commands", "command"));
        break;
      case "hook":
        changes.push({
          type: "manual-review",
          target: target.agent,
          componentKind: "hook",
          title: `hook "${component.name}" requires manual review`,
          detail: component.command ? `command: ${redactSecrets(component.command)}` : undefined,
          componentId: component.id,
          risk: assessComponentRisk(component),
          portability: "manual",
        });
        break;
      case "mcp-server":
        changes.push(planMcpServer(component, target, context));
        break;
      case "permission": {
        const targetPermission = target.components.find(
          (item) => item.kind === "permission"
        );
        changes.push({
          type: isPermissionExpansion(component, targetPermission) ? "manual-review" : "warn",
          target: target.agent,
          componentKind: "permission",
          title: `permission "${component.name}" requires review`,
          detail: "agent-port does not silently broaden target permissions",
          componentId: component.id,
          risk: isPermissionExpansion(component, targetPermission) ? "high" : "medium",
          portability: "manual",
        });
        break;
      }
      case "memory":
        changes.push({
          type: "manual-review",
          target: target.agent,
          componentKind: "memory",
          title: shouldBlockMemoryCopy(component)
            ? `memory "${component.title}" blocked by default`
            : `memory "${component.title}" requires review`,
          detail: "memories can contain personal or sensitive context",
          componentId: component.id,
          risk: "high",
          portability: "manual",
        });
        break;
      case "settings":
        changes.push({
          type: "manual-review",
          target: target.agent,
          componentKind: "settings",
          title: `settings from ${component.source.path} require review`,
          detail: capabilities.generatedOnly
            ? capabilities.supportNote
            : "only clearly equivalent settings should be copied",
          componentId: component.id,
          risk: "medium",
          portability: "manual",
        });
        break;
      case "env-reference":
        changes.push({
          type: "warn",
          target: target.agent,
          componentKind: "env-reference",
          title: `environment variable ${component.name} may be required`,
          detail: component.required ? "missing locally or required by source setup" : undefined,
          componentId: component.id,
          risk: "medium",
          portability: "manual",
        });
        break;
    }
  }

  return changes;
}

export async function generateFilesForTarget(
  source: CanonicalAgentSetup,
  target: CanonicalAgentSetup,
  changes: Change[],
  context: AdapterContext
): Promise<GeneratedFile[]> {
  const files: GeneratedFile[] = [];
  const capabilities = getTargetCapabilities(target.agent, context);

  for (const change of changes.filter((item) => item.target === target.agent)) {
    const component = source.components.find((item) => item.id === change.componentId);
    if (!component) {
      continue;
    }

    if (component.kind === "instruction" && change.type !== "skip") {
      const filePath =
        capabilities.instruction?.path ??
        change.path ??
        generatedPath(context.generatedDir, target.agent, "instructions", source.agent);
      const outputPath = capabilities.instruction
        ? displayPath(filePath, context.cwd, context.homeDir)
        : filePath;
      files.push(
        generatedFile(
          target.agent,
          outputPath,
          await renderInstructionForTarget(component, source.agent, target.agent, context),
          `Port ${component.source.path} to ${AGENT_DISPLAY_NAMES[target.agent]}`
        )
      );
    }

    if (component.kind === "rule" && change.type !== "skip") {
      const rulePath =
        target.agent === "cursor"
          ? cursorRulePath(component)
          : generatedPath(context.generatedDir, target.agent, "rules", component.title);
      files.push(
        generatedFile(
          target.agent,
          rulePath,
          target.agent === "cursor"
            ? renderCursorRule(component)
            : renderRuleCard(component),
          `Port rule ${component.title}`
        )
      );
    }

    if (component.kind === "skill" && change.type !== "skip") {
      files.push(
        generatedFile(
          target.agent,
          generatedPath(context.generatedDir, target.agent, "skills", component.name),
          renderSkillCard(component),
          `Create portable skill card for ${component.name}`
        )
      );
    }

    if (component.kind === "custom-agent" && change.type !== "skip") {
      files.push(
        generatedFile(
          target.agent,
          generatedPath(context.generatedDir, target.agent, "agents", component.name),
          renderCustomAgentCard(component),
          `Create portable custom agent card for ${component.name}`
        )
      );
    }

    if (component.kind === "command" && change.type !== "skip") {
      files.push(
        generatedFile(
          target.agent,
          generatedPath(context.generatedDir, target.agent, "commands", component.name),
          renderCommandCard(component),
          `Create portable command card for ${component.name}`
        )
      );
    }

    if (component.kind === "hook") {
      files.push(
        generatedFile(
          target.agent,
          generatedPath(context.generatedDir, target.agent, "hooks", component.name),
          renderHookCard(component),
          `Export hook ${component.name} for manual review`
        )
      );
    }

    if (component.kind === "mcp-server") {
      if (change.type === "add" || change.type === "update") {
        const nativeFile = await renderMcpConfigForTarget(source, target, context);
        if (nativeFile && !files.some((file) => file.path === nativeFile.path)) {
          files.push(nativeFile);
        }
      } else if (change.type === "manual-review" || change.type === "approximate") {
        files.push(
          generatedFile(
            target.agent,
            generatedPath(context.generatedDir, target.agent, "mcp", component.name),
            renderMcpServerCard(component),
            `Export MCP server ${component.name} for manual review`
          )
        );
      }
    }
  }

  return mergeGeneratedFiles(files);
}

function planInstruction(
  instruction: CanonicalInstruction,
  sourceAgent: AgentId,
  target: CanonicalAgentSetup,
  context: AdapterContext
): Change {
  const capabilities = getTargetCapabilities(target.agent, context);
  const equivalent = target.components.find(
    (item) =>
      item.kind === "instruction" &&
      normalizeContent(item.content) === normalizeContent(instruction.content)
  );

  if (equivalent) {
    return {
      type: "skip",
      target: target.agent,
      componentKind: "instruction",
      title: `skip equivalent instruction from ${instruction.source.path}`,
      componentId: instruction.id,
      risk: "low",
      portability: "native",
    };
  }

  if (!capabilities.instruction) {
    return {
      type: "approximate",
      target: target.agent,
      componentKind: "instruction",
      title: `export instructions for ${AGENT_DISPLAY_NAMES[target.agent]}`,
      path: generatedPath(context.generatedDir, target.agent, "instructions", sourceAgent),
      componentId: instruction.id,
      risk: instruction.risk,
      portability: "approximate",
    };
  }

  const targetHasInstruction = target.components.some((item) => item.kind === "instruction");
  return {
    type: targetHasInstruction ? "update" : "add",
    target: target.agent,
    componentKind: "instruction",
    title:
      target.agent === "cursor"
        ? `create Cursor rule from ${instruction.source.path}`
        : `${targetHasInstruction ? "create/update" : "create"} ${displayPath(
            capabilities.instruction.path,
            context.cwd,
            context.homeDir
          )} from ${instruction.source.path}`,
    path: displayPath(capabilities.instruction.path, context.cwd, context.homeDir),
    componentId: instruction.id,
    risk: instruction.risk,
    portability: target.agent === "cursor" ? "approximate" : "native",
  };
}

function planRule(
  rule: CanonicalRule,
  target: CanonicalAgentSetup,
  context: AdapterContext
): Change {
  const equivalent = target.components.find(
    (item) => item.kind === "rule" && normalizeContent(item.content) === normalizeContent(rule.content)
  );

  if (equivalent) {
    return {
      type: "skip",
      target: target.agent,
      componentKind: "rule",
      title: `skip equivalent rule "${rule.title}"`,
      componentId: rule.id,
      risk: "low",
      portability: "native",
    };
  }

  const nativeCursor = target.agent === "cursor";
  return {
    type: nativeCursor ? "add" : "approximate",
    target: target.agent,
    componentKind: "rule",
    title: nativeCursor
      ? `create Cursor rule for "${rule.title}"`
      : `export rule "${rule.title}" as Markdown`,
    path: nativeCursor
      ? cursorRulePath(rule)
      : generatedPath(context.generatedDir, target.agent, "rules", rule.title),
    componentId: rule.id,
    risk: rule.risk,
    portability: nativeCursor ? "native" : "approximate",
  };
}

function planApproximation(
  component: CanonicalSkill | CanonicalCustomAgent | CanonicalCommand,
  target: AgentId,
  context: AdapterContext,
  category: string,
  label: string
): Change {
  return {
    type: "approximate",
    target,
    componentKind: component.kind,
    title: `convert ${label} "${component.name}" to portable artifact`,
    path: generatedPath(context.generatedDir, target, category, component.name),
    componentId: component.id,
    risk: component.risk,
    portability: "approximate",
  };
}

function planMcpServer(
  server: CanonicalMcpServer,
  target: CanonicalAgentSetup,
  context: AdapterContext
): Change {
  const capabilities = getTargetCapabilities(target.agent, context);
  const existing = target.components.find(
    (item) => item.kind === "mcp-server" && item.name === server.name
  ) as CanonicalMcpServer | undefined;
  const transportWarning = unsupportedTransportWarning(server.transport);
  const configWarning = capabilities.mcp
    ? targetMcpConfigWarning(target, capabilities.mcp.path, context)
    : undefined;

  if (transportWarning || !capabilities.mcp) {
    return {
      type: "manual-review",
      target: target.agent,
      componentKind: "mcp-server",
      title: `MCP server "${server.name}" requires manual review`,
      detail: transportWarning ?? capabilities.supportNote ?? "target has no known native MCP format",
      componentId: server.id,
      risk: transportWarning ? "medium" : server.risk,
      portability: capabilities.mcp ? "manual" : "unsupported",
    };
  }

  if (configWarning) {
    return {
      type: "manual-review",
      target: target.agent,
      componentKind: "mcp-server",
      title: `MCP server "${server.name}" requires manual review`,
      detail: "target MCP config could not be parsed; native merge skipped",
      componentId: server.id,
      risk: "medium",
      portability: "manual",
    };
  }

  const same = existing && contentHash(mcpComparable(existing)) === contentHash(mcpComparable(server));
  if (same) {
    return {
      type: "skip",
      target: target.agent,
      componentKind: "mcp-server",
      title: `skip MCP server "${server.name}" because target already has equivalent config`,
      componentId: server.id,
      risk: "low",
      portability: "native",
    };
  }

  return {
    type: existing ? "update" : "add",
    target: target.agent,
    componentKind: "mcp-server",
    title: `${existing ? "update" : "add"} MCP server "${server.name}"`,
    path: displayPath(capabilities.mcp.path, context.cwd, context.homeDir),
    componentId: server.id,
    risk: server.risk,
    portability: "native",
  };
}

async function renderInstructionForTarget(
  instruction: CanonicalInstruction,
  sourceAgent: AgentId,
  targetAgent: AgentId,
  context: AdapterContext
): Promise<string> {
  const capabilities = getTargetCapabilities(targetAgent, context);
  if (!capabilities.instruction) {
    return instruction.content;
  }

  if (capabilities.instruction.mode === "cursor-rule") {
    return renderCursorRule({
      ...instruction,
      kind: "rule",
      globs: ["**/*"],
      alwaysApply: true,
    });
  }

  const existing = await readTextIfExists(capabilities.instruction.path);
  const imported = [
    `${MARKER_START} source=${sourceAgent} path=${instruction.source.path} -->`,
    "",
    `# Imported from ${AGENT_DISPLAY_NAMES[sourceAgent]}`,
    "",
    instruction.content.trim(),
    "",
    MARKER_END,
  ].join("\n");

  if (!existing.value?.trim()) {
    return `${instruction.content.trim()}\n`;
  }

  const content = existing.value;
  const start = content.indexOf(MARKER_START);
  const end = content.indexOf(MARKER_END);
  if (start >= 0 && end > start) {
    return `${content.slice(0, start).trimEnd()}\n\n${imported}\n${content
      .slice(end + MARKER_END.length)
      .trimStart()}`;
  }

  return `${content.trimEnd()}\n\n${imported}\n`;
}

function renderCursorRule(rule: CanonicalRule | CanonicalInstruction): string {
  const content = "content" in rule ? rule.content : "";
  const frontmatter = [
    "---",
    `description: ${yamlString("title" in rule ? rule.title : "Generated by agent-port")}`,
  ];
  if (rule.kind === "rule") {
    if (rule.globs?.length) {
      frontmatter.push(`globs: ${JSON.stringify(rule.globs)}`);
    }
    if (rule.alwaysApply !== undefined) {
      frontmatter.push(`alwaysApply: ${rule.alwaysApply ? "true" : "false"}`);
    }
  } else {
    frontmatter.push("alwaysApply: true");
  }
  frontmatter.push("---");

  return [
    ...frontmatter,
    "",
    content.trim(),
  ].join("\n");
}

function cursorRulePath(rule: CanonicalRule): string {
  return path.join(
    ".cursor",
    "rules",
    `agent-port-${slugify(rule.title)}-${contentHash(rule.source.path).slice(0, 8)}.mdc`
  );
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

async function renderMcpConfigForTarget(
  source: CanonicalAgentSetup,
  target: CanonicalAgentSetup,
  context: AdapterContext
): Promise<GeneratedFile | undefined> {
  const capabilities = getTargetCapabilities(target.agent, context);
  if (!capabilities.mcp) {
    return undefined;
  }

  const sourceServers = source.components.filter(
    (item): item is CanonicalMcpServer =>
      item.kind === "mcp-server" && !unsupportedTransportWarning(item.transport)
  );
  if (sourceServers.length === 0) {
    return undefined;
  }

  if (capabilities.mcp.format === "json") {
    const existing = await readJsonIfExists(capabilities.mcp.path);
    if (existing.warning) {
      return undefined;
    }
    const root = existing.value ?? {};
    const currentServers = objectValue(root[capabilities.mcp.key]);
    const mergedServers = { ...currentServers };
    for (const server of sourceServers) {
      mergedServers[server.name] = toNativeMcpServer(server);
    }
    const merged = { ...root, [capabilities.mcp.key]: mergedServers };
    return generatedFile(
      target.agent,
      displayPath(capabilities.mcp.path, context.cwd, context.homeDir),
      `${JSON.stringify(merged, null, 2)}\n`,
      `Merge MCP servers into ${AGENT_DISPLAY_NAMES[target.agent]} config`
    );
  }

  const text = await readTextIfExists(capabilities.mcp.path);
  if (text.warning) {
    return undefined;
  }
  let root: Record<string, unknown> = {};
  if (text.value) {
    try {
      const parsed = TOML.parse(text.value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        root = parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }
  }

  const currentServers = objectValue(root[capabilities.mcp.key]);
  const mergedServers = { ...currentServers };
  for (const server of sourceServers) {
    mergedServers[server.name] = toNativeMcpServer(server);
  }
  const merged = { ...root, [capabilities.mcp.key]: mergedServers };
  return generatedFile(
    target.agent,
    displayPath(capabilities.mcp.path, context.cwd, context.homeDir),
    TOML.stringify(merged),
    `Merge MCP servers into ${AGENT_DISPLAY_NAMES[target.agent]} config`
  );
}

function toNativeMcpServer(server: CanonicalMcpServer): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  if (server.transport !== "stdio") {
    output.transport = server.transport;
  }
  if (server.command) {
    output.command = redactSecrets(server.command);
  }
  if (server.args?.length) {
    output.args = server.args.map((arg) => redactSecrets(arg));
  }
  if (server.url) {
    output.url = redactSecrets(server.url);
  }
  if (server.env && Object.keys(server.env).length > 0) {
    output.env = Object.fromEntries(
      Object.entries(server.env).map(([key, value]) => [
        key,
        shouldPreserveEnvValue(key, value) ? value : `\${${key}}`,
      ])
    );
  }
  if (server.disabled !== undefined) {
    output.disabled = server.disabled;
  }
  return output;
}

function shouldPreserveEnvValue(key: string, value: string): boolean {
  if (isEnvReference(value)) {
    return true;
  }

  const findings = scanUnknownForSecrets(value, key);
  return findings.length === 0;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mcpComparable(server: CanonicalMcpServer): Record<string, unknown> {
  return {
    name: server.name,
    transport: server.transport,
    command: server.command,
    args: server.args,
    url: server.url,
    env: server.env,
    disabled: server.disabled,
  };
}

function targetMcpConfigWarning(
  target: CanonicalAgentSetup,
  configPath: string,
  context: AdapterContext
): string | undefined {
  const display = displayPath(configPath, context.cwd, context.homeDir);
  return target.warnings.find(
    (warning) =>
      (warning.includes(configPath) || warning.includes(display)) &&
      /(Invalid JSON|Invalid TOML|Could not read)/.test(warning)
  );
}

function mergeGeneratedFiles(files: GeneratedFile[]): GeneratedFile[] {
  const merged = new Map<string, GeneratedFile>();
  for (const file of files) {
    const existing = merged.get(file.path);
    if (!existing) {
      merged.set(file.path, file);
      continue;
    }

    merged.set(file.path, {
      ...existing,
      content: `${existing.content.trimEnd()}\n\n${file.content.trimStart()}`,
      reason: `${existing.reason}; ${file.reason}`,
    });
  }
  return [...merged.values()];
}

export function highestRisk(...risks: RiskLevel[]): RiskLevel {
  const rank: Record<RiskLevel, number> = {
    low: 0,
    medium: 1,
    high: 2,
    dangerous: 3,
  };
  return risks.reduce((highest, risk) => (rank[risk] > rank[highest] ? risk : highest), "low");
}
