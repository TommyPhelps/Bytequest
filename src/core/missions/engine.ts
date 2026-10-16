import { makeRng } from "../rng.ts";
import { GENERATORS } from "../gen/index.ts";
import { tierIndex } from "../gen/util.ts";
import {
  TIERS,
  type DisciplineId,
  type GenOutput,
  type Hardware,
  type MissionInstance,
  type MissionStyle,
  type MissionTemplate,
  type Tier,
  type Variant,
} from "../types.ts";

/** Bump when instantiation changes in a way that would alter rolled missions. */
export const ENGINE_VERSION = 1;

// ---------- Interpolation ----------

export function interpolate(text: string, params: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in params ? params[k] : m));
}

export function unresolvedPlaceholders(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
}

// ---------- Tiers ----------

export function availableTiers(t: MissionTemplate): Tier[] {
  return TIERS.filter((tier) => t.variants.some((v) => v.tier === tier));
}

/** The requested tier if the template has it, otherwise the nearest one (ties go easier). */
export function resolveTier(t: MissionTemplate, requested: Tier): Tier {
  const avail = availableTiers(t);
  if (avail.includes(requested)) return requested;
  const want = tierIndex(requested);
  return avail.slice().sort((a, b) => Math.abs(tierIndex(a) - want) - Math.abs(tierIndex(b) - want) || tierIndex(a) - tierIndex(b))[0];
}

export function variantFor(t: MissionTemplate, tier: Tier): Variant {
  const v = t.variants.find((x) => x.tier === tier);
  if (!v) throw new Error(`${t.id} has no ${tier} variant`);
  return v;
}

// ---------- Instantiation ----------

function mapVariant(v: Variant, f: (s: string) => string): Variant {
  return {
    tier: v.tier,
    minutes: v.minutes,
    objective: f(v.objective),
    demands: v.demands.map(f),
    steps: v.steps.map((s) => ({
      text: f(s.text),
      why: s.why === undefined ? undefined : f(s.why),
      cmd: s.cmd?.map((c) => ({ ...c, code: f(c.code), explain: f(c.explain) })),
    })),
    verify: v.verify.map(f),
    deliverable: f(v.deliverable),
    hints: v.hints.map(f),
    extensions: v.extensions?.map(f),
  };
}

export function chooseLanguage(t: MissionTemplate, preferred: readonly string[], rngPick: (l: readonly string[]) => string): string | null {
  if (!t.languages.length) return null;
  const match = preferred.filter((l) => t.languages.includes(l));
  return match.length ? rngPick(match) : rngPick(t.languages);
}

export const LANG_LABEL: Record<string, string> = {
  python: "Python", c: "C", rust: "Rust", go: "Go", javascript: "JavaScript", typescript: "TypeScript",
  csharp: "C#", gdscript: "GDScript", sql: "SQL", bash: "Bash", powershell: "PowerShell", cpp: "C++", arduino: "Arduino C++",
};

export function instantiate(t: MissionTemplate, requested: Tier, seed: string, preferredLangs: readonly string[] = []): MissionInstance {
  const tier = resolveTier(t, requested);
  const rng = makeRng(`${t.id}|${tier}|${seed.trim().toUpperCase()}`);
  const params: Record<string, string> = {};
  const lang = chooseLanguage(t, preferredLangs, (l) => rng.fork("lang").pick(l));
  if (lang) {
    params.lang = LANG_LABEL[lang] ?? lang;
    params.langId = lang;
  }
  const varyRng = rng.fork("vary");
  for (const [k, options] of Object.entries(t.vary ?? {})) params[k] = varyRng.pick(options);
  let gen: GenOutput = { params: {}, files: [], answers: [] };
  if (t.generator) {
    const g = GENERATORS[t.generator];
    if (!g) throw new Error(`${t.id}: unknown generator ${t.generator}`);
    gen = g(rng.fork("gen"), tier);
  }
  Object.assign(params, gen.params);
  const f = (s: string) => interpolate(s, params);
  return {
    templateId: t.id,
    tier,
    requestedTier: requested,
    seed: seed.trim().toUpperCase(),
    lang,
    title: f(t.title),
    tagline: f(t.tagline),
    discipline: t.discipline,
    style: t.style,
    concepts: t.concepts.slice(),
    prerequisites: t.prerequisites.slice(),
    os: t.os.slice(),
    hardware: { ...t.hardware },
    online: t.online,
    tools: t.tools.map(f),
    setup: t.setup.map(f),
    safety: t.safety.map(f),
    diagram: t.diagram,
    diagramCaption: f(t.diagramCaption),
    diagramParams: { ...(gen.diagram ?? {}) },
    variant: mapVariant(variantFor(t, tier), f),
    availableTiers: availableTiers(t),
    reflection: t.reflection.map(f),
    recall: t.recall.map((r) => ({ prompt: f(r.prompt), answer: f(r.answer) })),
    extensions: t.extensions.map(f),
    resources: t.resources.slice(),
    files: gen.files,
    answers: gen.answers,
    params,
    engineVersion: ENGINE_VERSION,
  };
}

// ---------- Filtering ----------

export interface MissionCriteria {
  disciplines: DisciplineId[]; // empty = any
  tier: Tier;
  maxMinutes: number | null; // null = no limit
  hasLinux: boolean; // WSL, VM or Pi available
  hardware: Hardware[]; // boards the user owns
  allowSimulated: boolean;
  offlineOnly: boolean;
  languages: string[]; // preferred; empty = any
  strictLanguages: boolean; // when true, coding missions must support a preferred language
  styles: MissionStyle[]; // empty = any
}

export const DEFAULT_CRITERIA: MissionCriteria = {
  disciplines: [],
  tier: "apprentice",
  maxMinutes: null,
  hasLinux: true,
  hardware: [],
  allowSimulated: true,
  offlineOnly: false,
  languages: ["python"],
  strictLanguages: false,
  styles: [],
};

/** Returns null when the mission fits, or a plain-language reason it was filtered out. */
export function excludeReason(t: MissionTemplate, c: MissionCriteria): string | null {
  if (c.disciplines.length && !c.disciplines.includes(t.discipline) && !(t.secondary ?? []).some((d) => c.disciplines.includes(d))) {
    return "Different subject";
  }
  if (c.styles.length && !c.styles.includes(t.style)) return "Different mission style";
  const v = variantFor(t, resolveTier(t, c.tier));
  if (c.maxMinutes !== null && v.minutes > c.maxMinutes) return `Needs about ${v.minutes} min at this tier`;
  if (!t.os.includes("any") && !t.os.includes("windows") && !(t.os.includes("linux") && c.hasLinux)) return "Needs Linux (WSL, a VM or a Pi)";
  if (t.hardware.needs !== "none" && !c.hardware.includes(t.hardware.needs) && !(t.hardware.simulatedOk && c.allowSimulated)) {
    return `Needs a ${t.hardware.needs} board`;
  }
  if (c.offlineOnly && t.online === "required") return "Needs internet";
  if (c.strictLanguages && t.languages.length && c.languages.length && !t.languages.some((l) => c.languages.includes(l))) {
    return "None of your preferred languages";
  }
  return null;
}

export function eligible(templates: readonly MissionTemplate[], c: MissionCriteria): MissionTemplate[] {
  return templates.filter((t) => excludeReason(t, c) === null);
}

// ---------- Recommendation ----------

export interface ConceptState {
  familiarity: number | null;
  exposures: number;
  demonstrated: number;
  recalled: number;
  lastPracticed: string | null;
}

export type Readiness = "demonstrated" | "familiar" | "exposed" | "new";

export function readiness(s: ConceptState | undefined): Readiness {
  if (!s) return "new";
  if (s.demonstrated > 0) return "demonstrated";
  if ((s.familiarity ?? 0) >= 2) return "familiar";
  if (s.exposures > 0 || (s.familiarity ?? 0) >= 1) return "exposed";
  return "new";
}

export interface RecContext {
  progress: ReadonlyMap<string, ConceptState>;
  /** Template ids with the time they were last completed or started. */
  recent: ReadonlyMap<string, string>;
  favorites: readonly DisciplineId[];
  /** Disciplines where the user recently shelved a mission. */
  strugglingIn: readonly DisciplineId[];
  now: Date;
}

export interface Scored {
  template: MissionTemplate;
  score: number;
  reasons: string[];
}

/**
 * Explainable score. Every number that moves the score comes with a reason the
 * UI shows, so a recommendation can always answer "why this one?".
 */
export function scoreMission(t: MissionTemplate, ctx: RecContext): Scored {
  let score = 10;
  const reasons: string[] = [];
  const pre = t.prerequisites.map((p) => readiness(ctx.progress.get(p)));
  const ready = pre.filter((r) => r === "demonstrated" || r === "familiar").length;
  if (t.prerequisites.length) {
    const frac = ready / t.prerequisites.length;
    score += 8 * frac;
    reasons.push(frac === 1 ? "You have every prerequisite" : `${ready}/${t.prerequisites.length} prerequisites ready`);
  } else {
    score += 6;
    reasons.push("No prerequisites");
  }
  const newConcepts = t.concepts.filter((c) => readiness(ctx.progress.get(c)) !== "demonstrated").length;
  if (newConcepts) {
    score += 2 * Math.min(newConcepts, 3);
    reasons.push(`${newConcepts} concept${newConcepts > 1 ? "s" : ""} you haven't demonstrated yet`);
  } else {
    score -= 3;
    reasons.push("Practice: you've demonstrated all of its concepts");
  }
  if (ctx.favorites.includes(t.discipline)) {
    score += 6;
    reasons.push("In a subject you starred");
  }
  if (ctx.strugglingIn.includes(t.discipline) && t.prerequisites.length <= 2) {
    score += 2;
    reasons.push("Gentle follow-up in a subject you recently shelved");
  }
  const last = ctx.recent.get(t.id);
  if (last) {
    const days = (ctx.now.getTime() - new Date(last).getTime()) / 86400000;
    if (days < 3) {
      score -= 12;
      reasons.push("You did this one in the last few days");
    } else if (days < 14) {
      score -= 5;
      reasons.push("Done recently");
    }
  }
  return { template: t, score: Math.max(1, score), reasons };
}

export function rank(templates: readonly MissionTemplate[], ctx: RecContext): Scored[] {
  return templates.map((t) => scoreMission(t, ctx)).sort((a, b) => b.score - a.score || a.template.id.localeCompare(b.template.id));
}

export interface Roll {
  instance: MissionInstance;
  reasons: string[];
}

/**
 * Weighted random pick among eligible missions (higher score = more likely, but
 * never certain, so rerolls surface variety). Deterministic for a given seed.
 */
export function roll(
  templates: readonly MissionTemplate[],
  c: MissionCriteria,
  ctx: RecContext,
  seed: string,
  opts: { excludeTemplate?: string; lockTemplate?: string } = {},
): Roll | null {
  let pool = eligible(templates, c);
  if (opts.lockTemplate) pool = pool.filter((t) => t.id === opts.lockTemplate);
  else if (opts.excludeTemplate && pool.length > 1) pool = pool.filter((t) => t.id !== opts.excludeTemplate);
  if (!pool.length) return null;
  const scored = rank(pool, ctx);
  const rng = makeRng(`roll|${seed}`);
  const total = scored.reduce((a, s) => a + s.score * s.score, 0);
  let x = rng.next() * total;
  let pick = scored[scored.length - 1];
  for (const s of scored) {
    x -= s.score * s.score;
    if (x <= 0) {
      pick = s;
      break;
    }
  }
  return { instance: instantiate(pick.template, c.tier, seed, c.languages), reasons: pick.reasons };
}
