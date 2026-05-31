import { describe, expect, it } from "vitest";
import {
  detectSecretsInString,
  redactSecrets,
  sanitizeUnknownSecrets,
  scanComponentForSecrets,
  scanUnknownForSecrets,
} from "../src/core/secrets.js";
import type { CanonicalCommand, CanonicalHook, CanonicalMcpServer, CanonicalSettings } from "../src/core/model.js";

describe("secret scanner", () => {
  it("detects common token prefixes and ignores env references", () => {
    expect(detectSecretsInString("sk-not-a-real-token-1234567")).toHaveLength(1);
    expect(detectSecretsInString("ghp_not-a-real-token-for-testing-1234567")).toHaveLength(1);
    expect(detectSecretsInString("github_pat_not-a-real-token-for-testing-1234567")).toHaveLength(1);
    expect(detectSecretsInString("xoxb-not-a-real-token-for-testing-1234567")).toHaveLength(1);
    expect(
      detectSecretsInString("AWS_SECRET_ACCESS_KEY=not-a-real-token-for-testing-1234567")
    ).toHaveLength(1);
    expect(detectSecretsInString("${GITHUB_TOKEN}")).toHaveLength(0);
  });

  it("detects token-looking values in settings, hooks, MCP env, and command args", () => {
    const settings: CanonicalSettings = {
      id: "settings:test",
      kind: "settings",
      title: "settings",
      source: { agent: "claude", path: "settings.json", format: "json" },
      portability: "native",
      risk: "low",
      warnings: [],
      values: { apiKey: "sk-not-a-real-token-1234567" },
    };
    const hook: CanonicalHook = {
      id: "hook:test",
      kind: "hook",
      title: "hook",
      source: { agent: "claude", path: "settings.json", format: "json" },
      portability: "manual",
      risk: "high",
      warnings: [],
      name: "pre-tool-use",
      event: "pre-tool-use",
      command: "echo ghp_not-a-real-token-for-testing-1234567",
    };
    const server: CanonicalMcpServer = {
      id: "mcp:test",
      kind: "mcp-server",
      title: "github",
      source: { agent: "claude", path: "settings.json", format: "json" },
      portability: "native",
      risk: "low",
      warnings: [],
      name: "github",
      transport: "stdio",
      command: "npx",
      env: { GITHUB_TOKEN: "ghp_not-a-real-token-for-testing-1234567" },
    };
    const command: CanonicalCommand = {
      id: "command:test",
      kind: "command",
      title: "/ship",
      source: { agent: "claude", path: "commands/ship.md", format: "markdown" },
      portability: "approximate",
      risk: "medium",
      warnings: [],
      name: "/ship",
      args: ["--token", "xoxb-not-a-real-token-for-testing-1234567"],
      files: ["commands/ship.md"],
    };

    expect(scanComponentForSecrets(settings)).toHaveLength(1);
    expect(scanComponentForSecrets(hook)).toHaveLength(1);
    expect(scanComponentForSecrets(server)).toHaveLength(1);
    expect(scanComponentForSecrets(command)).toHaveLength(1);
    expect(scanUnknownForSecrets({ token: "${SAFE_REFERENCE}" })).toHaveLength(0);
  });

  it("detects and sanitizes long values under sensitive structured keys", () => {
    const config = {
      apiKey: "not-a-real-token-for-testing-1234567",
      nested: {
        password: "not-a-real-token-for-testing-1234567",
        token: "${SAFE_REFERENCE}",
      },
    };

    expect(scanUnknownForSecrets(config, "settings")).toHaveLength(2);
    expect(sanitizeUnknownSecrets(config)).toEqual({
      apiKey: "[REDACTED_SECRET]",
      nested: {
        password: "[REDACTED_SECRET]",
        token: "${SAFE_REFERENCE}",
      },
    });
  });

  it("keeps structured content parseable when redacting assignment values", () => {
    const redacted = redactSecrets(
      '{"apiKey":"not-a-real-token-for-testing-1234567","safe":"ok"}'
    );

    expect(JSON.parse(redacted)).toEqual({
      apiKey: "[REDACTED_SECRET]",
      safe: "ok",
    });
    expect(
      redactSecrets("AWS_SECRET_ACCESS_KEY=not-a-real-token-for-testing-1234567")
    ).toBe("AWS_SECRET_ACCESS_KEY=[REDACTED_SECRET]");
  });
});
