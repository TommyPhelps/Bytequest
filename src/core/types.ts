// Shared types for the BYTEQUEST core. Everything in src/core is plain
// TypeScript with no React, DOM or network access, so it runs the same in the
// desktop app and in Node's test runner.

export type Tier = "rookie" | "apprentice" | "operator" | "expert" | "nightmare";
export const TIERS: readonly Tier[] = ["rookie", "apprentice", "operator", "expert", "nightmare"];
export const TIER_LABEL: Record<Tier, string> = {
  rookie: "Rookie",
  apprentice: "Apprentice",
  operator: "Operator",
  expert: "Expert",
  nightmare: "Nightmare",
};
export const TIER_BLURB: Record<Tier, string> = {
  rookie: "Highly guided. Minimal prerequisites. Every step spelled out.",
  apprentice: "Guided project, but some steps are yours to work out.",
  operator: "Moderate challenge. Expect to troubleshoot.",
  expert: "Minimal hand-holding. Several systems working together.",
  nightmare: "Open-ended engineering. You design the approach.",
};

/** How much help is visible, independent of difficulty. */
export type HintLevel = "generous" | "standard" | "minimal" | "off";
export const HINT_LABEL: Record<HintLevel, string> = {
  generous: "Generous: step explanations shown, hints open freely",
  standard: "Standard: hints unlock one at a time",
  minimal: "Minimal: no step explanations, hints behind a confirm",
  off: "Off: no hints (answer key still available)",
};

export type MissionStyle =
  | "build"
  | "debug"
  | "investigate"
  | "repair"
  | "reverse"
  | "simulate"
  | "optimize"
  | "explain"
  | "extend"
  | "integrate";

export const STYLE_LABEL: Record<MissionStyle, string> = {
  build: "Build",
  debug: "Debug",
  investigate: "Investigate",
  repair: "Repair",
  reverse: "Reverse engineer",
  simulate: "Simulate",
  optimize: "Optimize",
  explain: "Explain",
  extend: "Extend",
  integrate: "Integrate",
};

export type DisciplineId =
  | "programming"
  | "algorithms"
  | "os"
  | "security"
  | "hardware"
  | "embedded"
  | "networking"
  | "math"
  | "electronics"
  | "gamedev"
  | "data"
  | "devops"
  | "ai"
  | "retro";

/** Where a mission can run. "linux" is satisfied by WSL, a VM, or a Raspberry Pi. */
export type OsReq = "windows" | "linux" | "any";

export type Hardware = "none" | "arduino" | "esp32" | "raspberry-pi";
export const HARDWARE_LABEL: Record<Hardware, string> = {
  none: "No extra hardware",
  arduino: "Arduino (Uno/Nano)",
  esp32: "ESP32 board",
  "raspberry-pi": "Raspberry Pi",
};

export type Online = "offline" | "optional" | "required";

/** What a command does to the machine. Shown next to every command. */
export type CommandEffect = "read-only" | "creates-files" | "modifies-system" | "network" | "privileged";

export interface Command {
  shell: "bash" | "powershell" | "cmd" | "python" | "sql" | "gdscript" | "c" | "text";
  code: string;
  /** Plain-language explanation of what the command does. */
  explain: string;
  effect: CommandEffect;
}

export interface Step {
  text: string;
  /** Why this step matters. Hidden at "minimal" / "off" hint levels. */
  why?: string;
  cmd?: Command[];
}

export interface RecallPrompt {
  prompt: string;
  /** Key points a good answer covers. Shown only after the user answers. */
  answer: string;
}

export interface Variant {
  tier: Tier;
  minutes: number;
  objective: string;
  /** What this tier technically requires (what changes vs. other tiers). */
  demands: string[];
  steps: Step[];
  verify: string[];
  deliverable: string;
  /** Increasing levels of help. */
  hints: string[];
  extensions?: string[];
}

export interface HardwareNeed {
  needs: Hardware;
  /** True when a free simulator (e.g. Wokwi) can stand in for the board. */
  simulatedOk: boolean;
}

export interface MissionTemplate {
  id: string;
  title: string;
  tagline: string;
  discipline: DisciplineId;
  secondary?: DisciplineId[];
  style: MissionStyle;
  /** Concepts this mission exercises (concept ids). */
  concepts: string[];
  /** Concepts you should already have (concept ids). */
  prerequisites: string[];
  os: OsReq[];
  hardware: HardwareNeed;
  /** Programming languages the mission can be done in. Empty = not a coding mission. */
  languages: string[];
  online: Online;
  tools: string[];
  setup: string[];
  safety: string[];
  diagram: string;
  diagramCaption: string;
  variants: Variant[];
  reflection: string[];
  recall: RecallPrompt[];
  extensions: string[];
  resources: string[];
  generator?: string;
}

export interface GenFile {
  name: string;
  content: string;
  note: string;
}

export interface GenAnswer {
  label: string;
  value: string;
}

export interface GenOutput {
  /** Values substituted into {{name}} placeholders in mission text. */
  params: Record<string, string>;
  /** Files the lab can write into the project folder. */
  files: GenFile[];
  /** The answer key, hidden until the user asks for it. */
  answers: GenAnswer[];
  /** Extra numbers the diagram can draw (e.g. prefix length). */
  diagram?: Record<string, string | number>;
}

export interface Concept {
  id: string;
  name: string;
  discipline: DisciplineId;
  summary: string;
  prereqs: string[];
  /** Fast-changing (tool versions matter) vs foundational. */
  volatile?: boolean;
}

export interface Discipline {
  id: DisciplineId;
  name: string;
  code: string;
  blurb: string;
  /** Neighbouring disciplines shown as connections. */
  neighbors: DisciplineId[];
}

/** A fully resolved mission ready to display: text interpolated, files generated. */
export interface MissionInstance {
  templateId: string;
  tier: Tier;
  /** Set when the template lacks the requested tier and a neighbour was used. */
  requestedTier: Tier;
  seed: string;
  lang: string | null;
  title: string;
  tagline: string;
  discipline: DisciplineId;
  style: MissionStyle;
  concepts: string[];
  prerequisites: string[];
  os: OsReq[];
  hardware: HardwareNeed;
  online: Online;
  tools: string[];
  setup: string[];
  safety: string[];
  diagram: string;
  diagramCaption: string;
  diagramParams: Record<string, string | number>;
  variant: Variant;
  availableTiers: Tier[];
  reflection: string[];
  recall: RecallPrompt[];
  extensions: string[];
  resources: string[];
  files: GenFile[];
  answers: GenAnswer[];
  params: Record<string, string>;
  engineVersion: number;
}
