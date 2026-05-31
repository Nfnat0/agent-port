import type {
  CanonicalSetupComponent,
  CanonicalMcpServer,
  CanonicalCommand,
  CanonicalHook,
} from "./model.js";

export interface SecretFinding {
  path: string;
  valuePreview: string;
  reason: string;
}

const SECRET_PATTERNS: Array<{ reason: string; regex: RegExp }> = [
  { reason: "OpenAI-style sk token", regex: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { reason: "GitHub classic token", regex: /\bghp_[A-Za-z0-9_]{20,}\b/g },
  {
    reason: "GitHub fine-grained token",
    regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  },
  { reason: "Slack bot token", regex: /\bxoxb-[A-Za-z0-9-]{16,}\b/g },
  {
    reason: "token-looking literal",
    regex:
      /\b(?:api[_-]?key|secret|token|password)\b["'\s:=]+["']?[A-Za-z0-9_./+=-]{20,}/gi,
  },
];

const ENV_REFERENCE_PATTERN = /\$\{[A-Za-z_][A-Za-z0-9_]*\}/g;

export function isEnvReference(value: string): boolean {
  return /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(value.trim());
}

export function extractEnvReferences(value: string): string[] {
  return [...value.matchAll(ENV_REFERENCE_PATTERN)].map((match) =>
    match[0].slice(2, -1)
  );
}

export function detectSecretsInString(
  value: string,
  path = "value"
): SecretFinding[] {
  if (isEnvReference(value)) {
    return [];
  }

  const findings: SecretFinding[] = [];
  for (const pattern of SECRET_PATTERNS) {
    pattern.regex.lastIndex = 0;
    for (const match of value.matchAll(pattern.regex)) {
      const token = match[0];
      if (isEnvReference(token)) {
        continue;
      }
      findings.push({
        path,
        valuePreview: previewSecret(token),
        reason: pattern.reason,
      });
    }
  }

  return findings;
}

export function scanUnknownForSecrets(
  value: unknown,
  path = "value"
): SecretFinding[] {
  if (typeof value === "string") {
    return detectSecretsInString(value, path);
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      scanUnknownForSecrets(item, `${path}[${index}]`)
    );
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, item]) => scanUnknownForSecrets(item, `${path}.${key}`)
    );
  }

  return [];
}

export function scanComponentForSecrets(
  component: CanonicalSetupComponent
): SecretFinding[] {
  switch (component.kind) {
    case "mcp-server":
      return scanMcpServer(component);
    case "command":
      return scanCommand(component);
    case "hook":
      return scanHook(component);
    case "settings":
      return scanUnknownForSecrets(component.values, component.title);
    default:
      return scanUnknownForSecrets(component.raw ?? component, component.title);
  }
}

export function redactSecrets(value: string): string {
  let output = value;
  for (const pattern of SECRET_PATTERNS) {
    pattern.regex.lastIndex = 0;
    output = output.replace(pattern.regex, "[REDACTED_SECRET]");
  }
  return output;
}

export function sanitizeUnknownSecrets(value: unknown): unknown {
  if (typeof value === "string") {
    return isEnvReference(value) ? value : redactSecrets(value);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeUnknownSecrets);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sanitizeUnknownSecrets(item),
      ])
    );
  }

  return value;
}

function scanMcpServer(component: CanonicalMcpServer): SecretFinding[] {
  return [
    ...scanUnknownForSecrets(component.env, `${component.name}.env`),
    ...scanUnknownForSecrets(component.args, `${component.name}.args`),
    ...detectSecretsInString(component.command ?? "", `${component.name}.command`),
    ...detectSecretsInString(component.url ?? "", `${component.name}.url`),
  ];
}

function scanCommand(component: CanonicalCommand): SecretFinding[] {
  return [
    ...detectSecretsInString(component.prompt ?? "", `${component.name}.prompt`),
    ...detectSecretsInString(component.command ?? "", `${component.name}.command`),
    ...scanUnknownForSecrets(component.args, `${component.name}.args`),
  ];
}

function scanHook(component: CanonicalHook): SecretFinding[] {
  return [
    ...detectSecretsInString(component.content ?? "", `${component.name}.content`),
    ...detectSecretsInString(component.command ?? "", `${component.name}.command`),
    ...scanUnknownForSecrets(component.args, `${component.name}.args`),
  ];
}

function previewSecret(value: string): string {
  if (value.length <= 12) {
    return "[REDACTED_SECRET]";
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
