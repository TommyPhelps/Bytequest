import type { CommandEffect, MissionInstance } from "./types.ts";

// Front-end half of the lab safety rules. The Rust side (labfs) enforces the
// same rules again, so the UI can never be the only line of defence.

export const EFFECT_LABEL: Record<CommandEffect, string> = {
  "read-only": "Read-only: looks, changes nothing",
  "creates-files": "Creates files in the current folder",
  network: "Uses the network",
  "modifies-system": "Changes system state; read the explanation first",
  privileged: "Needs admin/root; read the explanation first",
};

/** Commands BYTEQUEST shows with an extra warning and a confirm before copying. */
export function needsConfirm(effect: CommandEffect): boolean {
  return effect === "modifies-system" || effect === "privileged";
}

const RESERVED = new Set(["CON", "PRN", "AUX", "NUL", ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((n) => [`COM${n}`, `LPT${n}`])]);

/**
 * Exact mirror of labfs::sanitize_name (Rust): keeps ASCII letters, digits,
 * '-', '_' and '.', maps spaces to '-', drops everything else, collapses
 * '..' and '--', trims dots/dashes, max 80 chars, avoids Windows device names.
 */
export function sanitizeName(raw: string): string {
  let out = "";
  for (const ch of raw) {
    if (/^[A-Za-z0-9_.-]$/.test(ch)) out += ch;
    else if (ch === " ") out += "-";
  }
  while (out.includes("..")) out = out.replaceAll("..", ".");
  while (out.includes("--")) out = out.replaceAll("--", "-");
  let t = out.replace(/^[.-]+|[.-]+$/g, "").slice(0, 80).replace(/[.-]+$/, "");
  if (!t) return "untitled";
  if (RESERVED.has(t.split(".")[0].toUpperCase())) t = `_${t}`;
  return t;
}

/** Folder name for a mission run inside the lab root, e.g. 2026-10-16_subnet-surveyor_BQ-7F3K-92QD. */
export function missionFolderName(inst: Pick<MissionInstance, "templateId" | "seed">, at: Date = new Date()): string {
  return sanitizeName(`${at.toISOString().slice(0, 10)}_${inst.templateId}_${inst.seed}`);
}

/** BRIEF.md written into the mission folder so the brief is available offline in any editor. */
export function briefMarkdown(inst: MissionInstance): string {
  const v = inst.variant;
  const list = (xs: readonly string[]) => xs.map((x) => `- ${x}`).join("\n");
  const steps = v.steps
    .map((s, i) => {
      const cmds = (s.cmd ?? []).map((c) => `\n\n   \`\`\`${c.shell}\n${c.code.split("\n").map((l) => "   " + l).join("\n")}\n   \`\`\`\n   _${c.explain}_ (${EFFECT_LABEL[c.effect]})`).join("");
      return `${i + 1}. ${s.text}${cmds}`;
    })
    .join("\n");
  return `# ${inst.title}

${inst.tagline}

Seed \`${inst.seed}\` · Tier: ${inst.tier}${inst.lang ? ` · Language: ${inst.lang}` : ""}

## Objective
${v.objective}

## This tier requires
${list(v.demands)}

## Tools
${list(inst.tools)}

## Setup
${list(inst.setup)}

## Safety
${list(inst.safety)}

## Steps
${steps}

## Verification
${v.verify.map((x) => `- [ ] ${x}`).join("\n")}

## Deliverable
${v.deliverable}

## Files in this folder
${inst.files.length ? inst.files.map((f) => `- \`${f.name}\`: ${f.note}`).join("\n") : "- (none generated for this mission)"}

The answer key stays in BYTEQUEST until you choose to reveal it.
`;
}
