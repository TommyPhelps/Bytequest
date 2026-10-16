import { TIERS, type Tier } from "../types.ts";

export const tierIndex = (t: Tier) => TIERS.indexOf(t);
export const atLeast = (t: Tier, min: Tier) => tierIndex(t) >= tierIndex(min);

/** Formats a number with up to `digits` significant decimals, trimming zeros. */
export function fmt(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return String(n);
  const s = Number(n.toPrecision(digits)).toString();
  return s;
}

export function csv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((v) => (typeof v === "string" && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v))).join(",")).join("\n") + "\n";
}
