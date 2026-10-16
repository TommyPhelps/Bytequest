import type { Rng } from "../rng.ts";
import type { GenOutput, Tier } from "../types.ts";
import { atLeast, csv, fmt } from "./util.ts";

// ---------- Electronics ----------

/** E12 preferred values for one decade (multiply by 10^n). */
export const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];

/** Smallest E12 value >= ohms (keeps LED current at or below target). */
export function e12AtLeast(ohms: number): number {
  let decade = 10 ** Math.floor(Math.log10(ohms));
  for (;;) {
    for (const v of E12) {
      const r = Number((v * decade).toPrecision(3));
      if (r >= ohms - 1e-9) return r;
    }
    decade *= 10;
  }
}

/** Nearest E12 value (either side). */
export function e12Nearest(ohms: number): number {
  const decade = 10 ** Math.floor(Math.log10(ohms));
  const cands = [...E12.map((v) => v * decade), 10 * decade, 0.82 * decade].map((x) => Number(x.toPrecision(3)));
  return cands.reduce((a, b) => (Math.abs(b - ohms) < Math.abs(a - ohms) ? b : a));
}

export const ohms = (r: number) => (r >= 1e6 ? `${fmt(r / 1e6)} MΩ` : r >= 1000 ? `${fmt(r / 1000)} kΩ` : `${fmt(r)} Ω`);

const LEDS = [
  { color: "red", vf: 2.0 },
  { color: "yellow", vf: 2.1 },
  { color: "green (standard)", vf: 2.2 },
  { color: "blue", vf: 3.0 },
  { color: "white", vf: 3.1 },
];

export interface LedCalc {
  rExact: number;
  rChosen: number;
  current: number;
  power: number;
}

export function ledResistor(vs: number, vf: number, iTarget: number): LedCalc {
  const rExact = (vs - vf) / iTarget;
  const rChosen = e12AtLeast(rExact);
  const current = (vs - vf) / rChosen;
  return { rExact, rChosen, current, power: current * current * rChosen };
}

export function genLed(rng: Rng, tier: Tier): GenOutput {
  let vs = 5, led = LEDS[0], mA = 15;
  do {
    vs = rng.pick([3.3, 5, 9, 12]);
    led = rng.pick(LEDS);
    mA = rng.pick([5, 10, 15, 20]);
  } while (vs - led.vf < 1.0);
  const calc = ledResistor(vs, led.vf, mA / 1000);
  const answers = [
    { label: "Exact resistance", value: `(${vs} - ${led.vf}) / ${mA / 1000} A = ${ohms(calc.rExact)}` },
    { label: "Next E12 value up", value: ohms(calc.rChosen) },
    { label: "Actual LED current", value: `${fmt(calc.current * 1000)} mA` },
    { label: "Resistor power", value: `${fmt(calc.power * 1000)} mW (a 1/4 W resistor is ${calc.power < 0.125 ? "fine, under half its rating" : "too close; use 1/2 W or more"})` },
  ];
  const params: Record<string, string> = { vs: String(vs), color: led.color, vf: String(led.vf), mA: String(mA) };
  if (atLeast(tier, "operator")) {
    // Voltage divider: make a 3.3 V-safe signal from a higher voltage.
    const vin = rng.pick([5, 9, 12]);
    const vout = rng.pick([1.8, 2.5, 3.0, 3.3]);
    const r2 = rng.pick([10000, 4700, 22000]);
    const r1Exact = (r2 * (vin - vout)) / vout;
    const r1 = e12Nearest(r1Exact);
    const actual = (vin * r2) / (r1 + r2);
    params.vin = String(vin);
    params.vout = String(vout);
    params.r2 = ohms(r2);
    answers.push(
      { label: "Divider R1 (exact)", value: ohms(r1Exact) },
      { label: "Divider R1 (nearest E12)", value: ohms(r1) },
      { label: "Divider output with E12 R1", value: `${fmt(actual)} V (unloaded)` },
    );
  }
  return { params, files: [], answers, diagram: { vs, vf: led.vf, r: calc.rChosen } };
}

export function genRc(rng: Rng, tier: Tier): GenOutput {
  const rK = rng.pick([1, 2.2, 4.7, 10, 22, 47, 100]);
  const cU = rng.pick([1, 4.7, 10, 22, 47, 100]);
  const vs = rng.pick([5, 9, 12]);
  const tau = rK * 1000 * cU * 1e-6;
  const frac = rng.pick([0.5, 1, 2, 3]);
  const vAt = vs * (1 - Math.exp(-frac));
  const answers = [
    { label: "Time constant τ = RC", value: `${fmt(tau)} s` },
    { label: `Capacitor voltage at t = ${frac}τ`, value: `${fmt(vAt)} V (${fmt(100 * (1 - Math.exp(-frac)))}% of ${vs} V)` },
    { label: "Practically full (5τ, ~99.3%)", value: `${fmt(5 * tau)} s` },
  ];
  const params: Record<string, string> = { rK: String(rK), cU: String(cU), vs: String(vs), frac: String(frac) };
  if (atLeast(tier, "expert")) {
    // 555 astable: f = 1.44 / ((R1 + 2 R2) C), duty = (R1 + R2) / (R1 + 2 R2)
    const r1 = rng.pick([1, 2.2, 4.7, 10]) * 1000;
    const r2 = rng.pick([10, 22, 47, 68, 100]) * 1000;
    const c = rng.pick([1, 4.7, 10]) * 1e-6;
    const f = 1.44 / ((r1 + 2 * r2) * c);
    const duty = (r1 + r2) / (r1 + 2 * r2);
    params.r1 = ohms(r1);
    params.r2 = ohms(r2);
    params.c555 = `${fmt(c * 1e6)} µF`;
    answers.push(
      { label: "555 astable frequency", value: `${fmt(f)} Hz (period ${fmt(1000 / f)} ms)` },
      { label: "555 duty cycle", value: `${fmt(duty * 100)}% high` },
    );
  }
  return { params, files: [], answers, diagram: { tau, vs } };
}

// ---------- Game physics (Godot, y axis points down) ----------

export function genJump(rng: Rng, tier: Tier): GenOutput {
  const h = rng.pick([64, 80, 96, 112, 128, 144, 160, 192]);
  const t = rng.pick([0.3, 0.35, 0.4, 0.45, 0.5]);
  const speed = rng.pick([160, 200, 240, 280, 320]);
  const g = (2 * h) / (t * t);
  const v0 = (2 * h) / t;
  const air = 2 * t;
  const answers = [
    { label: "Gravity g = 2h / t²", value: `${fmt(g, 4)} px/s²` },
    { label: "Jump velocity v₀ = 2h / t", value: `${fmt(v0, 4)} px/s (in Godot: velocity.y = -${fmt(v0, 4)})` },
    { label: "Air time for a full jump on flat ground", value: `${fmt(air)} s` },
    { label: "Longest flat gap at full speed", value: `${fmt(speed * air, 4)} px` },
  ];
  const params: Record<string, string> = { h: String(h), t: String(t), speed: String(speed) };
  if (atLeast(tier, "expert")) {
    const fallMul = rng.pick([1.5, 2, 2.5]);
    const tFall = t / Math.sqrt(fallMul);
    params.fallMul = String(fallMul);
    answers.push(
      { label: `Fall time with ${fallMul}x gravity on the way down`, value: `${fmt(tFall)} s (t / √${fallMul})` },
      { label: "Air time with heavier fall", value: `${fmt(t + tFall)} s; gap ${fmt(speed * (t + tFall), 4)} px` },
    );
  }
  return { params, files: [], answers, diagram: { h, t, speed } };
}

// ---------- Morse ----------

export const MORSE: Record<string, string> = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--",
  N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
};

/** Total length in dot units: dot 1, dash 3, gap in letter 1, between letters 3, between words 7. */
export function morseUnits(text: string): number {
  const words = text.toUpperCase().trim().split(/\s+/);
  let units = 0;
  words.forEach((w, wi) => {
    [...w].forEach((ch, ci) => {
      const code = MORSE[ch];
      if (!code) throw new Error(`no morse for ${ch}`);
      for (let i = 0; i < code.length; i++) units += (code[i] === "." ? 1 : 3) + (i < code.length - 1 ? 1 : 0);
      if (ci < w.length - 1) units += 3;
    });
    if (wi < words.length - 1) units += 7;
  });
  return units;
}

export const morseText = (text: string) =>
  text.toUpperCase().trim().split(/\s+/).map((w) => [...w].map((c) => MORSE[c]).join(" ")).join(" / ");

const MSGS = ["SOS", "CQ", "HELLO", "BYTE", "PING", "73", "RETRO", "LAB OK", "GPIO", "QRV"];

export function genMorse(rng: Rng, tier: Tier): GenOutput {
  const msg = rng.pick(MSGS);
  const wpm = rng.pick([10, 12, 15, 20]);
  const unitMs = 1200 / wpm;
  const units = morseUnits(msg);
  const pin = rng.pick([9, 10, 11, 12, 13]);
  const btn = rng.pick([2, 3]);
  return {
    params: { msg, wpm: String(wpm), unitMs: fmt(unitMs), pin: String(pin), btn: String(btn), uartBaud: atLeast(tier, "expert") ? "115200" : "9600" },
    files: [],
    answers: [
      { label: "Code", value: morseText(msg) },
      { label: "Length", value: `${units} units` },
      { label: `Duration at ${wpm} WPM (unit = 1200 / WPM ms)`, value: `${fmt(units * unitMs, 4)} ms` },
    ],
  };
}

// ---------- Perceptron dataset ----------

export function genPerceptron(rng: Rng, tier: Tier): GenOutput {
  // True boundary: w1*x + w2*y + b = 0
  const w1 = rng.int(-5, 5) || 2;
  const w2 = rng.int(-5, 5) || -3;
  const b = rng.int(-20, 20);
  const n = atLeast(tier, "operator") ? 120 : 60;
  const noise = atLeast(tier, "expert") ? 0.08 : 0;
  const rows: (string | number)[][] = [["x", "y", "label"]];
  let agree = 0;
  let kept = 0;
  while (kept < n) {
    const x = rng.int(-20, 20);
    const y = rng.int(-20, 20);
    const s = w1 * x + w2 * y + b;
    if (Math.abs(s) < 4) continue; // keep a margin so the clean set is separable
    let label = s > 0 ? 1 : 0;
    if (noise && rng.chance(noise)) label = 1 - label;
    if ((s > 0 ? 1 : 0) === label) agree++;
    rows.push([x, y, label]);
    kept++;
  }
  return {
    params: { n: String(n), noisy: noise ? "yes (about 8% flipped labels)" : "no" },
    files: [{ name: "points.csv", content: csv(rows), note: "2-D points with a 0/1 label." }],
    answers: [
      { label: "A boundary that generated the data", value: `${w1}·x + ${w2}·y + ${b} = 0 (label 1 where positive)` },
      { label: "Accuracy of that boundary on this file", value: `${fmt((100 * agree) / n, 4)}%${noise ? " (the best any line can be expected to do is about this)" : ": the data is linearly separable, so a perceptron converges"}` },
    ],
  };
}
