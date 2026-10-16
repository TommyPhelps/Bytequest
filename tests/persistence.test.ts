import { test } from "node:test";
import assert from "node:assert/strict";
import { nodeDriver } from "./nodeDriver.ts";
import { MIGRATIONS, migrate, currentVersion, LATEST_VERSION } from "../src/db/schema.ts";
import * as repo from "../src/db/repo.ts";
import { instantiate } from "../src/core/missions/engine.ts";
import { MISSION_BY_ID } from "../src/core/missions/index.ts";
import { grade, firstInterval, postpone, MAX_INTERVAL_DAYS } from "../src/core/recall.ts";

async function fresh() {
  const db = nodeDriver();
  await migrate(db);
  return db;
}
const inst = () => instantiate(MISSION_BY_ID.get("subnet-surveyor")!, "rookie", "BQ-7F3K-92QD");
const debrief = (over: Partial<repo.Debrief> = {}): repo.Debrief => ({
  confidence: { "ip-addressing": 4 }, built: "calc", wentWrong: "", fixed: "", learned: "masks", unclear: "", nextTry: "", mistake: "", ...over,
});

test("migrations: fresh database reaches the latest version and re-running is a no-op", async () => {
  const db = nodeDriver();
  assert.deepEqual(await migrate(db), { from: 0, to: LATEST_VERSION });
  assert.deepEqual(await migrate(db), { from: LATEST_VERSION, to: LATEST_VERSION });
  assert.equal(await currentVersion(db), LATEST_VERSION);
});

test("migrations: a later migration upgrades existing data in place", async () => {
  const db = await fresh();
  await repo.saveSetting(db, "theme", "amber");
  const next = [...MIGRATIONS, { version: LATEST_VERSION + 1, name: "test column", sql: ["ALTER TABLE runs ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0"] }];
  assert.deepEqual(await migrate(db, next), { from: LATEST_VERSION, to: LATEST_VERSION + 1 });
  assert.equal((await repo.loadSettings(db)).theme, "amber");
});

test("migrations: refuse to downgrade and refuse gaps", async () => {
  const db = await fresh();
  await db.execute(`INSERT INTO schema_migrations VALUES (99, 'future', 'x')`);
  await assert.rejects(migrate(db), /newer BYTEQUEST/);
  const db2 = nodeDriver();
  await assert.rejects(migrate(db2, [{ version: 2, name: "gap", sql: [] }]), /gap/);
});

test("migrations: a failing migration leaves no trace", async () => {
  const db = await fresh();
  const bad = [...MIGRATIONS, { version: LATEST_VERSION + 1, name: "bad", sql: ["CREATE TABLE ok_table (x)", "THIS IS NOT SQL"] }];
  await assert.rejects(migrate(db, bad));
  assert.equal(await currentVersion(db), LATEST_VERSION);
  assert.equal((await db.select(`SELECT name FROM sqlite_master WHERE name = 'ok_table'`)).length, 0);
});

test("settings: defaults, round trip, unknown keys ignored", async () => {
  const db = await fresh();
  assert.deepEqual(await repo.loadSettings(db), repo.DEFAULT_SETTINGS);
  await repo.saveSetting(db, "favorites", ["networking", "hardware"]);
  await repo.saveSetting(db, "maxMinutes", 60);
  await db.execute(`INSERT INTO settings VALUES ('bogus', '1'), ('theme', 'not json')`);
  const s = await repo.loadSettings(db);
  assert.deepEqual(s.favorites, ["networking", "hardware"]);
  assert.equal(s.maxMinutes, 60);
  assert.equal(s.theme, "phosphor");
  assert.ok(!("bogus" in s));
});

test("starting a mission records exposure, not mastery", async () => {
  const db = await fresh();
  const id = await repo.startRun(db, inst());
  const run = await repo.getRun(db, id);
  assert.equal(run!.status, "active");
  assert.deepEqual(run!.instance, JSON.parse(JSON.stringify(inst())));
  const p = (await repo.loadProgress(db)).get("ip-addressing")!;
  assert.equal(p.exposures, 1);
  assert.equal(p.demonstrated, 0);
});

test("completion requires every verification criterion, then records demonstrated skill, reviews and journal", async () => {
  const db = await fresh();
  const i = inst();
  const id = await repo.startRun(db, i);
  await assert.rejects(repo.completeRun(db, id, debrief()), /verification/);
  await repo.updateRun(db, id, { verifyDone: [0] });
  await assert.rejects(repo.completeRun(db, id, debrief()), /verification/);
  await repo.updateRun(db, id, { verifyDone: i.variant.verify.map((_, k) => k), notes: "my notes" });
  const at = new Date("2026-10-16T12:00:00Z");
  await repo.completeRun(db, id, debrief({ mistake: "forgot network address" }), at);
  const run = (await repo.getRun(db, id))!;
  assert.equal(run.status, "completed");
  assert.equal(run.notes, "my notes");
  const p = (await repo.loadProgress(db)).get("ip-addressing")!;
  assert.equal(p.demonstrated, 1);
  assert.equal(p.confidence, 4);
  assert.match(p.mistakes, /forgot network/);
  const reviews = await repo.listReviews(db);
  assert.equal(reviews.length, i.recall.length);
  assert.equal(reviews[0].dueAt, new Date(at.getTime() + firstInterval(4) * 86400000).toISOString());
  assert.equal((await repo.listJournal(db)).length, 1);
  await assert.rejects(repo.completeRun(db, id, debrief()), /already/);
});

test("shelving is not a penalty and can be undone", async () => {
  const db = await fresh();
  const id = await repo.startRun(db, inst());
  await repo.setRunStatus(db, id, "shelved");
  assert.deepEqual(await repo.shelvedDisciplines(db), ["networking"]);
  await repo.setRunStatus(db, id, "active");
  assert.equal((await repo.getRun(db, id))!.status, "active");
  assert.equal((await repo.loadProgress(db)).get("ip-addressing")!.demonstrated, 0);
});

test("evidence log and run deletion cascade", async () => {
  const db = await fresh();
  const id = await repo.startRun(db, inst());
  await repo.addEvidence(db, id, "result", "broadcast = 10.0.0.255");
  await repo.addEvidence(db, id, "note", "   ");
  assert.equal((await repo.listEvidence(db, id)).length, 1);
  await repo.deleteRun(db, id);
  assert.equal((await db.select(`SELECT * FROM evidence`)).length, 0);
});

test("recall scheduling: grows on success, resets on miss, postpone keeps the interval", async () => {
  const now = new Date("2026-10-16T00:00:00Z");
  assert.equal(grade({ intervalDays: 2, timesReviewed: 0 }, "solid", now).intervalDays, 5);
  assert.equal(grade({ intervalDays: 40, timesReviewed: 3 }, "missed", now).intervalDays, 1);
  assert.equal(grade({ intervalDays: 100, timesReviewed: 3 }, "solid", now).intervalDays, MAX_INTERVAL_DAYS);
  assert.ok(grade({ intervalDays: 4, timesReviewed: 0 }, "shaky", now).intervalDays > 4);
  assert.equal(postpone(now, 1), "2026-10-17T00:00:00.000Z");

  const db = await fresh();
  const i = inst();
  const id = await repo.startRun(db, i);
  await repo.updateRun(db, id, { verifyDone: i.variant.verify.map((_, k) => k) });
  await repo.completeRun(db, id, debrief(), now);
  const [r] = await repo.listReviews(db);
  await repo.postponeReview(db, r.id, 3, now);
  const after = (await repo.listReviews(db)).find((x) => x.id === r.id)!;
  assert.equal(after.intervalDays, r.intervalDays);
  assert.equal(after.timesPostponed, 1);
  await repo.answerReview(db, r.id, "solid", now);
  assert.equal((await repo.loadProgress(db)).get("ip-addressing")!.recalled, 1);
  assert.equal((await repo.listReviews(db, { dueBy: now })).length, 0);
  await repo.setReviewRetired(db, r.id, true);
  assert.equal((await repo.listReviews(db)).some((x) => x.id === r.id), false);
});

test("journal search, update, export", async () => {
  const db = await fresh();
  const id = await repo.saveJournal(db, { title: "Packet hunt", built: "a sniffer", wentWrong: "100% CPU", fixed: "BPF filter", learned: "", unclear: "", nextTry: "", links: "" });
  await repo.saveJournal(db, { title: "Other", built: "", wentWrong: "", fixed: "", learned: "50%_off", unclear: "", nextTry: "", links: "" });
  assert.equal((await repo.listJournal(db, "bpf")).length, 1);
  assert.equal((await repo.listJournal(db, "%_")).length, 1, "LIKE wildcards are escaped");
  await repo.saveJournal(db, { title: "Packet hunt v2", built: "", wentWrong: "", fixed: "", learned: "", unclear: "", nextTry: "", links: "" }, id);
  const md = repo.journalToMarkdown(await repo.listJournal(db));
  assert.match(md, /## Packet hunt v2/);
  assert.doesNotMatch(md, /What I built\*\*\n\n\n/);
});

test("stats count only real completed work", async () => {
  const db = await fresh();
  const i = inst();
  const a = await repo.startRun(db, i);
  await repo.startRun(db, i);
  await repo.updateRun(db, a, { verifyDone: i.variant.verify.map((_, k) => k) });
  await repo.completeRun(db, a, debrief(), new Date("2026-10-01T00:00:00Z"));
  const s = await repo.loadStats(db, new Date("2026-10-16T00:00:00Z"));
  assert.equal(s.completed, 1);
  assert.equal(s.active, 1);
  assert.equal(s.byDiscipline.networking, 1);
  assert.equal(s.reviewsDue, i.recall.length);
});
