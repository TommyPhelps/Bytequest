import { test } from "node:test";
import assert from "node:assert/strict";
import { MISSIONS, MISSION_BY_ID } from "../src/core/missions/index.ts";
import { validateLibrary, validateTemplate } from "../src/core/missions/validate.ts";
import {
  DEFAULT_CRITERIA, availableTiers, eligible, excludeReason, instantiate, rank, readiness, resolveTier, roll,
  type ConceptState, type RecContext,
} from "../src/core/missions/engine.ts";
import { TIERS } from "../src/core/types.ts";
import { DISCIPLINES } from "../src/core/catalog/subjects.ts";

const ctx = (over: Partial<RecContext> = {}): RecContext => ({
  progress: new Map(), recent: new Map(), favorites: [], strugglingIn: [], now: new Date("2026-10-16T12:00:00Z"), ...over,
});

test("the whole library passes validation", () => {
  assert.deepEqual(validateLibrary(MISSIONS), []);
});

test("library covers several disciplines", () => {
  const ds = new Set(MISSIONS.map((m) => m.discipline));
  assert.ok(MISSIONS.length >= 20, `only ${MISSIONS.length} missions`);
  assert.ok(ds.size >= 8, `only ${ds.size} disciplines`);
  for (const d of ds) assert.ok(DISCIPLINES.some((x) => x.id === d));
});

test("validator catches an incomplete mission", () => {
  const broken = { ...MISSION_BY_ID.get("subnet-surveyor")!, id: "broken", recall: [], resources: ["nope"], variants: MISSION_BY_ID.get("subnet-surveyor")!.variants.slice(0, 2) };
  const msgs = validateTemplate(broken).map((p) => p.message).join("\n");
  assert.match(msgs, /at least 2 recall/);
  assert.match(msgs, /unknown resource 'nope'/);
  assert.match(msgs, /at least 3 difficulty tiers/);
});

test("instantiation is deterministic for a seed", () => {
  for (const t of MISSIONS) {
    const a = instantiate(t, "operator", "BQ-7F3K-92QD", ["python"]);
    const b = instantiate(t, "operator", "bq-7f3k-92qd ", ["python"]);
    assert.deepEqual(a, b, t.id);
  }
});

test("rerolling the seed changes generated missions (not just the name)", () => {
  for (const t of MISSIONS.filter((m) => m.generator)) {
    const seen = new Set<string>();
    for (const s of ["BQ-AAAA-AAAA", "BQ-2345-6789", "BQ-QWER-TYUP", "BQ-ZZZZ-ZZZZ", "BQ-M4ZE-RUN5", "BQ-HJKL-NPQR"]) {
      const i = instantiate(t, "operator", s);
      seen.add(JSON.stringify([i.params, i.answers]));
    }
    assert.ok(seen.size >= 3, `${t.id} produced only ${seen.size} distinct variants over 6 seeds`);
  }
});

test("difficulty changes technical demands, steps and time", () => {
  for (const t of MISSIONS) {
    const tiers = availableTiers(t);
    const insts = tiers.map((tier) => instantiate(t, tier, "BQ-7F3K-92QD"));
    for (let i = 1; i < insts.length; i++) {
      assert.notDeepEqual(insts[i].variant.demands, insts[i - 1].variant.demands, `${t.id} ${tiers[i]} demands`);
      assert.notDeepEqual(insts[i].variant.steps.map((s) => s.text), insts[i - 1].variant.steps.map((s) => s.text), `${t.id} ${tiers[i]} steps`);
      assert.ok(insts[i].variant.minutes >= insts[i - 1].variant.minutes, `${t.id} ${tiers[i]} minutes`);
    }
  }
});

test("a missing tier resolves to the nearest one and says so", () => {
  for (const t of MISSIONS) {
    for (const tier of TIERS) {
      const r = resolveTier(t, tier);
      assert.ok(availableTiers(t).includes(r));
      const inst = instantiate(t, tier, "BQ-AAAA-AAAA");
      assert.equal(inst.requestedTier, tier);
      assert.equal(inst.tier, r);
    }
  }
  const subnet = MISSION_BY_ID.get("subnet-surveyor")!;
  if (!availableTiers(subnet).includes("nightmare")) assert.notEqual(resolveTier(subnet, "nightmare"), "nightmare");
});

test("generated answer keys are present and differ between tiers where the generator scales", () => {
  const t = MISSION_BY_ID.get("retro-shop-sql")!;
  const rookie = instantiate(t, "rookie", "BQ-7F3K-92QD");
  const op = instantiate(t, "operator", "BQ-7F3K-92QD");
  assert.equal(rookie.answers.length, 4);
  assert.equal(op.answers.length, 6);
  assert.ok(op.files[0].content.length > rookie.files[0].content.length);
});

test("filters: time, Linux, hardware, offline and language", () => {
  const c = { ...DEFAULT_CRITERIA };
  const shell = MISSION_BY_ID.get("mini-shell")!;
  if (!shell.os.includes("windows") && !shell.os.includes("any")) {
    assert.match(excludeReason(shell, { ...c, hasLinux: false })!, /Linux/);
    assert.equal(excludeReason(shell, { ...c, hasLinux: true }), null);
  }
  const pi = MISSIONS.find((m) => m.hardware.needs === "raspberry-pi" && !m.hardware.simulatedOk);
  if (pi) assert.match(excludeReason(pi, c)!, /board/);
  const container = MISSION_BY_ID.get("container-forge")!;
  assert.equal(excludeReason(container, { ...c, offlineOnly: true }), "Needs internet");
  const short = eligible(MISSIONS, { ...c, tier: "expert", maxMinutes: 45 });
  for (const t of short) assert.ok(instantiate(t, "expert", "BQ-AAAA-AAAA").variant.minutes <= 45);
  const strict = eligible(MISSIONS, { ...c, languages: ["rust"], strictLanguages: true });
  for (const t of strict) assert.ok(!t.languages.length || t.languages.includes("rust"));
  assert.ok(eligible(MISSIONS, { ...c, disciplines: ["networking"] }).every((t) => t.discipline === "networking" || t.secondary?.includes("networking")));
});

test("preferred language is used when the mission supports it", () => {
  const t = MISSION_BY_ID.get("bit-bender")!;
  for (const s of ["BQ-AAAA-AAAA", "BQ-2345-6789", "BQ-ZZZZ-ZZZZ"]) assert.equal(instantiate(t, "rookie", s, ["rust"]).lang, "rust");
});

test("readiness separates exposure, self-report and demonstrated skill", () => {
  const s = (o: Partial<ConceptState>): ConceptState => ({ familiarity: null, exposures: 0, demonstrated: 0, recalled: 0, lastPracticed: null, ...o });
  assert.equal(readiness(undefined), "new");
  assert.equal(readiness(s({ exposures: 5 })), "exposed");
  assert.equal(readiness(s({ familiarity: 2 })), "familiar");
  assert.equal(readiness(s({ exposures: 9, familiarity: 3, demonstrated: 1 })), "demonstrated");
});

test("recommendations prefer ready prerequisites, starred subjects and avoid repeats", () => {
  const t = MISSION_BY_ID.get("tiny-cpu")!;
  const ready = new Map(t.prerequisites.map((p) => [p, { familiarity: 3, exposures: 0, demonstrated: 1, recalled: 0, lastPracticed: null }]));
  const base = rank([t], ctx())[0].score;
  assert.ok(rank([t], ctx({ progress: ready }))[0].score > base);
  assert.ok(rank([t], ctx({ favorites: [t.discipline] }))[0].score > base);
  assert.ok(rank([t], ctx({ recent: new Map([[t.id, "2026-10-15T12:00:00Z"]]) }))[0].score < base);
  for (const r of rank(MISSIONS, ctx())) assert.ok(r.reasons.length > 0, "every recommendation explains itself");
});

test("roll is deterministic, respects locks and can exclude the current mission", () => {
  const a = roll(MISSIONS, DEFAULT_CRITERIA, ctx(), "BQ-ROLL-2222")!;
  const b = roll(MISSIONS, DEFAULT_CRITERIA, ctx(), "BQ-ROLL-2222")!;
  assert.deepEqual(a, b);
  const locked = roll(MISSIONS, DEFAULT_CRITERIA, ctx(), "BQ-ROLL-3333", { lockTemplate: "pathfinder" })!;
  assert.equal(locked.instance.templateId, "pathfinder");
  const ex = roll(MISSIONS, DEFAULT_CRITERIA, ctx(), "BQ-ROLL-2222", { excludeTemplate: a.instance.templateId })!;
  assert.notEqual(ex.instance.templateId, a.instance.templateId);
  assert.equal(roll(MISSIONS, { ...DEFAULT_CRITERIA, maxMinutes: 1 }, ctx(), "BQ-ROLL-2222"), null);
});

test("many rerolls surface many different missions", () => {
  const ids = new Set<string>();
  for (let i = 0; i < 200; i++) ids.add(roll(MISSIONS, DEFAULT_CRITERIA, ctx(), `BQ-R${i}`)!.instance.templateId);
  assert.ok(ids.size >= MISSIONS.length * 0.75, `only ${ids.size} of ${MISSIONS.length} missions appeared`);
});
