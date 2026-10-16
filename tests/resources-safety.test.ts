import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { RESOURCES, filterResources, resourceHosts, type LinkStatus } from "../src/core/catalog/resources.ts";
import { MISSIONS } from "../src/core/missions/index.ts";
import { roll, DEFAULT_CRITERIA, instantiate } from "../src/core/missions/engine.ts";
import { sanitizeName, missionFolderName, briefMarkdown, needsConfirm } from "../src/core/safety.ts";

test("resource catalog entries are complete and use HTTPS", () => {
  const ids = new Set<string>();
  for (const r of RESOURCES) {
    assert.ok(!ids.has(r.id), `duplicate ${r.id}`);
    ids.add(r.id);
    assert.match(r.url, /^https:\/\//);
    assert.ok(r.accessNote.length > 5 && r.why.length > 10 && r.disciplines.length, r.id);
  }
  assert.ok(RESOURCES.length >= 19);
});

test("resource filtering", () => {
  assert.ok(filterResources(RESOURCES, { discipline: "security" }).every((r) => r.disciplines.includes("security")));
  assert.ok(filterResources(RESOURCES, { kind: "simulator" }).every((r) => r.kind === "simulator"));
  assert.ok(filterResources(RESOURCES, { access: "free" }).every((r) => r.access === "free"));
  assert.ok(filterResources(RESOURCES, { minHandsOn: 3 }).every((r) => r.handsOn === 3));
  assert.deepEqual(filterResources(RESOURCES, { text: "zzqx nothing matches" }).map((r) => r.id), []);
  assert.ok(filterResources(RESOURCES, { text: "nand gates" }).some((r) => r.id === "nand2tetris"));
  assert.deepEqual(filterResources(RESOURCES, { text: "NAND2TETRIS" }).map((r) => r.id), ["nand2tetris"]);
  assert.ok(filterResources(RESOURCES, { level: "beginner" }).every((r) => r.level === "beginner" || r.level === "all"));
  const status = new Map<string, LinkStatus>([["cs50", { ok: false, status: 404, checkedAt: "x" }]]);
  assert.ok(!filterResources(RESOURCES, { hideBroken: true }, status).some((r) => r.id === "cs50"));
  assert.ok(filterResources(RESOURCES, {}, status).some((r) => r.id === "cs50"));
});

test("link checker host allowlist is exactly the catalog's hosts", () => {
  const hosts = resourceHosts();
  const file = readFileSync("src-tauri/resource_hosts.txt", "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  assert.deepEqual(file.sort(), hosts, "run: node tools/write-hosts.ts");
});

test("offline: the core never touches the network", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error("network used while offline"); }) as typeof fetch;
  try {
    const r = roll(MISSIONS, { ...DEFAULT_CRITERIA, offlineOnly: true }, { progress: new Map(), recent: new Map(), favorites: [], strugglingIn: [], now: new Date() }, "BQ-OFFL-INE2");
    assert.ok(r);
    assert.notEqual(r!.instance.online, "required");
    for (const t of MISSIONS) instantiate(t, "expert", "BQ-OFFL-INE2");
  } finally {
    globalThis.fetch = realFetch;
  }
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  for (const f of walk("src/core")) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|WebSocket|@tauri-apps/, `${f} must stay offline and platform-free`);
  }
});

test("safe names mirror the Rust rules", () => {
  const cases: [string, string][] = [
    ["Subnet Surveyor", "Subnet-Surveyor"], ["../../etc/passwd", "etcpasswd"], ["..\\..\\Windows", "Windows"], ["CON", "_CON"],
    ["nul.txt", "_nul.txt"], ["", "untitled"], ["....", "untitled"], ["maze_07.txt", "maze_07.txt"], ["a:b|c?d*e", "abcde"],
  ];
  for (const [i, o] of cases) assert.equal(sanitizeName(i), o, i);
});

test("mission folders and generated files are safe names", () => {
  for (const t of MISSIONS) {
    const inst = instantiate(t, "operator", "BQ-7F3K-92QD");
    const folder = missionFolderName(inst, new Date("2026-10-16T00:00:00Z"));
    assert.equal(sanitizeName(folder), folder);
    for (const f of inst.files) assert.equal(sanitizeName(f.name), f.name);
    const md = briefMarkdown(inst);
    assert.match(md, new RegExp(inst.seed));
    const v = inst.variant;
    const ownText = [inst.tagline, ...inst.tools, ...inst.setup, ...inst.safety, v.objective, ...v.demands, ...v.verify, v.deliverable,
      ...v.steps.flatMap((s) => [s.text, ...(s.cmd ?? []).flatMap((c) => [c.code, c.explain])]), ...inst.files.map((f) => f.note)].join("\n");
    for (const a of inst.answers) {
      if (a.value.length > 12 && !ownText.includes(a.value)) assert.ok(!md.includes(a.value), `${t.id}: BRIEF.md must not leak the answer key`);
    }
  }
});

test("system-changing commands are flagged for confirmation", () => {
  assert.equal(needsConfirm("read-only"), false);
  assert.equal(needsConfirm("privileged"), true);
  assert.equal(needsConfirm("modifies-system"), true);
  for (const t of MISSIONS) for (const v of t.variants) for (const s of v.steps) for (const c of s.cmd ?? []) {
    if (/\bsudo\b|Run as administrator|Set-ExecutionPolicy|netsh|\brm -rf\b/.test(c.code)) assert.ok(needsConfirm(c.effect), `${t.id}: '${c.code.slice(0, 40)}' should be flagged`);
  }
});
