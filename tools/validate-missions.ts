// Validates the subject graph and every mission template. Run by CI before the build.
import { CONCEPTS, findCycle } from "../src/core/catalog/subjects.ts";
import { MISSIONS } from "../src/core/missions/index.ts";
import { validateLibrary } from "../src/core/missions/validate.ts";
import { TIERS } from "../src/core/types.ts";

const cycle = findCycle(CONCEPTS);
if (cycle) { console.error("Prerequisite cycle:", cycle.join(" -> ")); process.exit(1); }
console.log(`subjects OK: ${CONCEPTS.length} concepts, no cycles`);

const problems = validateLibrary(MISSIONS);
for (const p of problems) console.error(`  ${p.mission}: ${p.message}`);
const variants = MISSIONS.reduce((a, m) => a + m.variants.length, 0);
const byTier = TIERS.map((t) => `${t} ${MISSIONS.filter((m) => m.variants.some((v) => v.tier === t)).length}`).join(", ");
console.log(`missions: ${MISSIONS.length} templates, ${variants} tier variants (${byTier}), ${MISSIONS.filter((m) => m.generator).length} with seeded generators`);
if (problems.length) { console.error(`${problems.length} problem(s)`); process.exit(1); }
console.log("missions OK");
