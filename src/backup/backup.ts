import type { SqlDriver, SqlValue, Statement } from "../db/driver.ts";
import { BACKUP_TABLES, LATEST_VERSION, currentVersion, type BackupTable } from "../db/schema.ts";
import { SECRET_PREFIX } from "../db/repo.ts";

// JSON backup and restore. A backup is a plain, readable JSON file with every
// user table. Credentials (settings keys starting with "secret.") are never
// exported, and a restore never touches them either.

export const BACKUP_FORMAT = "bytequest-backup";
export const BACKUP_FORMAT_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  tables: Record<BackupTable, Record<string, SqlValue>[]>;
}

export async function exportBackup(db: SqlDriver, appVersion: string): Promise<Backup> {
  const tables = {} as Backup["tables"];
  for (const t of BACKUP_TABLES) {
    const rows =
      t === "settings"
        ? await db.select<Record<string, SqlValue>>(`SELECT * FROM settings WHERE key NOT LIKE ? ORDER BY key`, [`${SECRET_PREFIX}%`])
        : await db.select<Record<string, SqlValue>>(`SELECT * FROM ${t}`);
    tables[t] = rows;
  }
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: await currentVersion(db),
    appVersion,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

export function backupFileName(at: Date = new Date()): string {
  return `bytequest-backup-${at.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
}

export interface BackupSummary {
  ok: boolean;
  errors: string[];
  counts: Partial<Record<BackupTable, number>>;
  exportedAt?: string;
}

/** Checks a parsed file before anything is changed. */
export function inspectBackup(data: unknown): BackupSummary {
  const errors: string[] = [];
  const counts: BackupSummary["counts"] = {};
  if (!data || typeof data !== "object") return { ok: false, errors: ["Not a JSON object."], counts };
  const b = data as Partial<Backup>;
  if (b.format !== BACKUP_FORMAT) errors.push("This isn't a BYTEQUEST backup file.");
  if (typeof b.formatVersion !== "number" || b.formatVersion > BACKUP_FORMAT_VERSION) errors.push("Backup format is newer than this app understands.");
  if (typeof b.schemaVersion !== "number") errors.push("Missing schema version.");
  else if (b.schemaVersion > LATEST_VERSION) errors.push(`Backup is from a newer BYTEQUEST (schema v${b.schemaVersion}); update the app first.`);
  if (!b.tables || typeof b.tables !== "object") errors.push("Missing tables.");
  else {
    for (const t of BACKUP_TABLES) {
      const rows = (b.tables as Record<string, unknown>)[t];
      if (rows === undefined) continue; // older backups may lack newer tables
      if (!Array.isArray(rows) || rows.some((r) => !r || typeof r !== "object" || Array.isArray(r))) {
        errors.push(`Table '${t}' is malformed.`);
        continue;
      }
      counts[t] = rows.length;
    }
  }
  return { ok: errors.length === 0, errors, counts, exportedAt: typeof b.exportedAt === "string" ? b.exportedAt : undefined };
}

async function columnsOf(db: SqlDriver, table: string): Promise<Set<string>> {
  const rows = await db.select<{ name: string }>(`SELECT name FROM pragma_table_info(?)`, [table]);
  return new Set(rows.map((r) => r.name));
}

function asSql(v: unknown): SqlValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return JSON.stringify(v);
}

/**
 * Replaces all user data with the backup's contents in one transaction:
 * either everything is restored or nothing changes. Only columns that exist in
 * the current schema are written (unknown keys in the file are ignored), so a
 * crafted file cannot inject SQL through column names.
 */
export async function restoreBackup(db: SqlDriver, data: unknown): Promise<BackupSummary> {
  const summary = inspectBackup(data);
  if (!summary.ok) return summary;
  const b = data as Backup;
  const stmts: Statement[] = [];
  for (const t of [...BACKUP_TABLES].reverse()) {
    stmts.push(t === "settings" ? { sql: `DELETE FROM settings WHERE key NOT LIKE ?`, params: [`${SECRET_PREFIX}%`] } : { sql: `DELETE FROM ${t}` });
  }
  for (const t of BACKUP_TABLES) {
    const rows = (b.tables[t] ?? []) as Record<string, unknown>[];
    if (!rows.length) continue;
    const allowed = await columnsOf(db, t);
    for (const row of rows) {
      if (t === "settings" && typeof row.key === "string" && row.key.startsWith(SECRET_PREFIX)) continue;
      const cols = Object.keys(row).filter((k) => allowed.has(k));
      if (!cols.length) continue;
      stmts.push({
        sql: `INSERT INTO ${t} (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
        params: cols.map((c) => asSql(row[c])),
      });
    }
  }
  try {
    await db.batch(stmts);
  } catch (e) {
    return { ok: false, errors: [`Restore failed and nothing was changed: ${(e as Error).message}`], counts: summary.counts };
  }
  return summary;
}
