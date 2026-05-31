import path from "node:path";
import fs from "fs-extra";
import { describe, expect, it } from "vitest";
import { applyPortPlan, buildPortPlan } from "../src/core/planner.js";
import { generateFilesForTarget, planChangesForTarget } from "../src/core/plan-rules.js";
import type {
  CanonicalCommand,
  CanonicalCustomAgent,
  CanonicalHook,
  CanonicalRule,
  CanonicalSkill,
} from "../src/core/model.js";
import { instruction, makeTempProject, mcpServer, permission, setup, testContext } from "./helpers.js";

describe("planner", () => {
  it("adds missing instruction files and skips equivalent instructions", () => {
    const { cwd, homeDir } = { cwd: "/tmp/project", homeDir: "/tmp/home" };
    const context = testContext(cwd, homeDir);
    const sourceInstruction = instruction("claude", "Use tests.");

    const addChanges = planChangesForTarget(
      setup("claude", [sourceInstruction]),
      setup("codex", []),
      context
    );
    expect(addChanges).toContainEqual(
      expect.objectContaining({ type: "add", componentKind: "instruction", path: "AGENTS.md" })
    );

    const skipChanges = planChangesForTarget(
      setup("claude", [sourceInstruction]),
      setup("codex", [instruction("codex", "Use tests.", "AGENTS.md")]),
      context
    );
    expect(skipChanges).toContainEqual(
      expect.objectContaining({ type: "skip", componentKind: "instruction" })
    );
  });

  it("creates approximate artifacts and warns for high-risk components", () => {
    const context = testContext("/tmp/project", "/tmp/home");
    const skill: CanonicalSkill = {
      id: "skill:release-notes",
      kind: "skill",
      title: "release-notes",
      source: { agent: "claude", path: ".claude/skills/release-notes/SKILL.md" },
      portability: "approximate",
      risk: "low",
      warnings: [],
      name: "release-notes",
      description: "Write release notes.",
      content: "Summarize merged changes.",
      files: [".claude/skills/release-notes/SKILL.md"],
    };
    const agent: CanonicalCustomAgent = {
      id: "agent:security",
      kind: "custom-agent",
      title: "security-reviewer",
      source: { agent: "claude", path: ".claude/agents/security-reviewer.md" },
      portability: "approximate",
      risk: "low",
      warnings: [],
      name: "security-reviewer",
      description: "Reviews security-sensitive code.",
      systemPrompt: "Find auth and secret handling bugs.",
      files: [".claude/agents/security-reviewer.md"],
    };
    const command: CanonicalCommand = {
      id: "command:review",
      kind: "command",
      title: "/review",
      source: { agent: "claude", path: ".claude/commands/review.md" },
      portability: "approximate",
      risk: "medium",
      warnings: [],
      name: "/review",
      prompt: "Review this diff.",
      files: [".claude/commands/review.md"],
    };
    const hook: CanonicalHook = {
      id: "hook:pre-tool-use",
      kind: "hook",
      title: "pre-tool-use",
      source: { agent: "claude", path: ".claude/settings.json" },
      portability: "manual",
      risk: "high",
      warnings: [],
      name: "pre-tool-use",
      event: "pre-tool-use",
      command: "echo ghp_not-a-real-token-for-testing-1234567",
    };

    const changes = planChangesForTarget(
      setup("claude", [skill, agent, command, hook]),
      setup("gemini", []),
      context
    );

    expect(changes).toContainEqual(
      expect.objectContaining({ type: "approximate", componentKind: "skill" })
    );
    expect(changes).toContainEqual(
      expect.objectContaining({ type: "approximate", componentKind: "custom-agent" })
    );
    expect(changes).toContainEqual(
      expect.objectContaining({ type: "approximate", componentKind: "command" })
    );
    expect(changes).toContainEqual(
      expect.objectContaining({
        type: "manual-review",
        componentKind: "hook",
        detail: "command: echo [REDACTED_SECRET]",
      })
    );
  });

  it("uses the configured generated directory for approximate artifacts", async () => {
    const context = testContext("/tmp/project", "/tmp/home");
    context.generatedDir = "custom-generated";
    const skill: CanonicalSkill = {
      id: "skill:release-notes",
      kind: "skill",
      title: "release-notes",
      source: { agent: "claude", path: ".claude/skills/release-notes/SKILL.md" },
      portability: "approximate",
      risk: "low",
      warnings: [],
      name: "release-notes",
      description: "Write release notes.",
      content: "Summarize merged changes.",
      files: [".claude/skills/release-notes/SKILL.md"],
    };

    const changes = planChangesForTarget(
      setup("claude", [skill]),
      setup("gemini", []),
      context
    );
    expect(changes).toContainEqual(
      expect.objectContaining({
        type: "approximate",
        path: path.join("custom-generated", "gemini", "skills", "release-notes.md"),
      })
    );

    const files = await generateFilesForTarget(
      setup("claude", [skill]),
      setup("gemini", []),
      changes,
      context
    );
    expect(files).toContainEqual(
      expect.objectContaining({
        path: path.join("custom-generated", "gemini", "skills", "release-notes.md"),
      })
    );
  });

  it("generates instruction artifacts for generated-only targets", async () => {
    const context = testContext("/tmp/project", "/tmp/home");
    const sourceInstruction = instruction("claude", "Use tests.");
    const changes = planChangesForTarget(
      setup("claude", [sourceInstruction]),
      setup("antigravity", []),
      context
    );

    expect(changes).toContainEqual(
      expect.objectContaining({
        type: "approximate",
        componentKind: "instruction",
        path: path.join(".agent-port", "generated", "antigravity", "instructions", "claude.md"),
      })
    );

    const files = await generateFilesForTarget(
      setup("claude", [sourceInstruction]),
      setup("antigravity", []),
      changes,
      context
    );
    expect(files).toContainEqual(
      expect.objectContaining({
        path: path.join(".agent-port", "generated", "antigravity", "instructions", "claude.md"),
        content: "Use tests.\n",
      })
    );
  });

  it("preserves Cursor rule scoping and writes separate generated rule files", async () => {
    const context = testContext("/tmp/project", "/tmp/home");
    const rules: CanonicalRule[] = [
      {
        id: "rule:one",
        kind: "rule",
        title: "Typescript",
        source: { agent: "claude", path: ".cursor/rules/typescript.mdc" },
        portability: "native",
        risk: "low",
        warnings: [],
        content: "Use strict types.",
        globs: ["src/**/*.ts"],
        alwaysApply: false,
      },
      {
        id: "rule:two",
        kind: "rule",
        title: "Tests",
        source: { agent: "claude", path: ".cursor/rules/tests.mdc" },
        portability: "native",
        risk: "low",
        warnings: [],
        content: "Add focused tests.",
      },
    ];
    const source = setup("claude", rules);
    const target = setup("cursor", []);
    const changes = planChangesForTarget(source, target, context);
    const files = await generateFilesForTarget(source, target, changes, context);

    expect(new Set(files.map((file) => file.path)).size).toBe(2);
    expect(files.every((file) => file.path.startsWith(path.join(".cursor", "rules")))).toBe(true);
    const scopedRule = files.find((file) => file.content.includes("Use strict types."));
    expect(scopedRule?.content).toContain('globs: ["src/**/*.ts"]');
    expect(scopedRule?.content).toContain("alwaysApply: false");
    expect(scopedRule?.content).not.toContain("alwaysApply: true");
  });

  it("plans MCP add, skip, update, unsupported transport, and permission expansion", () => {
    const context = testContext("/tmp/project", "/tmp/home");
    const github = mcpServer("claude", "github", { env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" } });
    const changedGithub = mcpServer("gemini", "github", { args: ["different"] });
    const unsupported = mcpServer("claude", "legacy", { transport: "unknown" });
    const source = setup("claude", [
      github,
      unsupported,
      permission("claude", { approvalMode: "never" }),
    ]);

    const addChanges = planChangesForTarget(source, setup("gemini", []), context);
    expect(addChanges).toContainEqual(
      expect.objectContaining({ type: "add", componentKind: "mcp-server", title: expect.stringContaining("github") })
    );
    expect(addChanges).toContainEqual(
      expect.objectContaining({ type: "manual-review", title: expect.stringContaining("legacy") })
    );
    expect(addChanges).toContainEqual(
      expect.objectContaining({ type: "manual-review", componentKind: "permission" })
    );

    const skipChanges = planChangesForTarget(source, setup("gemini", [github]), context);
    expect(skipChanges).toContainEqual(
      expect.objectContaining({ type: "skip", componentKind: "mcp-server", title: expect.stringContaining("github") })
    );

    const updateChanges = planChangesForTarget(source, setup("gemini", [changedGithub]), context);
    expect(updateChanges).toContainEqual(
      expect.objectContaining({ type: "update", componentKind: "mcp-server", title: expect.stringContaining("github") })
    );
  });

  it("preserves unrelated target config fields when applying MCP changes", async () => {
    const { cwd, homeDir } = await makeTempProject();
    await fs.writeFile(path.join(cwd, "CLAUDE.md"), "Use tests.\n");
    await fs.ensureDir(path.join(cwd, ".claude"));
    await fs.writeJson(path.join(cwd, ".claude", "settings.json"), {
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: { GITHUB_TOKEN: "${GITHUB_TOKEN}" },
        },
      },
    });
    await fs.ensureDir(path.join(cwd, ".gemini"));
    await fs.writeJson(path.join(cwd, ".gemini", "settings.json"), {
      theme: "dark",
      mcpServers: {
        existing: { command: "node", args: ["server.js"] },
      },
    });

    const context = testContext(cwd, homeDir);
    const plan = await buildPortPlan({
      cwd,
      homeDir,
      source: "claude",
      targets: ["gemini"],
      dryRun: true,
    });

    await applyPortPlan(plan, { ...context, dryRun: false });
    const written = await fs.readJson(path.join(cwd, ".gemini", "settings.json"));
    expect(written.theme).toBe("dark");
    expect(written.mcpServers.existing.command).toBe("node");
    expect(written.mcpServers.github.env.GITHUB_TOKEN).toBe("${GITHUB_TOKEN}");
    expect(await fs.pathExists(path.join(cwd, "GEMINI.md"))).toBe(true);
  });

  it("does not overwrite malformed target MCP config", async () => {
    const { cwd, homeDir } = await makeTempProject();
    await fs.ensureDir(path.join(cwd, ".claude"));
    await fs.writeJson(path.join(cwd, ".claude", "settings.json"), {
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
        },
      },
    });
    await fs.ensureDir(path.join(cwd, ".gemini"));
    await fs.writeFile(path.join(cwd, ".gemini", "settings.json"), "{ invalid json");

    const context = testContext(cwd, homeDir);
    const plan = await buildPortPlan({
      cwd,
      homeDir,
      source: "claude",
      targets: ["gemini"],
      dryRun: true,
    });

    expect(plan.changes).toContainEqual(
      expect.objectContaining({
        type: "manual-review",
        componentKind: "mcp-server",
        title: expect.stringContaining("github"),
      })
    );
    expect(plan.generatedFiles.some((file) => file.path === ".gemini/settings.json")).toBe(
      false
    );

    await applyPortPlan(plan, { ...context, dryRun: false });
    expect(await fs.readFile(path.join(cwd, ".gemini", "settings.json"), "utf8")).toBe(
      "{ invalid json"
    );
  });
});
