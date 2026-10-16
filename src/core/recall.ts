// Spaced retrieval practice. Deliberately simple and transparent:
// each recall prompt has an interval in days that grows when you recall it
// well and resets when you miss it. Postponing never changes the interval.
// No streaks, no lockouts, no penalties.

export type RecallResult = "missed" | "shaky" | "solid";

export const RESULT_LABEL: Record<RecallResult, string> = {
  missed: "Couldn't recall",
  shaky: "Partly / slowly",
  solid: "Recalled it cleanly",
};

export const MAX_INTERVAL_DAYS = 120;
const DAY = 86_400_000;

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY);
}

/** First review after a mission: sooner when confidence is low. */
export function firstInterval(confidence: number | null): number {
  if (confidence === null) return 2;
  if (confidence <= 2) return 1;
  if (confidence === 3) return 2;
  return 4;
}

export interface ReviewState {
  intervalDays: number;
  timesReviewed: number;
}

export interface Graded {
  intervalDays: number;
  dueAt: string;
  timesReviewed: number;
}

/** Next interval after answering. Missed resets to 1 day; solid multiplies by 2.5. */
export function grade(state: ReviewState, result: RecallResult, now: Date): Graded {
  let next: number;
  if (result === "missed") next = 1;
  else if (result === "shaky") next = Math.max(1, state.intervalDays * 1.3);
  else next = Math.max(2, state.intervalDays * 2.5);
  next = Math.min(MAX_INTERVAL_DAYS, Math.round(next * 10) / 10);
  return { intervalDays: next, dueAt: addDays(now, next).toISOString(), timesReviewed: state.timesReviewed + 1 };
}

/** Postpone without penalty: the interval is untouched; only the due date moves. */
export function postpone(now: Date, days = 1): string {
  return addDays(now, days).toISOString();
}

export function isDue(dueAt: string, now: Date): boolean {
  return new Date(dueAt).getTime() <= now.getTime();
}

/** Short human description of when something is due. */
export function dueLabel(dueAt: string, now: Date): string {
  const days = Math.round((new Date(dueAt).getTime() - now.getTime()) / DAY);
  if (days <= 0) return "due now";
  if (days === 1) return "tomorrow";
  if (days < 14) return `in ${days} days`;
  return `in ${Math.round(days / 7)} weeks`;
}
