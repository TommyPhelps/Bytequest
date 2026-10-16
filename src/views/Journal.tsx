import { useEffect, useState } from "react";
import * as repo from "../db/repo.ts";
import { pickSavePath, writeTextFile } from "../platform/native.ts";
import { useApp } from "../state/store.tsx";
import { Confirm, Empty, Panel } from "../ui/bits.tsx";

const BLANK: repo.JournalFields = { title: "", built: "", wentWrong: "", fixed: "", learned: "", unclear: "", nextTry: "", links: "" };
const FIELDS: [keyof repo.JournalFields, string][] = [
  ["built", "What I built"], ["wentWrong", "What went wrong"], ["fixed", "How I fixed it"], ["learned", "What I learned"],
  ["unclear", "What I still don't understand"], ["nextTry", "What I want to try next"], ["links", "Project paths, screenshots, links"],
];

export function Journal({ entryId }: { entryId?: number }) {
  const { db, rev, toast, go } = useApp();
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState<repo.JournalEntry[]>([]);
  const [sel, setSel] = useState<number | "new" | null>(entryId ?? null);
  const [draft, setDraft] = useState<repo.JournalFields>(BLANK);
  const [del, setDel] = useState(false);
  const load = async () => setEntries(await repo.listJournal(db, search));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, rev, search]);
  useEffect(() => {
    if (sel === "new") setDraft(BLANK);
    else if (sel !== null) {
      const e = entries.find((x) => x.id === sel);
      if (e) setDraft({ title: e.title, built: e.built, wentWrong: e.wentWrong, fixed: e.fixed, learned: e.learned, unclear: e.unclear, nextTry: e.nextTry, links: e.links });
    }
  }, [sel, entries]);

  const save = async () => {
    const id = await repo.saveJournal(db, draft, sel === "new" || sel === null ? undefined : sel);
    await load();
    setSel(id);
    toast("Journal saved.");
  };
  const exportMd = async () => {
    try {
      const path = await pickSavePath("Export journal", `bytequest-journal-${new Date().toISOString().slice(0, 10)}.md`, "md");
      if (!path) return;
      await writeTextFile(path, repo.journalToMarkdown(await repo.listJournal(db)));
      toast(`Exported to ${path}`);
    } catch (e) {
      toast(`Export failed: ${String(e)}`, "err");
    }
  };
  const current = typeof sel === "number" ? entries.find((e) => e.id === sel) : undefined;

  return (
    <div className="page">
      <div className="row">
        <h1>LAB JOURNAL</h1>
        <span className="spacer" />
        <button className="btn" onClick={() => setSel("new")}>New entry</button>
        <button className="btn" onClick={exportMd}>Export Markdown</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 380px) 1fr", gap: "var(--gap)", alignItems: "start" }}>
        <Panel title="Entries" meta={`${entries.length}`}>
          <input type="search" placeholder="Search everything…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: "100%", marginBottom: 8 }} aria-label="Search journal" />
          {entries.length ? (
            <table className="sheet"><tbody>
              {entries.map((e) => (
                <tr key={e.id} className="click" onClick={() => setSel(e.id)} style={sel === e.id ? { outline: "1px solid var(--accent)" } : undefined}>
                  <td><b>{e.title}</b><div className="small dim">{e.createdAt.slice(0, 10)}{e.runId ? " · mission debrief" : ""}</div></td>
                </tr>
              ))}
            </tbody></table>
          ) : <div className="small dim">{search ? "No matches." : "Entries appear here after each mission debrief, or write your own."}</div>}
        </Panel>
        {sel === null ? (
          <Empty title="SELECT AN ENTRY">Or start a new one. Everything stays on this PC.</Empty>
        ) : (
          <Panel title={sel === "new" ? "New entry" : "Entry"} actions={current?.runId ? <button className="btn small" onClick={() => go({ name: "lab", runId: current.runId! })}>Open mission</button> : undefined}>
            <div className="stack">
              <label className="field"><span>Title</span><input type="text" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
              {FIELDS.map(([k, label]) => (
                <label key={k} className="field"><span>{label}</span><textarea rows={3} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} /></label>
              ))}
              <div className="row">
                <button className="btn primary" onClick={save}>Save</button>
                {typeof sel === "number" && <button className="btn danger" onClick={() => setDel(true)}>Delete</button>}
              </div>
            </div>
          </Panel>
        )}
      </div>
      {del && typeof sel === "number" && (
        <Confirm title="Delete this entry?" danger confirmLabel="Delete" onCancel={() => setDel(false)} onConfirm={async () => { setDel(false); await repo.deleteJournal(db, sel); setSel(null); await load(); }}>
          <p>This can't be undone (unless you restore a backup).</p>
        </Confirm>
      )}
    </div>
  );
}
