import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const R = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const { nodeDriver } = await import(R + "/tests/nodeDriver.ts");
const { migrate } = await import(R + "/src/db/schema.ts");
const repo = await import(R + "/src/db/repo.ts");
const { instantiate } = await import(R + "/src/core/missions/engine.ts");
const { MISSION_BY_ID } = await import(R + "/src/core/missions/index.ts");

const fresh = process.argv[2] === "fresh";
const db = nodeDriver();
await migrate(db);
if (!fresh) {
  await repo.saveSetting(db, "onboarded", true);
  await repo.saveSetting(db, "favorites", ["networking", "hardware"]);
  await repo.saveSetting(db, "labRoot", "C:\\Users\\Tommy\\Documents\\BYTEQUEST Lab");
  const done = instantiate(MISSION_BY_ID.get("subnet-surveyor"), "operator", "BQ-7F3K-92QD", ["python"]);
  const id1 = await repo.startRun(db, done);
  await repo.updateRun(db, id1, { verifyDone: done.variant.verify.map((_, i) => i), notes: "ipcalc matched on all four" });
  await repo.completeRun(db, id1, { confidence: { "ip-addressing": 3 }, built: "VLSM plan + checker script", wentWrong: "Forgot that /31 is special", fixed: "Read RFC 3021", learned: "Block sizes first, then align", unclear: "", nextTry: "IPv6 version", mistake: "Allocated smallest subnet first" }, new Date("2026-10-10T18:00:00Z"));
  const cpu = instantiate(MISSION_BY_ID.get("tiny-cpu"), "operator", "BQ-CPU8-BYTE", ["python"]);
  const id2 = await repo.startRun(db, cpu);
  await repo.updateRun(db, id2, { stepsDone: [0, 1], verifyDone: [0], notes: "Decoder done. Flags next.", projectPath: "C:\\Users\\Tommy\\Documents\\BYTEQUEST Lab\\2026-10-16_tiny-cpu_BQ-CPU8-BYTE" });
  await repo.addEvidence(db, id2, "result", "LDI/ADD/HLT test program: R0=15 after 7 steps");
  await repo.saveLinkCheck(db, "cs50", { ok: true, status: 200, checkedAt: "2026-10-16T12:00:00Z" });
  process.env.RUN2 = id2;
}
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const srv = createServer((req, res) => {
  let p = join(R, "dist-preview", req.url === "/" ? "index.html" : req.url.split("?")[0]);
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": mime[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
}).listen(5178);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => m.type() === "error" && console.log("CONSOLE", m.text()));
await page.exposeFunction("__bqCall", async (cmd, args) => {
  switch (cmd) {
    case "db_select": return db.select(args.sql, args.params);
    case "db_execute": return db.execute(args.sql, args.params);
    case "db_batch": return db.batch(args.statements);
    case "app_info": return { version: "0.1.0", dataDir: "C:\\Users\\Tommy\\AppData\\Roaming\\dev.tommy.bytequest", dbPath: "C:\\Users\\Tommy\\AppData\\Roaming\\dev.tommy.bytequest\\bytequest.sqlite3", backupsDir: "C:\\Users\\Tommy\\AppData\\Roaming\\dev.tommy.bytequest\\backups", defaultLabRoot: "C:\\Users\\Tommy\\Documents\\BYTEQUEST Lab" };
    default: throw new Error(`${cmd} is desktop-only`);
  }
});
await page.addInitScript(() => { window.__bq = (c, a) => window.__bqCall(c, a); });
const out = R + "/dist-preview/shots";
mkdirSync(out, { recursive: true });
const shot = async (n) => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}/${n}.png` }); console.log("shot", n); };
await page.goto("http://localhost:5178/");
await page.waitForSelector(".shell, .boot-error", { timeout: 10000 });
if (fresh) {
  await shot("00-firstrun");
} else {
  await shot("01-base");
  await page.keyboard.press("Control+2"); await shot("02-board");
  await page.getByText("ACCEPT MISSION").click(); await page.waitForSelector(".lab-head"); await shot("03-lab-brief");
  await page.getByRole("tab", { name: /Steps/ }).click(); await shot("04-lab-steps");
  await page.getByRole("tab", { name: /Diagram/ }).click(); await shot("05-lab-diagram");
  await page.keyboard.press("Control+3"); await shot("06-lab-index");
  await page.locator("tr.click", { hasText: "Tiny CPU" }).first().click(); await page.getByRole("tab", { name: /Answer key/ }).click(); await page.getByText("Reveal answer key").click(); await page.getByRole("button", { name: "Reveal", exact: true }).click(); await shot("07-lab-answers");
  await page.keyboard.press("Control+4"); await page.locator(".disc-tile", { hasText: "Networking" }).click(); await shot("08-subjects");
  await page.keyboard.press("Control+5"); await shot("09-resources");
  await page.keyboard.press("Control+6"); await shot("10-recall");
  await page.getByText("Reveal key points").click(); await shot("11-recall-revealed");
  await page.keyboard.press("Control+7"); await page.locator("tr.click").first().click(); await shot("12-journal");
  await page.keyboard.press("Control+8"); await shot("13-settings");
  for (const t of ["amber", "gothic", "classic", "midnight", "mono"]) { await page.selectOption("select >> nth=0", t); await page.keyboard.press("Control+1"); await shot(`14-theme-${t}`); await page.keyboard.press("Control+8"); }
  await page.selectOption("select >> nth=0", "phosphor");
  await page.keyboard.press("Control+k"); await page.keyboard.type("subnet"); await shot("15-palette");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 2560, height: 1440 }); await page.keyboard.press("Control+2"); await shot("16-board-1440p");
}
await browser.close(); srv.close();
