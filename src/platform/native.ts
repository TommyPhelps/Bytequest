import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { SqlDriver, SqlValue, Statement } from "../db/driver.ts";
import type { GenFile } from "../core/types.ts";
import type { EditorTool } from "../db/repo.ts";
import type { LinkStatus } from "../core/catalog/resources.ts";

// Everything that talks to Rust lives here. The rest of the UI only sees
// plain async functions.

export const tauriDriver: SqlDriver = {
  select: (sql, params) => invoke("db_select", { sql, params: params ?? [] }),
  execute: (sql, params) => invoke("db_execute", { sql, params: params ?? [] }),
  batch: (statements: Statement[]) =>
    invoke("db_batch", { statements: statements.map((s) => ({ sql: s.sql, params: (s.params ?? []) as SqlValue[] })) }),
};

export interface AppInfo {
  version: string;
  dataDir: string;
  dbPath: string;
  backupsDir: string;
  defaultLabRoot: string;
}

export const appInfo = () => invoke<AppInfo>("app_info");

export async function pickFolder(title: string): Promise<string | null> {
  const r = await openDialog({ directory: true, multiple: false, title });
  return typeof r === "string" ? r : null;
}

export async function pickJsonFile(title: string): Promise<string | null> {
  const r = await openDialog({ multiple: false, title, filters: [{ name: "JSON", extensions: ["json"] }] });
  return typeof r === "string" ? r : null;
}

export async function pickSavePath(title: string, defaultPath: string, ext: string): Promise<string | null> {
  return await saveDialog({ title, defaultPath, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
}

export const readTextFile = (path: string) => invoke<string>("read_text_file", { path });
export const writeTextFile = (path: string, contents: string) => invoke<void>("write_text_file", { path, contents });
export const writeSafetyBackup = (name: string, contents: string) => invoke<string>("write_safety_backup", { name, contents });

export interface PrepareResult {
  folder: string;
  written: string[];
  skipped: string[];
}

export const labPrepare = (root: string, folder: string, files: Pick<GenFile, "name" | "content">[], overwrite: boolean) =>
  invoke<PrepareResult>("lab_prepare", { root, folder, files: files.map((f) => ({ name: f.name, content: f.content })), overwrite });

export const labOpen = (path: string, tool: EditorTool) => invoke<string>("lab_open", { path, tool });
export const pathExists = (path: string) => invoke<boolean>("path_exists", { path });

export async function checkLink(url: string): Promise<LinkStatus> {
  const r = await invoke<{ ok: boolean; status: number | null; finalUrl: string | null; error: string | null }>("check_link", { url });
  return { ok: r.ok, status: r.status, finalUrl: r.finalUrl ?? undefined, error: r.error ?? undefined, checkedAt: new Date().toISOString() };
}

export async function openExternal(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) throw new Error("Only web links can be opened.");
  await openUrl(url);
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
