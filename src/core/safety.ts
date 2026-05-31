import type {
  CanonicalHook,
  CanonicalMemory,
  CanonicalMcpServer,
  CanonicalPermission,
  CanonicalSetupComponent,
  RiskLevel,
} from "./model.js";

const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-rf\b/,
  /\bchmod\s+-R\b/,
  /\bchown\s+-R\b/,
  /\bcurl\b.*\|\s*(?:sh|bash)\b/,
  /\bwget\b.*\|\s*(?:sh|bash)\b/,
  /\b(?:npm|pnpm|yarn|bun|pip|pipx|brew)\s+(?:install|add|upgrade|update)\b/,
  /\bgit\s+push\b/,
  /\bmkfs\b/,
];

const HIGH_RISK_COMMAND_PATTERNS = [
  /\bcurl\b/,
  /\bwget\b/,
  /\bssh\b/,
  /\bscp\b/,
  /\brsync\b/,
  />/,
  /&&/,
  /\|\|/,
];

export function assessComponentRisk(
  component: CanonicalSetupComponent
): RiskLevel {
  switch (component.kind) {
    case "hook":
      return assessHookRisk(component);
    case "mcp-server":
      return assessMcpServerRisk(component);
    case "permission":
      return assessPermissionRisk(component);
    case "memory":
      return assessMemoryRisk(component);
    default:
      return component.risk;
  }
}

export function assessHookRisk(hook: CanonicalHook): RiskLevel {
  const command = [hook.command, hook.args?.join(" "), hook.content]
    .filter(Boolean)
    .join(" ");

  if (DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(command))) {
    return "dangerous";
  }

  if (command || HIGH_RISK_COMMAND_PATTERNS.some((pattern) => pattern.test(command))) {
    return "high";
  }

  return "medium";
}

export function assessMcpServerRisk(server: CanonicalMcpServer): RiskLevel {
  const searchable = [server.command, server.args?.join(" "), server.url]
    .filter(Boolean)
    .join(" ");

  if (hasBroadFilesystemPath(searchable)) {
    return "high";
  }

  if (server.transport === "unknown") {
    return "medium";
  }

  return server.risk;
}

export function assessPermissionRisk(permission: CanonicalPermission): RiskLevel {
  if (
    permission.allow?.some((value) => value === "*" || value === "all") ||
    permission.approvalMode === "never" ||
    permission.sandboxMode === "danger-full-access"
  ) {
    return "high";
  }

  return permission.risk;
}

export function assessMemoryRisk(memory: CanonicalMemory): RiskLevel {
  if (memory.scope === "user" || memory.scope === "unknown") {
    return "high";
  }

  return "medium";
}

export function hasBroadFilesystemPath(value: string): boolean {
  return /(?:^|\s)(?:\/|~|\/Users\/[^/\s]+)(?:\s|$)/.test(value);
}

export function isPermissionExpansion(
  source: CanonicalPermission,
  target?: CanonicalPermission
): boolean {
  if (source.approvalMode === "never" && target?.approvalMode !== "never") {
    return true;
  }

  if (
    source.sandboxMode === "danger-full-access" &&
    target?.sandboxMode !== "danger-full-access"
  ) {
    return true;
  }

  const targetAllows = new Set(target?.allow ?? []);
  return (source.allow ?? []).some(
    (allowed) => allowed === "*" || allowed === "all" || !targetAllows.has(allowed)
  );
}

export function shouldBlockMemoryCopy(memory: CanonicalMemory): boolean {
  return memory.scope !== "project";
}

export function unsupportedTransportWarning(transport: string): string | undefined {
  if (["stdio", "sse", "http", "streamable-http"].includes(transport)) {
    return undefined;
  }

  return `Unsupported MCP transport "${transport}" requires manual review.`;
}
