import { useState } from "react";
import { HINT_LABEL, TIERS, TIER_LABEL, type HintLevel } from "../core/types.ts";
import * as repo from "../db/repo.ts";
import { backupFileName, exportBackup, inspectBackup, restoreBackup, type BackupSummary } from "../backup/backup.ts";
import { pickFolder, pickJsonFile, pickSavePath, readTextFile, writeSafetyBackup, writeTextFile } from "../platform/native.ts";
import { useApp } from "../state/store.tsx";
import { Confirm, Panel } from "../ui/bits.tsx";

const THEMES: [repo.ThemeId, string][] = [
  ["phosphor", "Phosphor Lab (navy + green)"], ["midnight", "Midnight 2003"], ["amber", "CRT Amber"], ["gothic", "Gothic Terminal"], ["classic", "Windows 2000 Classic Dark"], ["mono", "Monochrome Lab"],
];

export function Settings() {
  const { db, settings: s, setSetting, info, toast, refresh } = useApp();
  const [pending, setPending] = useState<{ data: unknown; summary: BackupSummary; path: string } | null>(null);

  const doExport = async () => {
    try {
      const path = await pickSavePath("Save BYTEQUEST backup", backupFileName(), "json");
      if (!path) return;
      const b = await exportBackup(db, info?.version ?? "dev");
      await writeTextFile(path, JSON.stringify(b, null, 2));
      toast(`Backup saved: ${path}`);
    } catch (e) {
      toast(`Backup failed: ${String(e)}`, "err");
    }
  };

  const chooseRestore = async () => {
    try {
      const path = await pickJsonFile("Choose a BYTEQUEST backup");
      if (!path) return;
      let data: unknown;
      try {
        data = JSON.parse(await readTextFile(path));
      } catch {
        toast("That file isn't valid JSON.", "err");
        return;
      }
      const summary = inspectBackup(data);
      if (!summary.ok) {
        toast(summary.errors.join(" "), "err");
        return;
      }
      setPending({ data, summary, path });
    } catch (e) {
      toast(String(e), "err");
    }
  };

  const doRestore = async () => {
    if (!pending) return;
    const p = pending;
    setPending(null);
    try {
      const snap = await exportBackup(db, info?.version ?? "dev");
      const where = await writeSafetyBackup(`before-restore-${backupFileName()}`, JSON.stringify(snap));
      const r = await restoreBackup(db, p.data);
      if (!r.ok) {
        toast(r.errors.join(" "), "err");
        return;
      }
      toast(`Restored. Your previous data was saved first to ${where}.`);
      window.location.reload();
    } catch (e) {
      toast(`Restore failed; nothing changed: ${String(e)}`, "err");
    }
    await refresh();
  };

  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <h1>CONTROL PANEL</h1>
      <div className="grid2">
        <Panel title="Display">
          <div className="stack">
            <label className="field"><span>Theme</span>
              <select value={s.theme} onChange={(e) => void setSetting("theme", e.target.value as repo.ThemeId)}>{THEMES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></label>
            <label className="field"><span>Density</span>
              <select value={s.density} onChange={(e) => void setSetting("density", e.target.value as repo.Density)}><option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="spacious">Spacious</option></select></label>
            <label className="field"><span>Text size: {Math.round(s.textScale * 100)}%</span>
              <input type="range" min={0.85} max={1.5} step={0.05} value={s.textScale} onChange={(e) => void setSetting("textScale", Number(e.target.value))} /></label>
          </div>
        </Panel>
        <Panel title="Learning">
          <div className="stack">
            <label className="field"><span>Default difficulty</span>
              <select value={s.defaultTier} onChange={(e) => void setSetting("defaultTier", e.target.value as typeof s.defaultTier)}>{TIERS.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}</select></label>
            <label className="field"><span>Hint level (independent of difficulty)</span>
              <select value={s.hintLevel} onChange={(e) => void setSetting("hintLevel", e.target.value as HintLevel)}>{(Object.keys(HINT_LABEL) as HintLevel[]).map((h) => <option key={h} value={h}>{HINT_LABEL[h]}</option>)}</select></label>
            <button className="btn small" style={{ alignSelf: "flex-start" }} onClick={() => void setSetting("onboarded", false)}>Re-run the first-run questions</button>
          </div>
        </Panel>
        <Panel title="Project lab">
          <div className="stack">
            <label className="field"><span>Lab folder (mission folders are created inside it)</span>
              <div className="row"><input type="text" readOnly value={s.labRoot} style={{ flex: 1 }} aria-label="Lab folder" />
                <button className="btn" onClick={async () => { try { const p = await pickFolder("Choose your BYTEQUEST lab folder"); if (p) await setSetting("labRoot", p); } catch (e) { toast(String(e), "err"); } }}>Choose…</button></div></label>
            <label className="field"><span>Preferred editor</span>
              <select value={s.editor} onChange={(e) => void setSetting("editor", e.target.value as repo.EditorTool)}>
                <option value="vscode">VS Code</option><option value="nvim">Neovim (in Windows Terminal)</option><option value="vim">Vim (in Windows Terminal)</option><option value="terminal">Terminal only</option><option value="explorer">File Explorer</option>
              </select></label>
            <p className="small dim">BYTEQUEST writes only inside the lab folder, never overwrites without asking, and never runs mission commands for you.</p>
          </div>
        </Panel>
        <Panel title="Backup & restore">
          <div className="stack">
            <p className="small prose">A backup is one readable JSON file with your missions, notes, evidence, skill profile, recall schedule, journal and settings. API keys (none in this version) are never included.</p>
            <div className="row">
              <button className="btn primary" onClick={doExport}>Export backup…</button>
              <button className="btn" onClick={chooseRestore}>Restore from file…</button>
            </div>
            <div className="small dim">Before every restore, your current data is saved automatically to {info?.backupsDir ?? "the backups folder"}.</div>
          </div>
        </Panel>
        <Panel title="About this install">
          <div className="meta-grid small">
            <span>Version</span><span>{info?.version ?? "preview"}</span>
            <span>Database</span><span style={{ wordBreak: "break-all" }}>{info?.dbPath ?? "-"}</span>
            <span>Data folder</span><span style={{ wordBreak: "break-all" }}>{info?.dataDir ?? "-"}</span>
            <span>Network use</span><span>Only when you open a link or run the link checker (catalog hosts only). Everything else is offline.</span>
          </div>
        </Panel>
      </div>
      {pending && (
        <Confirm title="Replace your data with this backup?" danger confirmLabel="Restore" onCancel={() => setPending(null)} onConfirm={doRestore}>
          <p className="prose">{pending.path}</p>
          <p className="small dim">Exported {pending.summary.exportedAt?.slice(0, 19).replace("T", " ") ?? "at an unknown time"}</p>
          <table className="sheet"><tbody>{Object.entries(pending.summary.counts).map(([t, n]) => <tr key={t}><td>{t}</td><td className="num">{n}</td></tr>)}</tbody></table>
          <p className="warn">All current missions, notes and progress are replaced. A safety copy of your current data is saved first.</p>
        </Confirm>
      )}
    </div>
  );
}
