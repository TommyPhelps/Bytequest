import type { Rng } from "../rng.ts";
import type { GenOutput, Tier } from "../types.ts";
import { atLeast } from "./util.ts";

// ---------- Binary arithmetic ----------

export const toBin = (n: number, bits: number) => (n >>> 0).toString(2).padStart(bits, "0").slice(-bits);
export const toHex = (n: number, bits: number) => (n >>> 0).toString(16).toUpperCase().padStart(bits / 4, "0").slice(-bits / 4);

export interface AddResult {
  result: number;
  signed: number;
  carry: boolean;
  overflow: boolean;
  negative: boolean;
  zero: boolean;
}

/** Adds two N-bit values the way an ALU does and reports the flags. */
export function aluAdd(a: number, b: number, bits: number): AddResult {
  const mask = 2 ** bits - 1;
  const ua = a & mask;
  const ub = b & mask;
  const raw = ua + ub;
  const result = raw & mask;
  const sign = 2 ** (bits - 1);
  const signed = result >= sign ? result - 2 ** bits : result;
  const sa = (ua & sign) !== 0;
  const sb = (ub & sign) !== 0;
  const sr = (result & sign) !== 0;
  return { result, signed, carry: raw > mask, overflow: sa === sb && sr !== sa, negative: sr, zero: result === 0 };
}

export function genBits(rng: Rng, tier: Tier): GenOutput {
  if (!atLeast(tier, "operator")) {
    const decs = Array.from({ length: 4 }, () => rng.int(1, 255));
    const hexes = Array.from({ length: 2 }, () => rng.int(16, 255));
    const neg = -rng.int(1, 128);
    return {
      params: {
        decs: decs.join(", "),
        hexes: hexes.map((h) => "0x" + toHex(h, 8)).join(", "),
        neg: String(neg),
      },
      files: [],
      answers: [
        ...decs.map((d) => ({ label: `${d} decimal`, value: `${toBin(d, 8)}  (0x${toHex(d, 8)})` })),
        ...hexes.map((h) => ({ label: `0x${toHex(h, 8)}`, value: `${h} decimal, ${toBin(h, 8)}` })),
        { label: `${neg} as 8-bit two's complement`, value: `${toBin(neg, 8)}  (0x${toHex(neg, 8)})` },
      ],
    };
  }
  const bits = atLeast(tier, "expert") ? 16 : 8;
  const lim = 2 ** (bits - 1);
  const pairs: [number, number][] = [];
  // Guarantee at least one signed overflow and one unsigned carry among the cases.
  pairs.push([rng.int(lim / 2, lim - 1), rng.int(lim / 2, lim - 1)]);
  pairs.push([-rng.int(1, lim / 2), rng.int(lim / 2, lim - 1)]);
  for (let i = 0; i < 3; i++) pairs.push([rng.int(-lim, lim - 1), rng.int(-lim, lim - 1)]);
  const cases = rng.shuffle(pairs);
  const tsv = ["a\tb", ...cases.map(([a, b]) => `${a}\t${b}`)].join("\n") + "\n";
  return {
    params: { bits: String(bits), cases: cases.map(([a, b]) => `${a} + ${b}`).join(";  ") },
    files: [{ name: `add${bits}_cases.tsv`, content: tsv, note: `Signed ${bits}-bit operand pairs to add.` }],
    answers: cases.map(([a, b]) => {
      const r = aluAdd(a, b, bits);
      return {
        label: `${a} + ${b}`,
        value: `${toBin(r.result, bits)} = ${r.signed} signed / ${r.result} unsigned; C=${+r.carry} V=${+r.overflow} N=${+r.negative} Z=${+r.zero}`,
      };
    }),
  };
}

// ---------- Boolean functions ----------

export interface Implicant {
  value: number;
  mask: number; // 1 bits = "don't care" positions
}

const VARS = ["A", "B", "C", "D"];

export function evalMinterms(minterms: readonly number[], n: number, row: number): boolean {
  return minterms.includes(row) && row < 2 ** n;
}

/** Quine-McCluskey prime implicants. */
export function primeImplicants(minterms: readonly number[], n: number): Implicant[] {
  let current: Implicant[] = minterms.map((m) => ({ value: m, mask: 0 }));
  const primes: Implicant[] = [];
  const key = (i: Implicant) => `${i.value}/${i.mask}`;
  while (current.length) {
    const used = new Set<string>();
    const next = new Map<string, Implicant>();
    for (let i = 0; i < current.length; i++) {
      for (let j = i + 1; j < current.length; j++) {
        const a = current[i];
        const b = current[j];
        if (a.mask !== b.mask) continue;
        const diff = (a.value ^ b.value) & ~a.mask & (2 ** n - 1);
        if (diff && (diff & (diff - 1)) === 0) {
          const merged = { value: a.value & ~diff, mask: a.mask | diff };
          next.set(key(merged), merged);
          used.add(key(a));
          used.add(key(b));
        }
      }
    }
    for (const c of current) if (!used.has(key(c)) && !primes.some((p) => key(p) === key(c))) primes.push(c);
    current = [...next.values()];
  }
  return primes;
}

const covers = (imp: Implicant, m: number) => (m & ~imp.mask) === (imp.value & ~imp.mask);

export function literalCount(imp: Implicant, n: number): number {
  let c = 0;
  for (let i = 0; i < n; i++) if (!(imp.mask & (1 << i))) c++;
  return c;
}

/** A minimal sum of products (fewest terms, then fewest literals) by exhaustive cover search. */
export function minimalSop(minterms: readonly number[], n: number): Implicant[] {
  if (minterms.length === 0) return [];
  const primes = primeImplicants(minterms, n);
  let best: Implicant[] | null = null;
  const cost = (s: Implicant[]) => s.length * 100 + s.reduce((a, i) => a + literalCount(i, n), 0);
  const total = 1 << primes.length;
  for (let set = 1; set < total; set++) {
    const chosen = primes.filter((_, i) => set & (1 << i));
    if (best && chosen.length > best.length) continue;
    if (minterms.every((m) => chosen.some((p) => covers(p, m)))) {
      if (!best || cost(chosen) < cost(best)) best = chosen;
    }
  }
  return best ?? [];
}

export function implicantText(imp: Implicant, n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) {
    const bit = n - 1 - i; // A is the most significant bit
    if (imp.mask & (1 << bit)) continue;
    s += VARS[i] + (imp.value & (1 << bit) ? "" : "'");
  }
  return s || "1";
}

export function sopText(terms: Implicant[], n: number): string {
  return terms.length ? terms.map((t) => implicantText(t, n)).join(" + ") : "0";
}

export function evalSop(terms: Implicant[], row: number): boolean {
  return terms.some((t) => covers(t, row));
}

export function truthTable(minterms: readonly number[], n: number): string {
  const head = VARS.slice(0, n).join(" ") + " | F";
  const rows = Array.from({ length: 2 ** n }, (_, r) => {
    const bits = toBin(r, n).split("").join(" ");
    return `${bits} | ${minterms.includes(r) ? 1 : 0}`;
  });
  return [head, "-".repeat(head.length), ...rows].join("\n") + "\n";
}

export function genLogic(rng: Rng, tier: Tier): GenOutput {
  const n = atLeast(tier, "operator") ? 4 : 3;
  const rows = 2 ** n;
  let minterms: number[] = [];
  let sop: Implicant[] = [];
  // Reject trivial functions: want something that needs at least 2 terms and is not all-ones.
  for (let tries = 0; tries < 200; tries++) {
    const k = rng.int(Math.max(2, Math.floor(rows / 4)), Math.floor((rows * 5) / 8));
    minterms = rng.sample(Array.from({ length: rows }, (_, i) => i), k).sort((a, b) => a - b);
    sop = minimalSop(minterms, n);
    if (sop.length >= 2 && sop.length <= (n === 3 ? 3 : 4)) break;
  }
  const lits = sop.reduce((a, t) => a + literalCount(t, n), 0);
  const vars = VARS.slice(0, n).join(", ");
  return {
    params: { n: String(n), vars, minterms: `m(${minterms.join(", ")})`, table: truthTable(minterms, n) },
    files: [{ name: "truth_table.txt", content: truthTable(minterms, n), note: `Target function F(${vars}).` }],
    answers: [
      { label: "Minterms", value: `F = Σm(${minterms.join(", ")})` },
      { label: "One minimal sum of products", value: `F = ${sopText(sop, n)}` },
      { label: "Size of a minimal SOP", value: `${sop.length} terms, ${lits} literals (other forms with the same count are equally correct)` },
    ],
  };
}
