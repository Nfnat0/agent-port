import { listAdapters } from "../adapters/index.js";
import type { AdapterContext, CanonicalSetupComponent } from "./model.js";
import { scanComponentForSecrets } from "./secrets.js";
import {
  assessHookRisk,
  assessMcpServerRisk,
  assessPermissionRisk,
  hasBroadFilesystemPath,
  unsupportedTransportWarning,
} from "./safety.js";

export interface DoctorItem {
  status: "ok" | "warn";
  message: string;
}

export async function runDoctor(context: AdapterContext): Promise<DoctorItem[]> {
  const items: DoctorItem[] = [];

  for (const adapter of listAdapters()) {
    const setup = await adapter.read(context);
    if (setup.detected) {
      items.push({ status: "ok", message: `${setup.displayName} config is readable` });
    } else {
      items.push({ status: "warn", message: `${setup.displayName} config path not found` });
    }

    for (const warning of setup.warnings) {
      items.push({ status: "warn", message: warning });
    }

    const seen = new Set<string>();
    for (const component of setup.components) {
      if (seen.has(component.id)) {
        items.push({
          status: "warn",
          message: `Duplicate setup component ID ${component.id}`,
        });
      }
      seen.add(component.id);
      items.push(...inspectComponent(component));
    }
  }

  return items.length > 0 ? items : [{ status: "ok", message: "No setup files found" }];
}

function inspectComponent(component: CanonicalSetupComponent): DoctorItem[] {
  const items: DoctorItem[] = [];
  for (const finding of scanComponentForSecrets(component)) {
    items.push({
      status: "warn",
      message: `${component.title} contains ${finding.reason} at ${finding.path}`,
    });
  }

  if (component.kind === "env-reference" && component.required && !process.env[component.name]) {
    items.push({
      status: "warn",
      message: `${component.name} is referenced but not set in the environment`,
    });
  }

  if (component.kind === "hook") {
    const risk = assessHookRisk(component);
    if (risk === "high" || risk === "dangerous") {
      items.push({
        status: "warn",
        message: `Hook "${component.name}" runs a ${risk} command`,
      });
    }
  }

  if (component.kind === "mcp-server") {
    const warning = unsupportedTransportWarning(component.transport);
    if (warning) {
      items.push({ status: "warn", message: warning });
    }
    if (assessMcpServerRisk(component) === "high") {
      items.push({
        status: "warn",
        message: `MCP server "${component.name}" may expose broad filesystem access`,
      });
    }
    const searchable = [component.command, component.args?.join(" "), component.url]
      .filter(Boolean)
      .join(" ");
    if (hasBroadFilesystemPath(searchable)) {
      items.push({
        status: "warn",
        message: `MCP server "${component.name}" references a broad filesystem path`,
      });
    }
  }

  if (component.kind === "permission" && assessPermissionRisk(component) === "high") {
    items.push({
      status: "warn",
      message: `Permission "${component.name}" can broaden target access`,
    });
  }

  if (component.kind === "custom-agent" && (!component.name || !component.description)) {
    items.push({
      status: "warn",
      message: `Custom agent "${component.name || component.title}" is missing a name or description`,
    });
  }

  if (component.kind === "skill" && !component.description) {
    items.push({
      status: "warn",
      message: `Skill "${component.name}" is missing a description`,
    });
  }

  return items;
}
