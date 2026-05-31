import path from "node:path";
import fs from "fs-extra";

export interface ReadResult<T> {
  value?: T;
  warning?: string;
}

export function resolvePath(cwd: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
}

export function displayPath(filePath: string, cwd: string, homeDir: string): string {
  const absolute = path.resolve(filePath);
  const relative = path.relative(cwd, absolute);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative || ".";
  }

  const homeRelative = path.relative(homeDir, absolute);
  if (homeRelative && !homeRelative.startsWith("..") && !path.isAbsolute(homeRelative)) {
    return path.join("~", homeRelative);
  }

  return absolute;
}

export async function pathExists(filePath: string): Promise<boolean> {
  return fs.pathExists(filePath);
}

export async function readTextIfExists(filePath: string): Promise<ReadResult<string>> {
  if (!(await fs.pathExists(filePath))) {
    return {};
  }

  try {
    return { value: await fs.readFile(filePath, "utf8") };
  } catch (error) {
    return { warning: `Could not read ${filePath}: ${stringifyError(error)}` };
  }
}

export async function readJsonIfExists(
  filePath: string
): Promise<ReadResult<Record<string, unknown>>> {
  const text = await readTextIfExists(filePath);
  if (text.warning || text.value === undefined) {
    return { warning: text.warning };
  }

  try {
    const parsed = JSON.parse(text.value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { value: parsed as Record<string, unknown> };
    }
    return { warning: `${filePath} did not contain a JSON object.` };
  } catch (error) {
    return { warning: `Invalid JSON in ${filePath}: ${stringifyError(error)}` };
  }
}

export async function writeTextWithBackup(
  filePath: string,
  content: string
): Promise<{ backup?: string }> {
  await fs.ensureDir(path.dirname(filePath));
  let backup: string | undefined;

  if (await fs.pathExists(filePath)) {
    backup = backupPath(filePath);
    await fs.copy(filePath, backup, { overwrite: false });
  }

  await fs.writeFile(filePath, content, "utf8");
  return { backup };
}

export async function writeJsonWithBackup(
  filePath: string,
  value: unknown
): Promise<{ backup?: string }> {
  return writeTextWithBackup(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function backupPath(filePath: string, date = new Date()): string {
  const timestamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");

  return `${filePath}.agent-port-backup-${timestamp}`;
}

export async function listExistingPaths(paths: string[]): Promise<string[]> {
  const existing: string[] = [];
  for (const candidate of paths) {
    if (await fs.pathExists(candidate)) {
      existing.push(candidate);
    }
  }
  return existing;
}

export async function readDirectoryFiles(
  files: string[]
): Promise<Array<{ path: string; content: string; warning?: string }>> {
  const output: Array<{ path: string; content: string; warning?: string }> = [];
  for (const filePath of files) {
    const text = await readTextIfExists(filePath);
    if (text.value !== undefined) {
      output.push({ path: filePath, content: text.value });
    } else if (text.warning) {
      output.push({ path: filePath, content: "", warning: text.warning });
    }
  }
  return output;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
