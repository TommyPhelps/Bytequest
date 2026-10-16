// Regenerates src-tauri/resource_hosts.txt from the curated catalog.
// The link checker in the desktop app may contact only these hosts.
import { writeFileSync } from "node:fs";
import { resourceHosts } from "../src/core/catalog/resources.ts";
writeFileSync(new URL("../src-tauri/resource_hosts.txt", import.meta.url), resourceHosts().join("\n") + "\n");
console.log(`wrote ${resourceHosts().length} hosts`);
