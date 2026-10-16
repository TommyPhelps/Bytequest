/**
 * Seeded randomness. Every rolled mission is reproducible from its seed:
 * the same template + tier + seed always produces the same parameters,
 * files and answer key. Seeds look like "BQ-7F3K-92QD" so they are easy to
 * read aloud, type back in, or share.
 */

/** FNV-1a 32-bit hash of a string. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Returns a new shuffled array; the input is untouched. */
  shuffle<T>(items: readonly T[]): T[];
  /** Picks `n` distinct items. */
  sample<T>(items: readonly T[], n: number): T[];
  chance(p: number): boolean;
  /** Derives an independent stream (e.g. one per generator) from this seed. */
  fork(label: string): Rng;
}

/** mulberry32: small, fast, good enough for content generation (not crypto). */
export function makeRng(seed: string | number): Rng {
  const base = typeof seed === "number" ? seed >>> 0 : hashString(seed);
  let a = base;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int(min, max) {
      if (max < min) throw new Error(`rng.int: max ${max} < min ${min}`);
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(items) {
      if (items.length === 0) throw new Error("rng.pick: empty list");
      return items[Math.floor(next() * items.length)];
    },
    shuffle(items) {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    sample(items, n) {
      return rng.shuffle(items).slice(0, Math.min(n, items.length));
    },
    chance(p) {
      return next() < p;
    },
    fork(label) {
      return makeRng(`${base}:${label}`);
    },
  };
  return rng;
}

const SEED_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O, 1/I

/** New human-friendly seed. Uses crypto randomness when available. */
export function newSeed(random: () => number = Math.random): string {
  const part = () =>
    Array.from({ length: 4 }, () => SEED_ALPHABET[Math.floor(random() * SEED_ALPHABET.length)]).join("");
  return `BQ-${part()}-${part()}`;
}

export function isSeed(s: string): boolean {
  return /^BQ-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(s.trim().toUpperCase());
}
