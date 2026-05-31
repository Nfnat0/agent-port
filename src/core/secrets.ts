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

const DIRECT_SECRET_PATTERNS: Array<{ reason: string; regex: RegExp }> = [
  { reason: "OpenAI-style sk token", regex: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { reason: "GitHub classic token", regex: /\bghp_[A-Za-z0-9_]{20,}\b/g },
  {
    reason: "GitHub fine-grained token",
    regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  },
  { reason: "Slack bot token", regex: /\bxoxb-[A-Za-z0-9-]{16,}\b/g },
];

const SECRET_ASSIGNMENT_PATTERN =
  /\b(([A-Za-z0-9_-]*(?:api[_-]?key|secret|token|password)[A-Za-z0-9_-]*)["'\s:=]+["']?)([A-Za-z0-9_./+=-]{20,})/gi;
const ENV_REFERENCE_PATTERN = /\$\{[A-Za-z_][A-Za-z0-9_]*\}/g;
const SECRET_VALUE_PATTERN = /^[A-Za-z0-9_./+=-]{20,}$/;

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
  const seenTokens = new Set<string>();
  for (const pattern of DIRECT_SECRET_PATTERNS) {
    pattern.regex.lastIndex = 0;
    for (const match of value.matchAll(pattern.regex)) {
      const token = match[0];
      if (isEnvReference(token)) {
        continue;
      }
      if (seenTokens.has(token)) {
        continue;
      }
      seenTokens.add(token);
      findings.push({
        path,
        valuePreview: previewSecret(token),
        reason: pattern.reason,
      });
    }
  }
  SECRET_ASSIGNMENT_PATTERN.lastIndex = 0;
  for (const match of value.matchAll(SECRET_ASSIGNMENT_PATTERN)) {
    const token = match[3];
    if (isEnvReference(token)) {
      continue;
    }
    if (seenTokens.has(token)) {
      continue;
    }
    seenTokens.add(token);
    findings.push({
      path,
      valuePreview: previewSecret(token),
      reason: "token-looking literal",
    });
  }

  if (
    findings.length === 0 &&
    hasSensitivePathSegment(path) &&
    isSecretLikeValue(value)
  ) {
    findings.push({
      path,
      valuePreview: previewSecret(value.trim()),
      reason: "token-looking literal",
    });
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
  let findings: SecretFinding[];
  switch (component.kind) {
    case "mcp-server":
      findings = scanMcpServer(component);
      break;
    case "command":
      findings = scanCommand(component);
      break;
    case "hook":
      findings = scanHook(component);
      break;
    case "settings":
      findings = scanUnknownForSecrets(component.values, component.title);
      break;
    default:
      findings = scanUnknownForSecrets(component.raw ?? component, component.title);
  }
  return dedupeFindings(findings);
}

export function redactSecrets(value: string): string {
  let output = value;
  for (const pattern of DIRECT_SECRET_PATTERNS) {
    pattern.regex.lastIndex = 0;
    output = output.replace(pattern.regex, "[REDACTED_SECRET]");
  }
  SECRET_ASSIGNMENT_PATTERN.lastIndex = 0;
  output = output.replace(
    SECRET_ASSIGNMENT_PATTERN,
    (_match, prefix: string) => `${prefix}[REDACTED_SECRET]`
  );
  return output;
}

export function sanitizeUnknownSecrets(value: unknown): unknown {
  return sanitizeUnknownSecretsAtPath(value, "value");
}

function sanitizeUnknownSecretsAtPath(value: unknown, path: string): unknown {
  if (typeof value === "string") {
    if (isEnvReference(value)) {
      return value;
    }
    if (hasSensitivePathSegment(path) && isSecretLikeValue(value)) {
      return "[REDACTED_SECRET]";
    }
    return redactSecrets(value);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeUnknownSecretsAtPath(item, `${path}[${index}]`));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sanitizeUnknownSecretsAtPath(item, `${path}.${key}`),
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
    ...scanUnknownForSecrets(component.raw, `${component.name}.raw`),
  ];
}

function previewSecret(value: string): string {
  if (value.length <= 12) {
    return "[REDACTED_SECRET]";
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function hasSensitivePathSegment(path: string): boolean {
  return path
    .split(/[.[\]]+/)
    .filter(Boolean)
    .some((segment) => /api[_-]?key|secret|token|password/i.test(segment));
}

function isSecretLikeValue(value: string): boolean {
  return SECRET_VALUE_PATTERN.test(value.trim());
}

function dedupeFindings(findings: SecretFinding[]): SecretFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.reason}:${finding.valuePreview}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
