import type { SqlDriver, Statement } from "./driver.ts";
import type { DisciplineId, HintLevel, MissionInstance, Tier, Hardware } from "../core/types.ts";
import type { ConceptState } from "../core/missions/engine.ts";
import { firstInterval, grade, postpone, addDays, type RecallResult } from "../core/recall.ts";
import type { LinkStatus } from "../core/catalog/resources.ts";

// All reads and writes of user data go through this file, so the same code
// runs against rusqlite in the app and node:sqlite in the tests.

export type ThemeId = "phosphor" | "midnight" | "amber" | "gothic" | "classic" | "mono";
export type Density = "compact" | "comfortable" | "spacious";
export type EditorTool = "vscode" | "nvim" | "vim" | "terminal" | "explorer";

export interface Settings {
  theme: ThemeId;
  density: Density;
  textScale: number;
  defaultTier: Tier;
  hintLevel: HintLevel;
  labRoot: string;
  editor: EditorTool;
  languages: string[];
  hasLinux: boolean;
  hardware: Hardware[];
  allowSimulated: boolean;
  offlineOnly: boolean;
  favorites: DisciplineId[];
  maxMinutes: number | null;
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "phosphor",
  density: "comfortable",
  textScale: 1,
  defaultTier: "apprentice",
  hintLevel: "standard",
  labRoot: "",
  editor: "vscode",
  languages: ["python"],
  hasLinux: true,
  hardware: [],
  allowSimulated: true,
  offlineOnly: false,
  favorites: [],
  maxMinutes: null,
  onboarded: false,
};

/** Settings whose key starts with this prefix are credentials and never leave the machine in a backup. */
export const SECRET_PREFIX = "secret.";

const now = () => new Date().toISOString();
const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (s === null || s === undefined || s === "") return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

// ---------------- Settings ----------------

export async function loadSettings(db: SqlDriver): Promise<Settings> {
  const rows = await db.select<{ key: string; value: string }>(`SELECT key, value FROM settings WHERE key NOT LIKE '${SECRET_PREFIX}%'`);
  const out: Settings = { ...DEFAULT_SETTINGS };
  const target = out as unknown as Record<string, unknown>;
  for (const r of rows) {
    if (r.key in DEFAULT_SETTINGS) target[r.key] = parseJson(r.value, (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[r.key]);
  }
  return out;
}

export async function saveSetting<K extends keyof Settings>(db: SqlDriver, key: K, value: Settings[K]): Promise<void> {
  await db.execute(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [
    key,
    JSON.stringify(value),
  ]);
}

// ---------------- Runs ----------------

export type RunStatus = "active" | "completed" | "shelved";

export interface Run {
  id: string;
  templateId: string;
  tier: Tier;
  requestedTier: Tier;
  seed: string;
  lang: string | null;
  title: string;
  discipline: DisciplineId;
  status: RunStatus;
  instance: MissionInstance;
  projectPath: string | null;
  notes: string;
  stepsDone: number[];
  verifyDone: number[];
  hintsShown: number;
  answersRevealed: boolean;
  reflection: Record<string, string>;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface RunRow {
  id: string;
  template_id: string;
  tier: Tier;
  requested_tier: Tier;
  seed: string;
  lang: string | null;
  title: string;
  discipline: DisciplineId;
  status: RunStatus;
  snapshot: string;
  project_path: string | null;
  notes: string;
  steps_done: string;
  verify_done: string;
  hints_shown: number;
  answers_revealed: number;
  reflection: string;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

function toRun(r: RunRow): Run {
  return {
    id: r.id,
    templateId: r.template_id,
    tier: r.tier,
    requestedTier: r.requested_tier,
    seed: r.seed,
    lang: r.lang,
    title: r.title,
    discipline: r.discipline,
    status: r.status,
    instance: JSON.parse(r.snapshot) as MissionInstance,
    projectPath: r.project_path,
    notes: r.notes,
    stepsDone: parseJson<number[]>(r.steps_done, []),
    verifyDone: parseJson<number[]>(r.verify_done, []),
    hintsShown: r.hints_shown,
    answersRevealed: r.answers_revealed === 1,
    reflection: parseJson<Record<string, string>>(r.reflection, {}),
    startedAt: r.started_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
  };
}

function bumpExposure(conceptId: string, at: string): Statement {
  return {
    sql: `INSERT INTO concept_progress (concept_id, exposures, last_practiced, updated_at) VALUES (?, 1, ?, ?)
          ON CONFLICT(concept_id) DO UPDATE SET exposures = exposures + 1, last_practiced = excluded.last_practiced, updated_at = excluded.updated_at`,
    params: [conceptId, at, at],
  };
}

/** Accepts a rolled mission. Starting a mission counts as exposure, never as mastery. */
export async function startRun(db: SqlDriver, inst: MissionInstance): Promise<string> {
  const id = uid();
  const at = now();
  await db.batch([
    {
      sql: `INSERT INTO runs (id, template_id, tier, requested_tier, seed, lang, title, discipline, snapshot, started_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [id, inst.templateId, inst.tier, inst.requestedTier, inst.seed, inst.lang, inst.title, inst.discipline, JSON.stringify(inst), at, at],
    },
    ...inst.concepts.map((c) => bumpExposure(c, at)),
  ]);
  return id;
}

export async function getRun(db: SqlDriver, id: string): Promise<Run | null> {
  const rows = await db.select<RunRow>(`SELECT * FROM runs WHERE id = ?`, [id]);
  return rows[0] ? toRun(rows[0]) : null;
}

export async function listRuns(db: SqlDriver, status?: RunStatus): Promise<Run[]> {
  const rows = status
    ? await db.select<RunRow>(`SELECT * FROM runs WHERE status = ? ORDER BY updated_at DESC`, [status])
    : await db.select<RunRow>(`SELECT * FROM runs ORDER BY updated_at DESC`);
  return rows.map(toRun);
}

export interface RunPatch {
  notes?: string;
  stepsDone?: number[];
  verifyDone?: number[];
  hintsShown?: number;
  answersRevealed?: boolean;
  projectPath?: string | null;
  reflection?: Record<string, string>;
}

export async function updateRun(db: SqlDriver, id: string, p: RunPatch): Promise<void> {
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  const add = (col: string, v: string | number | null) => {
    sets.push(`${col} = ?`);
    params.push(v);
  };
  if (p.notes !== undefined) add("notes", p.notes);
  if (p.stepsDone !== undefined) add("steps_done", JSON.stringify(p.stepsDone));
  if (p.verifyDone !== undefined) add("verify_done", JSON.stringify(p.verifyDone));
  if (p.hintsShown !== undefined) add("hints_shown", p.hintsShown);
  if (p.answersRevealed !== undefined) add("answers_revealed", p.answersRevealed ? 1 : 0);
  if (p.projectPath !== undefined) add("project_path", p.projectPath);
  if (p.reflection !== undefined) add("reflection", JSON.stringify(p.reflection));
  if (!sets.length) return;
  add("updated_at", now());
  params.push(id);
  await db.execute(`UPDATE runs SET ${sets.join(", ")} WHERE id = ?`, params);
}

export async function setRunStatus(db: SqlDriver, id: string, status: "active" | "shelved"): Promise<void> {
  await db.execute(`UPDATE runs SET status = ?, updated_at = ? WHERE id = ? AND status != 'completed'`, [status, now(), id]);
}

export async function deleteRun(db: SqlDriver, id: string): Promise<void> {
  await db.execute(`DELETE FROM runs WHERE id = ?`, [id]);
}

export interface Debrief {
  /** Self-rated confidence 1-5 per concept of the mission. */
  confidence: Record<string, number>;
  built: string;
  wentWrong: string;
  fixed: string;
  learned: string;
  unclear: string;
  nextTry: string;
  /** A common mistake to remember, attached to the mission's concepts. */
  mistake: string;
}

export class CompletionError extends Error {}

/**
 * Completes a mission. Demonstrated skill is only recorded when every
 * verification criterion was checked off; that is the rule that keeps
 * "demonstrated" meaningful. Schedules recall prompts and writes a journal entry.
 */
export async function completeRun(db: SqlDriver, id: string, d: Debrief, at: Date = new Date()): Promise<void> {
  const run = await getRun(db, id);
  if (!run) throw new CompletionError("Mission not found.");
  if (run.status === "completed") throw new CompletionError("Mission already completed.");
  const needed = run.instance.variant.verify.length;
  const checked = new Set(run.verifyDone.filter((i) => i >= 0 && i < needed)).size;
  if (checked < needed) {
    throw new CompletionError(`Check off all ${needed} verification criteria first (${checked} done). Shelve it instead if you want to stop for now.`);
  }
  const iso = at.toISOString();
  const confidences = run.instance.concepts.map((c) => d.confidence[c]).filter((x): x is number => typeof x === "number");
  const avgConf = confidences.length ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length) : null;
  const due = addDays(at, firstInterval(avgConf)).toISOString();
  const stmts: Statement[] = [
    { sql: `UPDATE runs SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?`, params: [iso, iso, id] },
  ];
  for (const c of run.instance.concepts) {
    const conf = d.confidence[c] ?? null;
    stmts.push({
      sql: `INSERT INTO concept_progress (concept_id, confidence, demonstrated, last_practiced, mistakes, updated_at) VALUES (?, ?, 1, ?, ?, ?)
            ON CONFLICT(concept_id) DO UPDATE SET
              demonstrated = demonstrated + 1,
              confidence = COALESCE(excluded.confidence, confidence),
              last_practiced = excluded.last_practiced,
              mistakes = CASE WHEN excluded.mistakes = '' THEN mistakes
                              WHEN mistakes = '' THEN excluded.mistakes
                              ELSE mistakes || char(10) || excluded.mistakes END,
              updated_at = excluded.updated_at`,
      params: [c, conf, iso, d.mistake.trim(), iso],
    });
  }
  for (const r of run.instance.recall) {
    stmts.push({
      sql: `INSERT INTO reviews (run_id, template_id, concepts, prompt, answer, due_at, interval_days, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [id, run.templateId, JSON.stringify(run.instance.concepts), r.prompt, r.answer, due, firstInterval(avgConf), iso, iso],
    });
  }
  stmts.push({
    sql: `INSERT INTO journal (run_id, title, built, went_wrong, fixed, learned, unclear, next_try, links, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [id, run.title, d.built, d.wentWrong, d.fixed, d.learned, d.unclear, d.nextTry, run.projectPath ?? "", iso, iso],
  });
  await db.batch(stmts);
}

// ---------------- Evidence ----------------

export type EvidenceKind = "note" | "result" | "path" | "link";
export interface Evidence {
  id: number;
  runId: string;
  kind: EvidenceKind;
  body: string;
  createdAt: string;
}

export async function addEvidence(db: SqlDriver, runId: string, kind: EvidenceKind, body: string): Promise<void> {
  if (!body.trim()) return;
  await db.execute(`INSERT INTO evidence (run_id, kind, body, created_at) VALUES (?, ?, ?, ?)`, [runId, kind, body.trim(), now()]);
}

export async function listEvidence(db: SqlDriver, runId: string): Promise<Evidence[]> {
  const rows = await db.select<{ id: number; run_id: string; kind: EvidenceKind; body: string; created_at: string }>(
    `SELECT * FROM evidence WHERE run_id = ? ORDER BY id`,
    [runId],
  );
  return rows.map((r) => ({ id: r.id, runId: r.run_id, kind: r.kind, body: r.body, createdAt: r.created_at }));
}

export async function deleteEvidence(db: SqlDriver, id: number): Promise<void> {
  await db.execute(`DELETE FROM evidence WHERE id = ?`, [id]);
}

// ---------------- Concept progress ----------------

export interface ConceptProgress extends ConceptState {
  conceptId: string;
  confidence: number | null;
  mistakes: string;
}

export async function loadProgress(db: SqlDriver): Promise<Map<string, ConceptProgress>> {
  const rows = await db.select<{
    concept_id: string;
    familiarity: number | null;
    confidence: number | null;
    exposures: number;
    demonstrated: number;
    recalled: number;
    mistakes: string;
    last_practiced: string | null;
  }>(`SELECT * FROM concept_progress`);
  return new Map(
    rows.map((r) => [
      r.concept_id,
      {
        conceptId: r.concept_id,
        familiarity: r.familiarity,
        confidence: r.confidence,
        exposures: r.exposures,
        demonstrated: r.demonstrated,
        recalled: r.recalled,
        mistakes: r.mistakes,
        lastPracticed: r.last_practiced,
      },
    ]),
  );
}

/** Self-reported prior familiarity (0 none ... 3 comfortable). Kept separate from demonstrated work. */
export async function setFamiliarity(db: SqlDriver, conceptId: string, familiarity: number | null): Promise<void> {
  const at = now();
  await db.execute(
    `INSERT INTO concept_progress (concept_id, familiarity, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(concept_id) DO UPDATE SET familiarity = excluded.familiarity, updated_at = excluded.updated_at`,
    [conceptId, familiarity, at],
  );
}

/** Opening a resource for a concept counts as exposure only. */
export async function recordExposure(db: SqlDriver, conceptIds: readonly string[]): Promise<void> {
  if (!conceptIds.length) return;
  const at = now();
  await db.batch(conceptIds.map((c) => bumpExposure(c, at)));
}

/** Template id -> most recent start or completion time. */
export async function recentTemplates(db: SqlDriver): Promise<Map<string, string>> {
  const rows = await db.select<{ template_id: string; t: string }>(
    `SELECT template_id, MAX(COALESCE(completed_at, started_at)) AS t FROM runs GROUP BY template_id`,
  );
  return new Map(rows.map((r) => [r.template_id, r.t]));
}

/** Disciplines where a mission was shelved in the last 14 days. */
export async function shelvedDisciplines(db: SqlDriver, at: Date = new Date()): Promise<DisciplineId[]> {
  const since = addDays(at, -14).toISOString();
  const rows = await db.select<{ discipline: DisciplineId }>(
    `SELECT DISTINCT discipline FROM runs WHERE status = 'shelved' AND updated_at >= ?`,
    [since],
  );
  return rows.map((r) => r.discipline);
}

// ---------------- Reviews ----------------

export interface Review {
  id: number;
  runId: string | null;
  templateId: string;
  concepts: string[];
  prompt: string;
  answer: string;
  dueAt: string;
  intervalDays: number;
  lastResult: RecallResult | null;
  timesReviewed: number;
  timesPostponed: number;
  retired: boolean;
}

interface ReviewRow {
  id: number;
  run_id: string | null;
  template_id: string;
  concepts: string;
  prompt: string;
  answer: string;
  due_at: string;
  interval_days: number;
  last_result: RecallResult | null;
  times_reviewed: number;
  times_postponed: number;
  retired: number;
}

const toReview = (r: ReviewRow): Review => ({
  id: r.id,
  runId: r.run_id,
  templateId: r.template_id,
  concepts: parseJson<string[]>(r.concepts, []),
  prompt: r.prompt,
  answer: r.answer,
  dueAt: r.due_at,
  intervalDays: r.interval_days,
  lastResult: r.last_result,
  timesReviewed: r.times_reviewed,
  timesPostponed: r.times_postponed,
  retired: r.retired === 1,
});

export async function listReviews(db: SqlDriver, opts: { dueBy?: Date; includeRetired?: boolean } = {}): Promise<Review[]> {
  const where: string[] = [];
  const params: string[] = [];
  if (!opts.includeRetired) where.push("retired = 0");
  if (opts.dueBy) {
    where.push("due_at <= ?");
    params.push(opts.dueBy.toISOString());
  }
  const rows = await db.select<ReviewRow>(
    `SELECT * FROM reviews ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY due_at, id`,
    params,
  );
  return rows.map(toReview);
}

export async function answerReview(db: SqlDriver, id: number, result: RecallResult, at: Date = new Date()): Promise<void> {
  const rows = await db.select<ReviewRow>(`SELECT * FROM reviews WHERE id = ?`, [id]);
  if (!rows[0]) return;
  const r = toReview(rows[0]);
  const g = grade({ intervalDays: r.intervalDays, timesReviewed: r.timesReviewed }, result, at);
  const iso = at.toISOString();
  const stmts: Statement[] = [
    {
      sql: `UPDATE reviews SET interval_days = ?, due_at = ?, times_reviewed = ?, last_result = ?, updated_at = ? WHERE id = ?`,
      params: [g.intervalDays, g.dueAt, g.timesReviewed, result, iso, id],
    },
  ];
  if (result === "solid") {
    for (const c of r.concepts) {
      stmts.push({
        sql: `INSERT INTO concept_progress (concept_id, recalled, last_practiced, updated_at) VALUES (?, 1, ?, ?)
              ON CONFLICT(concept_id) DO UPDATE SET recalled = recalled + 1, last_practiced = excluded.last_practiced, updated_at = excluded.updated_at`,
        params: [c, iso, iso],
      });
    }
  }
  await db.batch(stmts);
}

export async function postponeReview(db: SqlDriver, id: number, days = 1, at: Date = new Date()): Promise<void> {
  await db.execute(`UPDATE reviews SET due_at = ?, times_postponed = times_postponed + 1, updated_at = ? WHERE id = ?`, [
    postpone(at, days),
    at.toISOString(),
    id,
  ]);
}

export async function setReviewRetired(db: SqlDriver, id: number, retired: boolean): Promise<void> {
  await db.execute(`UPDATE reviews SET retired = ?, updated_at = ? WHERE id = ?`, [retired ? 1 : 0, now(), id]);
}

// ---------------- Journal ----------------

export interface JournalEntry {
  id: number;
  runId: string | null;
  title: string;
  built: string;
  wentWrong: string;
  fixed: string;
  learned: string;
  unclear: string;
  nextTry: string;
  links: string;
  createdAt: string;
  updatedAt: string;
}

interface JournalRow {
  id: number;
  run_id: string | null;
  title: string;
  built: string;
  went_wrong: string;
  fixed: string;
  learned: string;
  unclear: string;
  next_try: string;
  links: string;
  created_at: string;
  updated_at: string;
}

const toEntry = (r: JournalRow): JournalEntry => ({
  id: r.id,
  runId: r.run_id,
  title: r.title,
  built: r.built,
  wentWrong: r.went_wrong,
  fixed: r.fixed,
  learned: r.learned,
  unclear: r.unclear,
  nextTry: r.next_try,
  links: r.links,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export type JournalFields = Omit<JournalEntry, "id" | "runId" | "createdAt" | "updatedAt">;

export async function listJournal(db: SqlDriver, search = ""): Promise<JournalEntry[]> {
  const q = search.trim();
  if (!q) return (await db.select<JournalRow>(`SELECT * FROM journal ORDER BY created_at DESC, id DESC`)).map(toEntry);
  const like = `%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
  const cols = ["title", "built", "went_wrong", "fixed", "learned", "unclear", "next_try", "links"];
  const rows = await db.select<JournalRow>(
    `SELECT * FROM journal WHERE ${cols.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(" OR ")} ORDER BY created_at DESC, id DESC`,
    cols.map(() => like),
  );
  return rows.map(toEntry);
}

export async function saveJournal(db: SqlDriver, f: JournalFields, id?: number): Promise<number> {
  const at = now();
  const vals = [f.title.trim() || "Untitled entry", f.built, f.wentWrong, f.fixed, f.learned, f.unclear, f.nextTry, f.links];
  if (id !== undefined) {
    await db.execute(
      `UPDATE journal SET title = ?, built = ?, went_wrong = ?, fixed = ?, learned = ?, unclear = ?, next_try = ?, links = ?, updated_at = ? WHERE id = ?`,
      [...vals, at, id],
    );
    return id;
  }
  const r = await db.execute(
    `INSERT INTO journal (title, built, went_wrong, fixed, learned, unclear, next_try, links, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [...vals, at, at],
  );
  return r.lastInsertId;
}

export async function deleteJournal(db: SqlDriver, id: number): Promise<void> {
  await db.execute(`DELETE FROM journal WHERE id = ?`, [id]);
}

export function journalToMarkdown(entries: readonly JournalEntry[]): string {
  const sec = (h: string, body: string) => (body.trim() ? `**${h}**\n\n${body.trim()}\n\n` : "");
  return (
    `# BYTEQUEST Lab Journal\n\nExported ${new Date().toISOString().slice(0, 10)} · ${entries.length} entries\n\n` +
    entries
      .map(
        (e) =>
          `## ${e.title}\n\n_${e.createdAt.slice(0, 10)}_\n\n` +
          sec("What I built", e.built) +
          sec("What went wrong", e.wentWrong) +
          sec("How I fixed it", e.fixed) +
          sec("What I learned", e.learned) +
          sec("What I still don't understand", e.unclear) +
          sec("What I want to try next", e.nextTry) +
          sec("Links & paths", e.links),
      )
      .join("---\n\n")
  );
}

// ---------------- Link checks ----------------

export async function saveLinkCheck(db: SqlDriver, resourceId: string, s: LinkStatus): Promise<void> {
  await db.execute(
    `INSERT INTO link_checks (resource_id, ok, status, final_url, error, checked_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(resource_id) DO UPDATE SET ok = excluded.ok, status = excluded.status, final_url = excluded.final_url, error = excluded.error, checked_at = excluded.checked_at`,
    [resourceId, s.ok ? 1 : 0, s.status, s.finalUrl ?? null, s.error ?? null, s.checkedAt],
  );
}

export async function loadLinkChecks(db: SqlDriver): Promise<Map<string, LinkStatus>> {
  const rows = await db.select<{ resource_id: string; ok: number; status: number | null; final_url: string | null; error: string | null; checked_at: string }>(
    `SELECT * FROM link_checks`,
  );
  return new Map(
    rows.map((r) => [
      r.resource_id,
      { ok: r.ok === 1, status: r.status, checkedAt: r.checked_at, finalUrl: r.final_url ?? undefined, error: r.error ?? undefined },
    ]),
  );
}

// ---------------- Stats ----------------

export interface Stats {
  completed: number;
  active: number;
  shelved: number;
  byDiscipline: Record<string, number>;
  conceptsDemonstrated: number;
  reviewsDue: number;
}

export async function loadStats(db: SqlDriver, at: Date = new Date()): Promise<Stats> {
  const counts = await db.select<{ status: RunStatus; n: number }>(`SELECT status, COUNT(*) AS n FROM runs GROUP BY status`);
  const byDisc = await db.select<{ discipline: string; n: number }>(
    `SELECT discipline, COUNT(*) AS n FROM runs WHERE status = 'completed' GROUP BY discipline`,
  );
  const demo = await db.select<{ n: number }>(`SELECT COUNT(*) AS n FROM concept_progress WHERE demonstrated > 0`);
  const due = await db.select<{ n: number }>(`SELECT COUNT(*) AS n FROM reviews WHERE retired = 0 AND due_at <= ?`, [at.toISOString()]);
  const c = (s: RunStatus) => counts.find((x) => x.status === s)?.n ?? 0;
  return {
    completed: c("completed"),
    active: c("active"),
    shelved: c("shelved"),
    byDiscipline: Object.fromEntries(byDisc.map((r) => [r.discipline, r.n])),
    conceptsDemonstrated: demo[0]?.n ?? 0,
    reviewsDue: due[0]?.n ?? 0,
  };
}
