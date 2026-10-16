// Validates the subject graph (and, once present, the mission library).
import { CONCEPTS, findCycle } from "../src/core/catalog/subjects.ts";
const cycle = findCycle(CONCEPTS);
if (cycle) { console.error("Prerequisite cycle:", cycle.join(" -> ")); process.exit(1); }
console.log(`subjects OK: ${CONCEPTS.length} concepts, no cycles`);
