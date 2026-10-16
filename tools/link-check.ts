// Checks every curated resource URL and prints a plain-text report.
// Run by .github/workflows/link-check.yml (weekly and on demand); the report is
// saved to the 'link-report' branch. Exit code is 0 even when links fail, so the
// report always gets saved; failures are listed at the top.
import { RESOURCES } from "../src/core/catalog/resources.ts";

interface Row { id: string; url: string; ok: boolean; status: number | null; final: string; note: string }

async function check(url: string): Promise<Omit<Row, "id" | "url">> {
  const headers = { "user-agent": "BYTEQUEST link-check (+https://github.com/TommyPhelps/bytequest)" };
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const r = await fetch(url, { method, headers, redirect: "follow", signal: AbortSignal.timeout(20000) });
      if (method === "HEAD" && [403, 404, 405].includes(r.status)) continue;
      return { ok: r.ok, status: r.status, final: r.url, note: r.url !== url ? "redirected" : "" };
    } catch (e) {
      if (method === "GET") return { ok: false, status: null, final: "", note: String((e as Error).message) };
    }
  }
  return { ok: false, status: null, final: "", note: "no response" };
}

const rows: Row[] = [];
for (const r of RESOURCES) rows.push({ id: r.id, url: r.url, ...(await check(r.url)) });
const bad = rows.filter((r) => !r.ok);
console.log(`BYTEQUEST link check ${new Date().toISOString()}`);
console.log(`checked=${rows.length} ok=${rows.length - bad.length} failed=${bad.length}`);
if (bad.length) console.log("\nFAILED:\n" + bad.map((r) => `  ${r.id}  ${r.status ?? "-"}  ${r.url}  ${r.note}`).join("\n"));
console.log("\nALL:");
for (const r of rows) console.log(`${r.ok ? "OK  " : "FAIL"} ${String(r.status ?? "-").padEnd(4)} ${r.id.padEnd(22)} ${r.url}${r.final && r.final !== r.url ? `  ->  ${r.final}` : ""}${r.note && r.note !== "redirected" ? `  (${r.note})` : ""}`);
