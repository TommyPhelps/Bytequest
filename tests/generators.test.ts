import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRng, newSeed, isSeed } from "../src/core/rng.ts";
import { subnetInfo, prefixForHosts, vlsm, dnsQuery } from "../src/core/gen/net.ts";
import { aluAdd, minimalSop, evalSop, evalMinterms } from "../src/core/gen/logic.ts";
import { assembleFull, run } from "../src/core/gen/toycpu.ts";
import { makeMaze, bfsSteps } from "../src/core/gen/algo.ts";
import { morseUnits, e12Nearest } from "../src/core/gen/physical.ts";
import { GENERATORS } from "../src/core/gen/index.ts";
import { TIERS } from "../src/core/types.ts";

test("rng is reproducible and seeds round-trip", () => {
  const a = makeRng("x"), b = makeRng("x");
  for (let i = 0; i < 50; i++) assert.equal(a.next(), b.next());
  for (let i = 0; i < 50; i++) assert.ok(isSeed(newSeed()));
  assert.ok(!isSeed("BQ-0000-OOOO"));
});

test("subnet math matches known answers", () => {
  const s = subnetInfo("192.168.10.77", 26);
  assert.deepEqual([s.network, s.broadcast, s.firstHost, s.lastHost, s.mask, s.usableHosts], ["192.168.10.64", "192.168.10.127", "192.168.10.65", "192.168.10.126", "255.255.255.192", 62]);
  const w = subnetInfo("10.42.97.200", 21);
  assert.equal(w.network, "10.42.96.0");
  assert.equal(w.broadcast, "10.42.103.255");
  assert.equal(subnetInfo("10.0.0.1", 31).usableHosts, 2);
  assert.equal(prefixForHosts(50), 26);
  assert.equal(prefixForHosts(62), 26);
  assert.equal(prefixForHosts(63), 25);
});

test("VLSM allocations never overlap and fit the block", () => {
  const allocs = vlsm("172.16.0.0", 22, [{ name: "A", hosts: 300 }, { name: "B", hosts: 100 }, { name: "C", hosts: 50 }, { name: "D", hosts: 2 }]);
  const ranges = allocs.map((a) => {
    const n = a.info.network.split(".").reduce((x, o) => x * 256 + Number(o), 0);
    return [n, n + 2 ** (32 - a.info.prefix) - 1] as const;
  });
  for (let i = 0; i < ranges.length; i++) for (let j = i + 1; j < ranges.length; j++) assert.ok(ranges[i][1] < ranges[j][0] || ranges[j][1] < ranges[i][0]);
  for (const a of allocs) assert.ok(a.info.usableHosts >= a.need);
});

test("DNS query packet layout is correct", () => {
  const q = dnsQuery(0x1234, "example.com", "A");
  assert.deepEqual([...q.slice(0, 12)], [0x12, 0x34, 0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([...q.slice(12, 13)], [7]);
  assert.deepEqual([...q.slice(-4)], [0, 1, 0, 1]);
});

test("adder flags", () => {
  assert.deepEqual([aluAdd(0x7f, 1, 8).result, aluAdd(0x7f, 1, 8).overflow, aluAdd(0x7f, 1, 8).carry], [0x80, true, false]);
  assert.deepEqual([aluAdd(0xff, 1, 8).result, aluAdd(0xff, 1, 8).carry, aluAdd(0xff, 1, 8).zero, aluAdd(0xff, 1, 8).overflow], [0, true, true, false]);
});

test("minimal SOP is equivalent to the truth table", () => {
  const rng = makeRng("sop");
  for (let k = 0; k < 40; k++) {
    const n = rng.pick([3, 4]);
    const mins = [...Array(2 ** n).keys()].filter(() => rng.chance(0.45));
    if (!mins.length) continue;
    const sop = minimalSop(mins, n);
    for (let row = 0; row < 2 ** n; row++) assert.equal(evalSop(sop, row), evalMinterms(mins, n, row), `n=${n} mins=${mins} row=${row}`);
  }
});

test("BQ-8 reference CPU runs a hand-written program", () => {
  const img = assembleFull(`
    LDI R0, 0
    LDI R1, 5
    LDI R2, 1
loop:
    ADD R0, R1
    SUB R1, R2
    JNZ loop
    ST R0, [0x80]
    HLT`);
  const s = run(img);
  assert.equal(s.halted, true);
  assert.equal(s.r[0], 15);
  assert.equal(s.mem[0x80], 15);
  assert.equal(s.z, true);
});

test("generated mazes are solvable", () => {
  for (let i = 0; i < 20; i++) assert.ok(bfsSteps(makeMaze(makeRng(`m${i}`), 8 + i, 6 + i, i)) > 0);
});

test("morse and resistor helpers", () => {
  assert.equal(morseUnits("SOS"), 27); // ... --- ... = 5 + 3 + 11 + 3 + 5
  assert.equal(morseUnits("E E"), 9);
  assert.equal(e12Nearest(150), 150);
  assert.equal(e12Nearest(160), 150);
  assert.equal(e12Nearest(1000), 1000);
});

test("every generator works for every tier and is pure", () => {
  for (const [name, g] of Object.entries(GENERATORS)) {
    for (const tier of TIERS) {
      const a = g(makeRng(`p:${name}`), tier);
      const b = g(makeRng(`p:${name}`), tier);
      assert.deepEqual(a, b, name);
      assert.ok(a.answers.length > 0, `${name}/${tier} has no answers`);
      for (const v of Object.values(a.params)) assert.equal(typeof v, "string");
    }
  }
});
