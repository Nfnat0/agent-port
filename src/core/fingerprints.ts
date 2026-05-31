import { createHash } from "node:crypto";

export function normalizeContent(value: unknown): string {
  if (typeof value === "string") {
    return value.replace(/\r\n/g, "\n").trim();
  }

  return JSON.stringify(sortObject(value));
}

export function contentHash(value: unknown): string {
  return createHash("sha256")
    .update(normalizeContent(value))
    .digest("hex")
    .slice(0, 16);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unnamed";
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortObject(item)])
    );
  }

  return value;
}
