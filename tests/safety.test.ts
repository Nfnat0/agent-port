import { describe, expect, it } from "vitest";
import {
  assessHookRisk,
  assessMcpServerRisk,
  isPermissionExpansion,
  shouldBlockMemoryCopy,
} from "../src/core/safety.js";
import type { CanonicalHook, CanonicalMemory, CanonicalMcpServer } from "../src/core/model.js";
import { permission } from "./helpers.js";

describe("safety", () => {
  it("marks executable hooks as high or dangerous risk", () => {
    const hook: CanonicalHook = {
      id: "hook:test",
      kind: "hook",
      title: "pre-tool-use",
      source: { agent: "claude", path: "settings.json", format: "json" },
      portability: "manual",
      risk: "medium",
      warnings: [],
      name: "pre-tool-use",
      event: "pre-tool-use",
      command: "npm install && npm test",
    };

    expect(["high", "dangerous"]).toContain(assessHookRisk(hook));
  });

  it("marks broad filesystem MCP paths as high risk", () => {
    const server: CanonicalMcpServer = {
      id: "mcp:filesystem",
      kind: "mcp-server",
      title: "filesystem",
      source: { agent: "claude", path: "settings.json", format: "json" },
      portability: "native",
      risk: "low",
      warnings: [],
      name: "filesystem",
      transport: "stdio",
      command: "mcp-filesystem",
      args: ["/Users/nf"],
    };

    expect(assessMcpServerRisk(server)).toBe("high");
  });

  it("detects permission expansion and blocks personal memories by default", () => {
    expect(
      isPermissionExpansion(permission("claude", { allow: ["*"] }), permission("codex"))
    ).toBe(true);

    const memory: CanonicalMemory = {
      id: "memory:user",
      kind: "memory",
      title: "user memory",
      source: { agent: "claude", path: "~/.claude/memory.md", format: "markdown" },
      portability: "manual",
      risk: "high",
      warnings: [],
      content: "personal preference",
      scope: "user",
    };
    expect(shouldBlockMemoryCopy(memory)).toBe(true);
  });
});
