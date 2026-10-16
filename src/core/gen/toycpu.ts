import type { Rng } from "../rng.ts";
import type { GenOutput, Tier } from "../types.ts";
import { atLeast } from "./util.ts";

/*
 * BQ-8: a tiny 8-bit teaching CPU used by the "Tiny CPU Emulator" mission.
 * The app ships a reference assembler and emulator, so every rolled program
 * comes with exact expected final state to check your emulator against.
 *
 * Registers R0-R3 (8-bit), PC (8-bit), flags Z and C, 256 bytes of memory.
 * Every instruction is 2 bytes:  [oooo ddss] [imm8]
 *   o = opcode, d = destination register, s = source register.
 */

export interface OpInfo {
  op: number;
  name: string;
  form: "none" | "rd" | "rd,rs" | "rd,imm" | "rd,[imm]" | "imm";
  desc: string;
}

export const ISA: OpInfo[] = [
  { op: 0x0, name: "HLT", form: "none", desc: "Stop." },
  { op: 0x1, name: "LDI", form: "rd,imm", desc: "rd = imm" },
  { op: 0x2, name: "MOV", form: "rd,rs", desc: "rd = rs" },
  { op: 0x3, name: "ADD", form: "rd,rs", desc: "rd = rd + rs (mod 256). C = carry out, Z = result is 0" },
  { op: 0x4, name: "SUB", form: "rd,rs", desc: "rd = rd - rs (mod 256). C = borrow (rd < rs before), Z = result is 0" },
  { op: 0x5, name: "AND", form: "rd,rs", desc: "rd = rd & rs. Z set, C cleared" },
  { op: 0x6, name: "OR", form: "rd,rs", desc: "rd = rd | rs. Z set, C cleared" },
  { op: 0x7, name: "XOR", form: "rd,rs", desc: "rd = rd ^ rs. Z set, C cleared" },
  { op: 0x8, name: "SHL", form: "rd", desc: "rd = rd << 1. C = old bit 7, Z set" },
  { op: 0x9, name: "SHR", form: "rd", desc: "rd = rd >> 1 (logical). C = old bit 0, Z set" },
  { op: 0xa, name: "LD", form: "rd,[imm]", desc: "rd = mem[imm]" },
  { op: 0xb, name: "ST", form: "rd,[imm]", desc: "mem[imm] = rd" },
  { op: 0xc, name: "JMP", form: "imm", desc: "PC = imm" },
  { op: 0xd, name: "JZ", form: "imm", desc: "if Z: PC = imm" },
  { op: 0xe, name: "JNZ", form: "imm", desc: "if not Z: PC = imm" },
  { op: 0xf, name: "JC", form: "imm", desc: "if C: PC = imm" },
];

const BY_NAME = new Map(ISA.map((o) => [o.name, o]));

export interface CpuState {
  r: number[];
  pc: number;
  z: boolean;
  c: boolean;
  mem: Uint8Array;
  halted: boolean;
  steps: number;
}

export function newCpu(image: Uint8Array): CpuState {
  const mem = new Uint8Array(256);
  mem.set(image.slice(0, 256));
  return { r: [0, 0, 0, 0], pc: 0, z: false, c: false, mem, halted: false, steps: 0 };
}

/** Executes one instruction. PC advances by 2 before jumps are applied. */
export function step(s: CpuState): void {
  if (s.halted) return;
  const b0 = s.mem[s.pc];
  const imm = s.mem[(s.pc + 1) & 255];
  const op = b0 >> 4;
  const d = (b0 >> 2) & 3;
  const src = b0 & 3;
  s.pc = (s.pc + 2) & 255;
  s.steps++;
  const setZ = (v: number) => (s.z = (v & 255) === 0);
  switch (op) {
    case 0x0: s.halted = true; s.pc = (s.pc - 2) & 255; break;
    case 0x1: s.r[d] = imm; break;
    case 0x2: s.r[d] = s.r[src]; break;
    case 0x3: { const v = s.r[d] + s.r[src]; s.c = v > 255; s.r[d] = v & 255; setZ(s.r[d]); break; }
    case 0x4: { s.c = s.r[d] < s.r[src]; s.r[d] = (s.r[d] - s.r[src]) & 255; setZ(s.r[d]); break; }
    case 0x5: s.r[d] &= s.r[src]; s.c = false; setZ(s.r[d]); break;
    case 0x6: s.r[d] |= s.r[src]; s.c = false; setZ(s.r[d]); break;
    case 0x7: s.r[d] ^= s.r[src]; s.c = false; setZ(s.r[d]); break;
    case 0x8: s.c = (s.r[d] & 0x80) !== 0; s.r[d] = (s.r[d] << 1) & 255; setZ(s.r[d]); break;
    case 0x9: s.c = (s.r[d] & 1) !== 0; s.r[d] = s.r[d] >> 1; setZ(s.r[d]); break;
    case 0xa: s.r[d] = s.mem[imm]; break;
    case 0xb: s.mem[imm] = s.r[d]; break;
    case 0xc: s.pc = imm; break;
    case 0xd: if (s.z) s.pc = imm; break;
    case 0xe: if (!s.z) s.pc = imm; break;
    case 0xf: if (s.c) s.pc = imm; break;
  }
}

export function run(image: Uint8Array, maxSteps = 10000): CpuState {
  const s = newCpu(image);
  while (!s.halted && s.steps < maxSteps) step(s);
  if (!s.halted) throw new Error(`program did not halt within ${maxSteps} steps`);
  return s;
}

/**
 * Assembles BQ-8 source. Supports labels ("loop:"), comments (";"), decimal
 * and 0x numbers, and ".org addr" / ".byte v, v, ..." for data.
 */
export function assemble(src: string): Uint8Array {
  const lines = src.split("\n").map((l) => l.replace(/;.*$/, "").trim());
  const labels = new Map<string, number>();
  // Pass 1: addresses.
  let addr = 0;
  for (const raw of lines) {
    let line = raw;
    const m = /^([A-Za-z_][\w]*):\s*(.*)$/.exec(line);
    if (m) {
      labels.set(m[1].toLowerCase(), addr);
      line = m[2];
    }
    if (!line) continue;
    const [mn, ...rest] = line.split(/\s+/);
    const lower = mn.toLowerCase();
    if (lower === ".org") addr = num(rest.join(" "), labels, false);
    else if (lower === ".byte") addr += rest.join(" ").split(",").length;
    else addr += 2;
  }
  // Pass 2: bytes.
  const out = new Uint8Array(256);
  addr = 0;
  for (const raw of lines) {
    const line = raw.replace(/^[A-Za-z_][\w]*:\s*/, "");
    if (!line) continue;
    const sp = line.indexOf(" ");
    const mn = (sp < 0 ? line : line.slice(0, sp)).toUpperCase();
    const args = sp < 0 ? [] : line.slice(sp + 1).split(",").map((a) => a.trim()).filter(Boolean);
    if (mn === ".ORG") { addr = num(args[0], labels); continue; }
    if (mn === ".BYTE") { for (const a of args) out[addr++] = num(a, labels) & 255; continue; }
    const op = BY_NAME.get(mn);
    if (!op) throw new Error(`unknown instruction: ${mn}`);
    let d = 0, s = 0, imm = 0;
    const reg = (a: string) => {
      const r = /^R([0-3])$/i.exec(a);
      if (!r) throw new Error(`expected register R0-R3, got '${a}' in '${line}'`);
      return Number(r[1]);
    };
    switch (op.form) {
      case "none": break;
      case "rd": d = reg(args[0]); break;
      case "rd,rs": d = reg(args[0]); s = reg(args[1]); break;
      case "rd,imm": d = reg(args[0]); imm = num(args[1], labels); break;
      case "rd,[imm]": d = reg(args[0]); imm = num(args[1].replace(/^\[|\]$/g, ""), labels); break;
      case "imm": imm = num(args[0], labels); break;
    }
    out[addr] = (op.op << 4) | (d << 2) | s;
    out[addr + 1] = imm & 255;
    addr += 2;
  }
  return out;
}

function num(t: string, labels: Map<string, number>, strict = true): number {
  const s = t.trim();
  if (/^-?0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16) & 255;
  if (/^-?\d+$/.test(s)) return Number(s) & 255;
  const l = labels.get(s.toLowerCase());
  if (l !== undefined) return l;
  if (!strict) return 0;
  throw new Error(`unknown value or label: ${s}`);
}

/** Length of the code+data actually used (last non-zero byte, rounded to even). */
export function usedLength(img: Uint8Array): number {
  let n = img.length;
  while (n > 0 && img[n - 1] === 0) n--;
  return n + (n % 2);
}

export const hexDump = (img: Uint8Array, len = usedLength(img)) => {
  const rows: string[] = [];
  for (let i = 0; i < len; i += 16) {
    rows.push(i.toString(16).padStart(2, "0").toUpperCase() + ": " + Array.from(img.slice(i, Math.min(i + 16, len)), (b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" "));
  }
  return rows.join("\n") + "\n";
};

export const ISA_DOC = [
  "BQ-8 INSTRUCTION SET",
  "Registers R0-R3 (8-bit), PC (8-bit), flags Z and C, 256 bytes of memory.",
  "Every instruction is 2 bytes: [oooo ddss] [imm8]; o=opcode d=dest reg s=src reg.",
  "PC starts at 0 and advances by 2 BEFORE a jump is applied. All arithmetic wraps mod 256.",
  "",
  ...ISA.map((o) => `${o.op.toString(16).toUpperCase()}  ${o.name.padEnd(4)} ${o.form.padEnd(9)} ${o.desc}`),
  "",
  "Example: LDI R2, 7  ->  0x18 0x07   (0001 10 00, 00000111)",
].join("\n") + "\n";

// ---------- Program families ----------

interface Program {
  name: string;
  asm: string;
  explain: string;
}

function straightLine(rng: Rng): Program {
  const a = rng.int(10, 120), b = rng.int(10, 120), c = rng.int(1, 60);
  return {
    name: "arith",
    explain: `Computes (${a} + ${b}) - ${c} and a copy, then halts.`,
    asm: `; straight-line arithmetic
    LDI R0, ${a}
    LDI R1, ${b}
    ADD R0, R1
    LDI R2, ${c}
    SUB R0, R2
    MOV R3, R0
    HLT
`,
  };
}

function multiplyLoop(rng: Rng): Program {
  const a = rng.int(3, 40), b = rng.int(3, 12);
  return {
    name: "multiply",
    explain: `Multiplies ${a} x ${b} by repeated addition (result wraps mod 256) and stores it at 0x80.`,
    asm: `; multiply by repeated addition
      LDI R0, 0        ; accumulator
      LDI R1, ${a}     ; multiplicand
      LDI R2, ${b}     ; counter
      LDI R3, 1
loop: ADD R0, R1
      SUB R2, R3
      JNZ loop
      ST  R0, [0x80]
      HLT
`,
  };
}

// Walks an array with a counter and a patched address byte.
function sumArraySimple(n: number, data: number[]): string {
  return `; sum and max over ${n} bytes at 0x90
; uses self-modifying code: the address byte of the LD at 'rd' is incremented each pass
      LDI R0, 0        ; R0 = running sum
      LDI R1, 0        ; R1 = max so far
      LDI R2, ${n}     ; R2 = items left
rd:   LD  R3, [0x90]   ; R3 = current element (address patched below)
      ADD R0, R3       ; sum += element
      ST  R0, [0x80]   ; save sum
      MOV R0, R1       ; R0 = max
      SUB R0, R3       ; C set when max < element
      JC  take
      JMP skip
take: MOV R1, R3       ; new max
skip: LD  R0, [rd+1]   ; R0 = address byte of the LD
      LDI R3, 1
      ADD R0, R3
      ST  R0, [rd+1]   ; patch the LD to read the next element
      LD  R0, [0x80]   ; restore sum
      SUB R2, R3       ; items left -= 1
      JNZ rd
      ST  R1, [0x81]   ; store max
      HLT
      .org 0x90
      .byte ${data.join(", ")}
`;
}

function buildProgram(rng: Rng, tier: Tier): Program {
  if (!atLeast(tier, "apprentice")) return straightLine(rng);
  if (!atLeast(tier, "expert")) return multiplyLoop(rng);
  const n = rng.int(4, 7);
  const data = Array.from({ length: n }, () => rng.int(5, 90));
  return {
    name: "sum-and-max",
    explain: `Sums ${n} bytes stored at 0x90 (wrapping mod 256) into mem[0x80] and stores the largest at 0x81. It patches its own LD instruction to walk the array.`,
    asm: sumArraySimple(n, data),
  };
}

/** Resolves "label+N" expressions the simple assembler does not know about. */
function preprocess(src: string): string {
  // First find label addresses with a throwaway assemble of a version where label+N -> 0.
  const stripped = src.replace(/\[([A-Za-z_]\w*)\+(\d+)\]/g, "[0]");
  const labels = new Map<string, number>();
  let addr = 0;
  for (const raw of stripped.split("\n").map((l) => l.replace(/;.*$/, "").trim())) {
    let line = raw;
    const m = /^([A-Za-z_]\w*):\s*(.*)$/.exec(line);
    if (m) { labels.set(m[1].toLowerCase(), addr); line = m[2]; }
    if (!line) continue;
    const mn = line.split(/\s+/)[0].toLowerCase();
    if (mn === ".org") addr = parseInt(line.split(/\s+/)[1], line.includes("0x") ? 16 : 10);
    else if (mn === ".byte") addr += line.slice(5).split(",").length;
    else addr += 2;
  }
  return src.replace(/\[([A-Za-z_]\w*)\+(\d+)\]/g, (_, l: string, k: string) => {
    const a = labels.get(l.toLowerCase());
    if (a === undefined) throw new Error(`unknown label ${l}`);
    return `[0x${(a + Number(k)).toString(16)}]`;
  });
}

export function assembleFull(src: string): Uint8Array {
  return assemble(preprocess(src));
}

export function genToyCpu(rng: Rng, tier: Tier): GenOutput {
  const prog = buildProgram(rng, tier);
  const img = assembleFull(prog.asm);
  const fin = run(img);
  const opsUsed = [...new Set(
    prog.asm.split("\n").map((l) => l.replace(/;.*$/, "").replace(/^\s*[A-Za-z_]\w*:/, "").trim().split(/\s+/)[0].toUpperCase()).filter((m) => BY_NAME.has(m)),
  )];
  const answers = [
    { label: "Final registers", value: fin.r.map((v, i) => `R${i}=${v} (0x${v.toString(16).padStart(2, "0")})`).join("  ") },
    { label: "Final flags", value: `Z=${+fin.z} C=${+fin.c}` },
    { label: "Instructions executed (including HLT)", value: String(fin.steps) },
    { label: "PC at halt", value: `0x${fin.pc.toString(16).padStart(2, "0")}` },
  ];
  if (prog.name !== "arith") answers.push({ label: "mem[0x80]", value: String(fin.mem[0x80]) });
  if (prog.name === "sum-and-max") answers.push({ label: "mem[0x81] (max)", value: String(fin.mem[0x81]) });
  const files = [
    { name: "ISA.txt", content: ISA_DOC, note: "The BQ-8 instruction set your emulator implements." },
    { name: "program.asm", content: prog.asm, note: "Assembly source of the test program." },
    { name: "program.hex", content: hexDump(img), note: "The same program as machine code (address: bytes)." },
  ];
  return {
    params: { program: prog.name, explain: prog.explain, ops: opsUsed.join(", "), bytes: String(usedLength(img)) },
    files,
    answers,
  };
}
