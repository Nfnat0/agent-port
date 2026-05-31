import path from "node:path";
import fg from "fast-glob";
import fs from "fs-extra";
import * as TOML from "@iarna/toml";
import {
  type AdapterContext,
  type AgentAdapter,
  type AgentId,
  type CanonicalAgentSetup,
  type CanonicalCommand,
  type CanonicalCustomAgent,
  type CanonicalEnvReference,
  type CanonicalInstruction,
  type CanonicalMcpServer,
  type CanonicalPermission,
  type CanonicalRule,
  type CanonicalSettings,
  type CanonicalSetupComponent,
  type DetectionResult,
  type PortabilityLevel,
  type RiskLevel,
  type SetupComponentKind,
  type SourceLocation,
  type TransportType,
  AGENT_DISPLAY_NAMES,
} from "../core/model.js";
import { displayPath, listExistingPaths, readJsonIfExists, readTextIfExists } from "../core/fs.js";
import { contentHash, slugify } from "../core/fingerprints.js";
import { generateFilesForTarget, planChangesForTarget } from "../core/plan-rules.js";
import {
  extractEnvReferences,
  scanUnknownForSecrets,
} from "../core/secrets.js";
import { assessHookRisk, assessMcpServerRisk, unsupportedTransportWarning } from "../core/safety.js";

export interface CommonAdapterOptions {
  id: AgentId;
  displayName: string;
  detectPaths(context: AdapterContext): string[];
  readComponents(context: AdapterContext): Promise<ReadComponentsResult>;
}

export interface ReadComponentsResult {
  components: CanonicalSetupComponent[];
  configPaths: string[];
  warnings: string[];
}

export function createCommonAdapter(options: CommonAdapterOptions): AgentAdapter {
  return {
    id: options.id,
    displayName: options.displayName,
    async detect(context) {
      const existing = await listExistingPaths(options.detectPaths(context));
      return {
        detected: existing.length > 0,
        paths: existing.map((item) => displayPath(item, context.cwd, context.homeDir)),
        warnings: [],
      };
    },
    async read(context) {
      const result = await options.readComponents(context);
      const envReferences = envReferenceComponents(options.id, result.components);
      const detected = result.configPaths.length > 0 || result.components.length > 0;
      return {
        agent: options.id,
        displayName: options.displayName,
        detected,
        configPaths: result.configPaths.map((item) =>
          displayPath(item, context.cwd, context.homeDir)
        ),
        components: dedupeComponents([...result.components, ...envReferences]),
        warnings: result.warnings,
      };
    },
    async planApply(source, target, context) {
      return planChangesForTarget(source, target, context);
    },
    async generateFiles(source, target, changes, context) {
      return generateFilesForTarget(source, target, changes, context);
    },
  };
}

export function sourceLocation(
  agent: AgentId,
  filePath: string,
  context: AdapterContext
): SourceLocation {
  return {
    agent,
    path: displayPath(filePath, context.cwd, context.homeDir),
    format: formatForPath(filePath),
  };
}

export async function readInstruction(
  agent: AgentId,
  filePath: string,
  context: AdapterContext,
  title = path.basename(filePath)
): Promise<{ component?: CanonicalInstruction; warning?: string }> {
  const text = await readTextIfExists(filePath);
  if (text.warning) {
    return { warning: text.warning };
  }
  if (text.value === undefined) {
    return {};
  }

  const component: CanonicalInstruction = {
    ...baseComponent(agent, "instruction", title, filePath, context, "native", "low"),
    content: text.value,
  };
  return { component };
}

export async function readRuleFile(
  agent: AgentId,
  filePath: string,
  context: AdapterContext
): Promise<{ component?: CanonicalRule; warning?: string }> {
  const text = await readTextIfExists(filePath);
  if (text.warning) {
    return { warning: text.warning };
  }
  if (text.value === undefined) {
    return {};
  }

  const parsed = parseFrontmatter(text.value);
  const title = String(parsed.metadata.description ?? path.basename(filePath));
  const globs = stringArray(parsed.metadata.globs);
  const component: CanonicalRule = {
    ...baseComponent(agent, "rule", title, filePath, context, "native", "low"),
    content: parsed.body,
    globs,
    alwaysApply: booleanValue(parsed.metadata.alwaysApply),
    raw: parsed.metadata,
  };
  return { component };
}

export async function readJsonSettings(
  agent: AgentId,
  filePath: string,
  context: AdapterContext,
  title = `${AGENT_DISPLAY_NAMES[agent]} settings`
): Promise<{
  components: CanonicalSetupComponent[];
  warnings: string[];
}> {
  const json = await readJsonIfExists(filePath);
  if (json.warning) {
    return { components: [], warnings: [json.warning] };
  }
  if (!json.value) {
    return { components: [], warnings: [] };
  }

  const warnings = secretWarnings(title, json.value);
  const settings: CanonicalSettings = {
    ...baseComponent(agent, "settings", title, filePath, context, "native", warnings.length ? "high" : "low"),
    values: json.value,
    raw: json.value,
    warnings,
  };

  return {
    components: [
      settings,
      ...mcpServersFromConfig(agent, filePath, json.value, context),
      ...permissionsFromConfig(agent, filePath, json.value, context),
      ...hooksFromConfig(agent, filePath, json.value, context),
    ],
    warnings,
  };
}

export async function readTomlSettings(
  agent: AgentId,
  filePath: string,
  context: AdapterContext,
  title = `${AGENT_DISPLAY_NAMES[agent]} settings`
): Promise<{
  components: CanonicalSetupComponent[];
  warnings: string[];
}> {
  const text = await readTextIfExists(filePath);
  if (text.warning) {
    return { components: [], warnings: [text.warning] };
  }
  if (text.value === undefined) {
    return { components: [], warnings: [] };
  }

  try {
    const parsed = TOML.parse(text.value);
    const values =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    const warnings = secretWarnings(title, values);
    const settings: CanonicalSettings = {
      ...baseComponent(agent, "settings", title, filePath, context, "native", warnings.length ? "high" : "low"),
      values,
      raw: values,
      warnings,
    };

    return {
      components: [
        settings,
        ...mcpServersFromConfig(agent, filePath, values, context),
        ...permissionsFromConfig(agent, filePath, values, context),
        ...profilesFromCodexConfig(agent, filePath, values, context),
      ],
      warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { components: [], warnings: [`Invalid TOML in ${filePath}: ${message}`] };
  }
}

export async function readMarkdownCollection(options: {
  agent: AgentId;
  context: AdapterContext;
  roots: string[];
  kind: "skill" | "custom-agent" | "command";
}): Promise<{ components: CanonicalSetupComponent[]; configPaths: string[]; warnings: string[] }> {
  const components: CanonicalSetupComponent[] = [];
  const configPaths: string[] = [];
  const warnings: string[] = [];

  for (const root of options.roots) {
    if (!(await fs.pathExists(root))) {
      continue;
    }
    configPaths.push(root);
    const files = await fg(
      options.kind === "skill" ? ["**/SKILL.md", "**/skill.md"] : ["**/*.md", "**/*.mdc"],
      {
      cwd: root,
      absolute: true,
      dot: true,
      onlyFiles: true,
      }
    );

    for (const file of files) {
      const text = await readTextIfExists(file);
      if (text.warning) {
        warnings.push(text.warning);
        continue;
      }
      if (text.value === undefined) {
        continue;
      }
      const parsed = parseFrontmatter(text.value);
      const name = nameForCollectionFile(root, file, options.kind, parsed.metadata);
      const description =
        stringValue(parsed.metadata.description) ?? firstUsefulLine(parsed.body);
      const filesList = [displayPath(file, options.context.cwd, options.context.homeDir)];

      if (options.kind === "skill") {
        components.push({
          ...baseComponent(
            options.agent,
            "skill",
            name,
            file,
            options.context,
            "approximate",
            description ? "low" : "medium"
          ),
          name,
          description,
          content: parsed.body,
          files: filesList,
          metadata: parsed.metadata,
        });
      }

      if (options.kind === "custom-agent") {
        components.push({
          ...baseComponent(
            options.agent,
            "custom-agent",
            name,
            file,
            options.context,
            "approximate",
            description ? "low" : "medium"
          ),
          name,
          description,
          systemPrompt: parsed.body,
          allowedTools: stringArray(
            parsed.metadata.allowedTools ??
              parsed.metadata["allowed-tools"] ??
              parsed.metadata.tools
          ),
          activationHints: stringArray(parsed.metadata.activationHints ?? parsed.metadata["activation-hints"]),
          files: filesList,
          metadata: parsed.metadata,
        } satisfies CanonicalCustomAgent);
      }

      if (options.kind === "command") {
        const commandName = name.startsWith("/") ? name : `/${name}`;
        components.push({
          ...baseComponent(
            options.agent,
            "command",
            commandName,
            file,
            options.context,
            "approximate",
            "medium"
          ),
          name: commandName,
          description,
          prompt: parsed.body,
          files: filesList,
        } satisfies CanonicalCommand);
      }
    }
  }

  return { components, configPaths, warnings };
}

export function mcpServersFromConfig(
  agent: AgentId,
  filePath: string,
  config: Record<string, unknown>,
  context: AdapterContext
): CanonicalMcpServer[] {
  const serverGroups = [
    objectValue(config.mcpServers),
    objectValue(config.servers),
    objectValue(config.mcp_servers),
  ].filter((group) => Object.keys(group).length > 0);

  return serverGroups.flatMap((servers) =>
    Object.entries(servers).map(([name, value]) => {
      const server = objectValue(value);
      const env = stringRecord(server.env);
      const transport = transportType(
        stringValue(server.transport ?? server.type) ??
          (server.url ? "http" : server.command ? "stdio" : "unknown")
      );
      const warnings = [
        ...secretWarnings(`MCP server ${name}`, server),
        ...(unsupportedTransportWarning(transport) ? [unsupportedTransportWarning(transport)!] : []),
      ];
      const component: CanonicalMcpServer = {
        ...baseComponent(
          agent,
          "mcp-server",
          name,
          filePath,
          context,
          transport === "unknown" ? "manual" : "native",
          warnings.length ? "medium" : "low"
        ),
        name,
        transport,
        command: stringValue(server.command),
        args: stringArray(server.args),
        url: stringValue(server.url),
        env,
        disabled: booleanValue(server.disabled),
        raw: server,
        warnings,
      };
      return { ...component, risk: assessMcpServerRisk(component) };
    })
  );
}

export function permissionsFromConfig(
  agent: AgentId,
  filePath: string,
  config: Record<string, unknown>,
  context: AdapterContext
): CanonicalPermission[] {
  const approvalMode = stringValue(
    config.approvalMode ?? config.approval_mode ?? config.approvalPolicy ?? config.approval_policy
  );
  const sandboxMode = stringValue(config.sandboxMode ?? config.sandbox_mode);
  const allow = stringArray(config.allow ?? config.allowedTools ?? config.includeTools);
  const deny = stringArray(config.deny ?? config.deniedTools ?? config.excludeTools);

  if (!approvalMode && !sandboxMode && allow.length === 0 && deny.length === 0) {
    return [];
  }

  return [
    {
      ...baseComponent(agent, "permission", "Tool permissions", filePath, context, "manual", "medium"),
      name: "tool-permissions",
      allow,
      deny,
      approvalMode,
      sandboxMode,
      raw: { approvalMode, sandboxMode, allow, deny },
    },
  ];
}

export function hooksFromConfig(
  agent: AgentId,
  filePath: string,
  config: Record<string, unknown>,
  context: AdapterContext
): CanonicalSetupComponent[] {
  const hooks = objectValue(config.hooks);
  return Object.entries(hooks).flatMap(([event, value]) => {
    const entries = Array.isArray(value) ? value : [value];
    return entries.map((entry, index) => {
      const hook = objectValue(entry);
      const command =
        stringValue(hook.command ?? hook.cmd) ??
        (typeof entry === "string" ? entry : undefined);
      const component = {
        ...baseComponent(
          agent,
          "hook",
          `${event}${entries.length > 1 ? ` ${index + 1}` : ""}`,
          filePath,
          context,
          "manual",
          "high"
        ),
        name: `${event}${entries.length > 1 ? `-${index + 1}` : ""}`,
        event,
        command,
        args: stringArray(hook.args),
        content: typeof entry === "string" ? entry : undefined,
        raw: entry,
      };
      return { ...component, risk: assessHookRisk(component) };
    });
  });
}

export function profilesFromCodexConfig(
  agent: AgentId,
  filePath: string,
  config: Record<string, unknown>,
  context: AdapterContext
): CanonicalCustomAgent[] {
  const profiles = objectValue(config.profiles ?? config.profile);
  return Object.entries(profiles).map(([name, value]) => {
    const profile = objectValue(value);
    return {
      ...baseComponent(agent, "custom-agent", name, filePath, context, "approximate", "low"),
      name,
      description: stringValue(profile.description),
      systemPrompt: stringValue(profile.instructions ?? profile.systemPrompt ?? profile.prompt),
      allowedTools: stringArray(profile.allowedTools ?? profile.tools),
      activationHints: [`Use Codex profile "${name}".`],
      files: [displayPath(filePath, context.cwd, context.homeDir)],
      metadata: profile,
    };
  });
}

export function baseComponent<TKind extends SetupComponentKind>(
  agent: AgentId,
  kind: TKind,
  title: string,
  filePath: string,
  context: AdapterContext,
  portability: PortabilityLevel,
  risk: RiskLevel
): Extract<CanonicalSetupComponent, { kind: TKind }> extends never
  ? never
  : {
      id: string;
      kind: TKind;
      title: string;
      source: SourceLocation;
      portability: PortabilityLevel;
      risk: RiskLevel;
      warnings: string[];
    } {
  const display = displayPath(filePath, context.cwd, context.homeDir);
  return {
    id: `${kind}:${slugify(title)}:${contentHash(`${agent}:${display}`)}`,
    kind,
    title,
    source: sourceLocation(agent, filePath, context),
    portability,
    risk,
    warnings: [],
  } as Extract<CanonicalSetupComponent, { kind: TKind }> extends never
    ? never
    : {
        id: string;
        kind: TKind;
        title: string;
        source: SourceLocation;
        portability: PortabilityLevel;
        risk: RiskLevel;
        warnings: string[];
      };
}

export function parseFrontmatter(content: string): {
  metadata: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) {
    return { metadata: {}, body: content };
  }

  const metadata: Record<string, unknown> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) {
      continue;
    }
    const raw = pair[2].trim();
    if (raw.startsWith("[") && raw.endsWith("]")) {
      metadata[pair[1]] = raw
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else if (raw === "true" || raw === "false") {
      metadata[pair[1]] = raw === "true";
    } else {
      metadata[pair[1]] = raw.replace(/^["']|["']$/g, "");
    }
  }

  return { metadata, body: content.slice(match[0].length) };
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  const object = objectValue(value);
  const entries = Object.entries(object).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string"
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function transportType(value: string): TransportType {
  if (value === "stdio" || value === "sse" || value === "http" || value === "streamable-http") {
    return value;
  }
  return "unknown";
}

function formatForPath(filePath: string): SourceLocation["format"] {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".json") {
    return "json";
  }
  if (extension === ".toml") {
    return "toml";
  }
  if (extension === ".yaml" || extension === ".yml") {
    return "yaml";
  }
  if (extension === ".md" || extension === ".mdc") {
    return "markdown";
  }
  return "unknown";
}

function firstUsefulLine(content: string): string | undefined {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^#+\s*/, ""))
    .find((line) => line.length > 0 && !line.startsWith("---"));
}

function nameForCollectionFile(
  root: string,
  file: string,
  kind: "skill" | "custom-agent" | "command",
  metadata: Record<string, unknown>
): string {
  const metadataName = stringValue(metadata.name);
  if (metadataName) {
    return metadataName;
  }

  const parsed = path.parse(file);
  if (kind === "skill" && parsed.name.toLowerCase() === "skill") {
    return path.basename(path.dirname(file));
  }

  const relative = path.relative(root, file);
  return relative.replace(/\.(md|mdc)$/i, "").split(path.sep).join("/");
}

function secretWarnings(title: string, value: unknown): string[] {
  return scanUnknownForSecrets(value, title).map(
    (finding) => `${title} contains ${finding.reason} at ${finding.path}`
  );
}

function envReferenceComponents(
  agent: AgentId,
  components: CanonicalSetupComponent[]
): CanonicalEnvReference[] {
  const references = new Map<string, Set<string>>();

  for (const component of components) {
    const serialized = JSON.stringify(component.raw ?? component);
    for (const name of extractEnvReferences(serialized)) {
      if (!references.has(name)) {
        references.set(name, new Set());
      }
      references.get(name)!.add(component.id);
    }
  }

  return [...references.entries()].map(([name, usedBy]) => ({
    id: `env-reference:${name}`,
    kind: "env-reference",
    title: name,
    source: {
      agent,
      path: "environment",
      format: "unknown",
    },
    portability: "manual",
    risk: "medium",
    warnings: [],
    name,
    required: true,
    usedBy: [...usedBy],
  }));
}

function dedupeComponents(
  components: CanonicalSetupComponent[]
): CanonicalSetupComponent[] {
  const seen = new Set<string>();
  const output: CanonicalSetupComponent[] = [];
  for (const component of components) {
    if (seen.has(component.id)) {
      continue;
    }
    seen.add(component.id);
    output.push(component);
  }
  return output;
}

export async function collectConfigPaths(paths: string[]): Promise<string[]> {
  const existing = await listExistingPaths(paths);
  return existing;
}

export function detectionFromPaths(paths: string[]): DetectionResult {
  return {
    detected: paths.length > 0,
    paths,
    warnings: [],
  };
}
