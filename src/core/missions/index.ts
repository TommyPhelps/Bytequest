import type { DisciplineId, MissionTemplate } from "../types.ts";
import { NETWORKING } from "./lib/networking.ts";
import { HARDWARE } from "./lib/hardware.ts";
import { ELECTRONICS } from "./lib/electronics.ts";
import { OS_MISSIONS } from "./lib/os.ts";
import { PROGRAMMING } from "./lib/programming.ts";
import { DATA_GAMES_AI } from "./lib/data-games-ai.ts";

/** The validated Phase 1 mission library. */
export const MISSIONS: readonly MissionTemplate[] = [
  ...NETWORKING,
  ...HARDWARE,
  ...ELECTRONICS,
  ...OS_MISSIONS,
  ...PROGRAMMING,
  ...DATA_GAMES_AI,
];

export const MISSION_BY_ID: ReadonlyMap<string, MissionTemplate> = new Map(MISSIONS.map((m) => [m.id, m]));

export function missionsFor(d: DisciplineId): MissionTemplate[] {
  return MISSIONS.filter((m) => m.discipline === d || (m.secondary ?? []).includes(d));
}
