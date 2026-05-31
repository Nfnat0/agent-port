export type AgentId =
  | "claude"
  | "codex"
  | "gemini"
  | "cursor"
  | "copilot"
  | "antigravity";

export type PortabilityLevel =
  | "native"
  | "approximate"
  | "manual"
  | "unsupported";

export type SetupComponentKind =
  | "settings"
  | "instruction"
  | "rule"
  | "memory"
  | "skill"
  | "custom-agent"
  | "command"
  | "hook"
  | "mcp-server"
  | "permission"
  | "env-reference";

export type RiskLevel = "low" | "medium" | "high" | "dangerous";

export interface SourceLocation {
  agent: AgentId;
  path: string;
  format?: "json" | "toml" | "yaml" | "markdown" | "directory" | "unknown";
}

export interface CanonicalSetupComponentBase {
  id: string;
  kind: SetupComponentKind;
  title: string;
  source: SourceLocation;
  portability: PortabilityLevel;
  risk: RiskLevel;
  raw?: unknown;
  warnings: string[];
}

export interface CanonicalSettings extends CanonicalSetupComponentBase {
  kind: "settings";
  values: Record<string, unknown>;
}

export interface CanonicalInstruction extends CanonicalSetupComponentBase {
  kind: "instruction";
  content: string;
}

export interface CanonicalRule extends CanonicalSetupComponentBase {
  kind: "rule";
  content: string;
  globs?: string[];
  alwaysApply?: boolean;
}

export interface CanonicalMemory extends CanonicalSetupComponentBase {
  kind: "memory";
  content: string;
  scope: "project" | "user" | "unknown";
}

export interface CanonicalSkill extends CanonicalSetupComponentBase {
  kind: "skill";
  name: string;
  description?: string;
  content?: string;
  files: string[];
  metadata?: Record<string, unknown>;
}

export interface CanonicalCustomAgent extends CanonicalSetupComponentBase {
  kind: "custom-agent";
  name: string;
  description?: string;
  systemPrompt?: string;
  allowedTools?: string[];
  activationHints?: string[];
  files: string[];
  metadata?: Record<string, unknown>;
}

export interface CanonicalCommand extends CanonicalSetupComponentBase {
  kind: "command";
  name: string;
  description?: string;
  prompt?: string;
  command?: string;
  args?: string[];
  files: string[];
}

export interface CanonicalHook extends CanonicalSetupComponentBase {
  kind: "hook";
  name: string;
  event: string;
  command?: string;
  args?: string[];
  content?: string;
}

export type TransportType =
  | "stdio"
  | "sse"
  | "http"
  | "streamable-http"
  | "unknown";

export interface CanonicalMcpServer extends CanonicalSetupComponentBase {
  kind: "mcp-server";
  name: string;
  transport: TransportType;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  disabled?: boolean;
}

export interface CanonicalPermission extends CanonicalSetupComponentBase {
  kind: "permission";
  name: string;
  allow?: string[];
  deny?: string[];
  approvalMode?: string;
  sandboxMode?: string;
}

export interface CanonicalEnvReference extends CanonicalSetupComponentBase {
  kind: "env-reference";
  name: string;
  required: boolean;
  usedBy: string[];
}

export type CanonicalSetupComponent =
  | CanonicalSettings
  | CanonicalInstruction
  | CanonicalRule
  | CanonicalMemory
  | CanonicalSkill
  | CanonicalCustomAgent
  | CanonicalCommand
  | CanonicalHook
  | CanonicalMcpServer
  | CanonicalPermission
  | CanonicalEnvReference;

export interface CanonicalAgentSetup {
  agent: AgentId;
  displayName: string;
  detected: boolean;
  configPaths: string[];
  components: CanonicalSetupComponent[];
  warnings: string[];
}

export interface Change {
  type:
    | "add"
    | "update"
    | "skip"
    | "warn"
    | "create-file"
    | "manual-review"
    | "approximate";
  target: AgentId;
  componentKind: SetupComponentKind;
  title: string;
  detail?: string;
  path?: string;
  componentId?: string;
  risk: RiskLevel;
  portability: PortabilityLevel;
}

export interface PortPlan {
  source: CanonicalAgentSetup;
  targets: CanonicalAgentSetup[];
  changes: Change[];
  generatedFiles: GeneratedFile[];
}

export interface GeneratedFile {
  target: AgentId;
  path: string;
  content: string;
  reason: string;
}

export interface DetectionResult {
  detected: boolean;
  paths: string[];
  warnings: string[];
}

export interface AdapterContext {
  cwd: string;
  homeDir: string;
  dryRun: boolean;
  yes: boolean;
  generatedDir: string;
  categories: SetupComponentKind[];
}

export interface ApplyResult {
  filesWritten: string[];
  backupsCreated: string[];
  warnings: string[];
}

export interface AgentAdapter {
  id: AgentId;
  displayName: string;

  detect(context: AdapterContext): Promise<DetectionResult>;

  read(context: AdapterContext): Promise<CanonicalAgentSetup>;

  planApply(
    source: CanonicalAgentSetup,
    target: CanonicalAgentSetup,
    context: AdapterContext
  ): Promise<Change[]>;

  generateFiles?(
    source: CanonicalAgentSetup,
    target: CanonicalAgentSetup,
    changes: Change[],
    context: AdapterContext
  ): Promise<GeneratedFile[]>;

  apply?(plan: PortPlan, context: AdapterContext): Promise<ApplyResult>;
}

export const AGENT_IDS = [
  "claude",
  "codex",
  "gemini",
  "cursor",
  "copilot",
  "antigravity",
] as const satisfies readonly AgentId[];

export const DEFAULT_CATEGORIES = [
  "settings",
  "instruction",
  "rule",
  "memory",
  "skill",
  "custom-agent",
  "command",
  "hook",
  "mcp-server",
  "permission",
  "env-reference",
] as const satisfies readonly SetupComponentKind[];

export const AGENT_DISPLAY_NAMES: Record<AgentId, string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  cursor: "Cursor",
  copilot: "GitHub Copilot",
  antigravity: "Antigravity",
};
