import { test } from "node:test";
import assert from "node:assert/strict";
import { CONCEPTS, CONCEPT_BY_ID, DISCIPLINES, findCycle } from "../src/core/catalog/subjects.ts";

test("every prerequisite points at a real concept", () => {
  for (const c of CONCEPTS) for (const p of c.prereqs) assert.ok(CONCEPT_BY_ID.has(p), `${c.id} -> ${p}`);
});
test("concept graph is acyclic", () => assert.equal(findCycle(), null));
test("every concept belongs to a known discipline", () => {
  const ids = new Set(DISCIPLINES.map((d) => d.id));
  for (const c of CONCEPTS) assert.ok(ids.has(c.discipline), c.id);
});
