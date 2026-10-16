import { CONCEPT_BY_ID } from "../catalog/subjects.ts";
import { RESOURCE_BY_ID } from "../catalog/resources.ts";
import { GENERATORS } from "../gen/index.ts";
import { tierIndex } from "../gen/util.ts";
import { TIERS, type MissionInstance, type MissionTemplate } from "../types.ts";
import { instantiate, unresolvedPlaceholders } from "./engine.ts";
import { DIAGRAM_IDS } from "./diagrams.ts";

export interface Problem {
  mission: string;
  message: string;
}

const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/;

function instanceStrings(i: MissionInstance): string[] {
  const v = i.variant;
  return [
    i.title, i.tagline, i.diagramCaption, ...i.tools, ...i.setup, ...i.safety, ...i.reflection, ...i.extensions,
    ...i.recall.flatMap((r) => [r.prompt, r.answer]),
    v.objective, v.deliverable, ...v.demands, ...v.verify, ...v.hints, ...(v.extensions ?? []),
    ...v.steps.flatMap((s) => [s.text, s.why ?? "", ...(s.cmd ?? []).flatMap((c) => [c.code, c.explain])]),
  ];
}

/**
 * Checks one template against the rules every mission must meet. Returns a
 * list of problems (empty = valid). Run in tests and in CI via
 * `npm run validate`, so an incomplete mission can never ship.
 */
export function validateTemplate(t: MissionTemplate, seeds: readonly string[] = ["BQ-AAAA-AAAA", "BQ-7F3K-92QD", "BQ-ZZZZ-2222", "BQ-M4ZE-RUN5"]): Problem[] {
  const out: Problem[] = [];
  const bad = (message: string) => out.push({ mission: t.id, message });

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(t.id)) bad("id must be kebab-case");
  if (!t.title.trim() || !t.tagline.trim()) bad("title and tagline are required");
  if (!t.concepts.length) bad("needs at least one concept");
  for (const c of [...t.concepts, ...t.prerequisites]) if (!CONCEPT_BY_ID.has(c)) bad(`unknown concept '${c}'`);
  for (const c of t.prerequisites) if (t.concepts.includes(c)) bad(`'${c}' is both a concept and a prerequisite`);
  for (const r of t.resources) if (!RESOURCE_BY_ID.has(r)) bad(`unknown resource '${r}'`);
  if (!t.resources.length) bad("needs at least one resource");
  if (!DIAGRAM_IDS.includes(t.diagram as (typeof DIAGRAM_IDS)[number])) bad(`unknown diagram '${t.diagram}'`);
  if (!t.diagramCaption.trim()) bad("diagram caption required");
  if (t.generator && !GENERATORS[t.generator]) bad(`unknown generator '${t.generator}'`);
  if (!t.os.length) bad("os list required");
  if (!t.tools.length) bad("list the required tools");
  if (!t.setup.length) bad("setup instructions required");
  if (!t.safety.length) bad("safety boundaries required");
  if (t.reflection.length < 2) bad("at least 2 reflection questions");
  if (t.recall.length < 2) bad("at least 2 recall prompts");
  for (const r of t.recall) if (!r.prompt.trim() || r.answer.trim().length < 10) bad("recall prompts need a prompt and a real answer");
  if (!t.extensions.length) bad("at least 1 extension");
  if (t.hardware.needs === "none" && t.hardware.simulatedOk) bad("simulatedOk only makes sense when hardware is needed");

  // Variants
  const tiers = t.variants.map((v) => v.tier);
  if (t.variants.length < 3) bad("needs at least 3 difficulty tiers");
  if (new Set(tiers).size !== tiers.length) bad("duplicate tier");
  const sorted = t.variants.slice().sort((a, b) => tierIndex(a.tier) - tierIndex(b.tier));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].minutes < sorted[i - 1].minutes) bad(`${sorted[i].tier} is shorter than ${sorted[i - 1].tier}`);
    const a = JSON.stringify([sorted[i].demands, sorted[i].steps.map((s) => s.text)]);
    const b = JSON.stringify([sorted[i - 1].demands, sorted[i - 1].steps.map((s) => s.text)]);
    if (a === b) bad(`${sorted[i].tier} is identical to ${sorted[i - 1].tier}`);
  }
  for (const v of t.variants) {
    const where = `[${v.tier}]`;
    if (!TIERS.includes(v.tier)) bad(`${where} unknown tier`);
    if (!(v.minutes >= 10 && v.minutes <= 2400)) bad(`${where} minutes out of range`);
    if (!v.objective.trim()) bad(`${where} objective required`);
    if (v.demands.length < 2) bad(`${where} at least 2 demands (what this tier requires)`);
    if (v.steps.length < 3) bad(`${where} at least 3 steps`);
    if (v.verify.length < 2) bad(`${where} at least 2 verification criteria`);
    if (!v.deliverable.trim()) bad(`${where} deliverable required`);
    const minHints = v.tier === "rookie" ? 3 : 2;
    if (v.hints.length < minHints) bad(`${where} at least ${minHints} hints`);
    for (const s of v.steps) {
      if (!s.text.trim()) bad(`${where} empty step`);
      for (const c of s.cmd ?? []) {
        if (c.explain.trim().length < 15) bad(`${where} command '${c.code.slice(0, 30)}' needs a real explanation`);
        if (!c.code.trim()) bad(`${where} empty command`);
        if ((c.effect === "privileged" || c.effect === "modifies-system") && !/admin|sudo|root|undo|revert|system|privileg/i.test(c.explain + t.safety.join(" "))) {
          bad(`${where} system-changing command needs an explanation of its impact`);
        }
      }
    }
  }

  // Instantiation across seeds and every tier must fully resolve.
  if (!out.length) {
    for (const seed of seeds) {
      for (const tier of TIERS) {
        let inst: MissionInstance;
        try {
          inst = instantiate(t, tier, seed, []);
        } catch (e) {
          bad(`instantiate(${tier}, ${seed}) threw: ${(e as Error).message}`);
          continue;
        }
        const left = new Set(instanceStrings(inst).flatMap(unresolvedPlaceholders));
        if (left.size) bad(`[${inst.tier}] unresolved placeholders: ${[...left].join(", ")}`);
        for (const f of inst.files) if (!SAFE_FILE.test(f.name)) bad(`unsafe generated file name '${f.name}'`);
        if (t.generator && !inst.answers.length) bad(`[${inst.tier}] generator produced no answer key`);
      }
      if (out.length) break;
    }
  }
  return out;
}

export function validateLibrary(templates: readonly MissionTemplate[]): Problem[] {
  const out: Problem[] = [];
  const ids = new Set<string>();
  for (const t of templates) {
    if (ids.has(t.id)) out.push({ mission: t.id, message: "duplicate id" });
    ids.add(t.id);
    out.push(...validateTemplate(t));
  }
  return out;
}
