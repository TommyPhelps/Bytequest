import type { SqlDriver } from "./driver.ts";

export interface Migration {
  version: number;
  name: string;
  sql: string[];
}

/**
 * Versioned schema. Each entry upgrades the database by one version and runs
 * inside a single transaction. Never edit a shipped migration: append a new one.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial lab",
    sql: [
      `CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
      `CREATE TABLE runs (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        tier TEXT NOT NULL CHECK (tier IN ('rookie','apprentice','operator','expert','nightmare')),
        requested_tier TEXT NOT NULL,
        seed TEXT NOT NULL,
        lang TEXT,
        title TEXT NOT NULL,
        discipline TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','shelved')),
        snapshot TEXT NOT NULL,
        project_path TEXT,
        notes TEXT NOT NULL DEFAULT '',
        steps_done TEXT NOT NULL DEFAULT '[]',
        verify_done TEXT NOT NULL DEFAULT '[]',
        hints_shown INTEGER NOT NULL DEFAULT 0,
        answers_revealed INTEGER NOT NULL DEFAULT 0,
        reflection TEXT NOT NULL DEFAULT '{}',
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      )`,
      `CREATE INDEX runs_status ON runs(status, updated_at)`,
      `CREATE INDEX runs_template ON runs(template_id)`,
      `CREATE TABLE evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('note','result','path','link')),
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX evidence_run ON evidence(run_id)`,
      `CREATE TABLE concept_progress (
        concept_id TEXT PRIMARY KEY,
        familiarity INTEGER CHECK (familiarity IS NULL OR familiarity BETWEEN 0 AND 3),
        confidence INTEGER CHECK (confidence IS NULL OR confidence BETWEEN 1 AND 5),
        exposures INTEGER NOT NULL DEFAULT 0,
        demonstrated INTEGER NOT NULL DEFAULT 0,
        recalled INTEGER NOT NULL DEFAULT 0,
        mistakes TEXT NOT NULL DEFAULT '',
        last_practiced TEXT,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
        template_id TEXT NOT NULL,
        concepts TEXT NOT NULL DEFAULT '[]',
        prompt TEXT NOT NULL,
        answer TEXT NOT NULL,
        due_at TEXT NOT NULL,
        interval_days REAL NOT NULL DEFAULT 1,
        last_result TEXT CHECK (last_result IS NULL OR last_result IN ('missed','shaky','solid')),
        times_reviewed INTEGER NOT NULL DEFAULT 0,
        times_postponed INTEGER NOT NULL DEFAULT 0,
        retired INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX reviews_due ON reviews(retired, due_at)`,
      `CREATE TABLE journal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        built TEXT NOT NULL DEFAULT '',
        went_wrong TEXT NOT NULL DEFAULT '',
        fixed TEXT NOT NULL DEFAULT '',
        learned TEXT NOT NULL DEFAULT '',
        unclear TEXT NOT NULL DEFAULT '',
        next_try TEXT NOT NULL DEFAULT '',
        links TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE link_checks (
        resource_id TEXT PRIMARY KEY,
        ok INTEGER NOT NULL,
        status INTEGER,
        final_url TEXT,
        error TEXT,
        checked_at TEXT NOT NULL
      )`,
    ],
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/** Tables included in backups, in an order that satisfies foreign keys on restore. */
export const BACKUP_TABLES = ["settings", "runs", "evidence", "concept_progress", "reviews", "journal", "link_checks"] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

export async function currentVersion(db: SqlDriver): Promise<number> {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`,
  );
  const rows = await db.select<{ v: number | null }>(`SELECT MAX(version) AS v FROM schema_migrations`);
  return rows[0]?.v ?? 0;
}

/**
 * Applies every migration newer than the database. Each migration and its
 * bookkeeping row commit together, so a crash never leaves a half-upgraded DB.
 */
export async function migrate(db: SqlDriver, migrations: Migration[] = MIGRATIONS): Promise<{ from: number; to: number }> {
  const from = await currentVersion(db);
  const newest = migrations.length ? migrations[migrations.length - 1].version : 0;
  if (from > newest) {
    throw new Error(
      `This database is from a newer BYTEQUEST (schema v${from}; this build knows v${newest}). Update the app instead of downgrading.`,
    );
  }
  let to = from;
  for (const m of migrations) {
    if (m.version <= from) continue;
    if (m.version !== to + 1) throw new Error(`Migration gap: expected v${to + 1}, found v${m.version}`);
    await db.batch([
      ...m.sql.map((sql) => ({ sql })),
      {
        sql: `INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`,
        params: [m.version, m.name, new Date().toISOString()],
      },
    ]);
    to = m.version;
  }
  return { from, to };
}
