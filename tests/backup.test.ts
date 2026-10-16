import { test } from "node:test";
import assert from "node:assert/strict";
import { nodeDriver } from "./nodeDriver.ts";
import { migrate } from "../src/db/schema.ts";
import * as repo from "../src/db/repo.ts";
import { exportBackup, restoreBackup, inspectBackup, backupFileName } from "../src/backup/backup.ts";
import { instantiate } from "../src/core/missions/engine.ts";
import { MISSION_BY_ID } from "../src/core/missions/index.ts";

async function populated() {
  const db = nodeDriver();
  await migrate(db);
  await repo.saveSetting(db, "theme", "gothic");
  await db.execute(`INSERT INTO settings VALUES ('secret.ai_api_key', '"sk-should-never-leave"')`);
  const i = instantiate(MISSION_BY_ID.get("pathfinder")!, "rookie", "BQ-7F3K-92QD");
  const id = await repo.startRun(db, i);
  await repo.addEvidence(db, id, "result", "path length 42");
  await repo.updateRun(db, id, { verifyDone: i.variant.verify.map((_, k) => k), notes: "BFS!" });
  await repo.completeRun(db, id, { confidence: {}, built: "solver", wentWrong: "", fixed: "", learned: "", unclear: "", nextTry: "", mistake: "" });
  await repo.saveLinkCheck(db, "cs50", { ok: true, status: 200, checkedAt: "2026-10-16T00:00:00Z" });
  return db;
}

test("export excludes credentials", async () => {
  const b = await exportBackup(await populated(), "0.1.0");
  const text = JSON.stringify(b);
  assert.doesNotMatch(text, /sk-should-never-leave/);
  assert.doesNotMatch(text, /secret\./);
  assert.equal(b.tables.runs.length, 1);
  assert.ok(b.tables.reviews.length >= 2);
});

test("round trip restores everything into an empty database", async () => {
  const src = await populated();
  const b = JSON.parse(JSON.stringify(await exportBackup(src, "0.1.0")));
  const dst = nodeDriver();
  await migrate(dst);
  const r = await restoreBackup(dst, b);
  assert.ok(r.ok, r.errors.join());
  assert.deepEqual(await repo.listRuns(dst), await repo.listRuns(src));
  assert.deepEqual(await repo.loadProgress(dst), await repo.loadProgress(src));
  assert.deepEqual(await repo.listReviews(dst), await repo.listReviews(src));
  assert.deepEqual(await repo.listJournal(dst), await repo.listJournal(src));
  assert.equal((await repo.loadSettings(dst)).theme, "gothic");
  assert.equal((await repo.loadLinkChecks(dst)).get("cs50")?.ok, true);
});

test("restore replaces data but keeps local credentials", async () => {
  const db = await populated();
  const b = await exportBackup(db, "0.1.0");
  await repo.saveSetting(db, "theme", "amber");
  await repo.startRun(db, instantiate(MISSION_BY_ID.get("bit-bender")!, "rookie", "BQ-AAAA-AAAA"));
  assert.ok((await restoreBackup(db, b)).ok);
  assert.equal((await repo.listRuns(db)).length, 1);
  assert.equal((await repo.loadSettings(db)).theme, "gothic");
  const secret = await db.select<{ value: string }>(`SELECT value FROM settings WHERE key = 'secret.ai_api_key'`);
  assert.equal(secret.length, 1);
});

test("bad files are rejected before anything changes", async () => {
  const db = await populated();
  for (const bad of [null, 42, {}, { format: "rewind-backup" }, { format: "bytequest-backup", formatVersion: 1, schemaVersion: 999, tables: {} }, { format: "bytequest-backup", formatVersion: 1, schemaVersion: 1, tables: { runs: "nope" } }]) {
    const r = await restoreBackup(db, bad);
    assert.equal(r.ok, false);
    assert.ok(r.errors.length);
  }
  assert.equal((await repo.listRuns(db)).length, 1);
});

test("a restore that fails midway changes nothing", async () => {
  const db = await populated();
  const b = JSON.parse(JSON.stringify(await exportBackup(db, "0.1.0")));
  b.tables.runs.push({ ...b.tables.runs[0] }); // duplicate primary key
  const r = await restoreBackup(db, b);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /nothing was changed/);
  assert.equal((await repo.listRuns(db)).length, 1);
  assert.equal((await repo.listJournal(db)).length, 1);
});

test("unknown or hostile column names are ignored", async () => {
  const db = await populated();
  const b = JSON.parse(JSON.stringify(await exportBackup(db, "0.1.0")));
  b.tables.journal[0]['title") VALUES (1); DROP TABLE runs; --'] = "x";
  b.tables.journal[0].extra_field = "ignored";
  assert.ok((await restoreBackup(db, b)).ok);
  assert.equal((await repo.listRuns(db)).length, 1);
});

test("inspect reports counts; file name is filesystem safe", async () => {
  const s = inspectBackup(await exportBackup(await populated(), "0.1.0"));
  assert.equal(s.counts.runs, 1);
  assert.match(backupFileName(new Date("2026-10-16T13:45:10Z")), /^bytequest-backup-2026-10-16-13-45-10\.json$/);
});
