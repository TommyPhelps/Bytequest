import { useEffect, useMemo, useState } from "react";
import { useApp, type Route, type RouteName } from "./state/store.tsx";
import { Base } from "./views/Base.tsx";
import { Board } from "./views/Board.tsx";
import { Lab } from "./views/Lab.tsx";
import { Subjects } from "./views/Subjects.tsx";
import { Resources } from "./views/Resources.tsx";
import { Recall } from "./views/Recall.tsx";
import { Journal } from "./views/Journal.tsx";
import { Settings } from "./views/Settings.tsx";
import { MISSIONS } from "./core/missions/index.ts";
import { CONCEPTS, DISCIPLINES } from "./core/catalog/subjects.ts";
import * as repo from "./db/repo.ts";

const NAV: [RouteName, string, string][] = [
  ["base", "Base", "1"], ["board", "Missions", "2"], ["lab", "Lab", "3"], ["subjects", "Subjects", "4"],
  ["resources", "Resources", "5"], ["recall", "Recall", "6"], ["journal", "Journal", "7"], ["settings", "Settings", "8"],
];

export function App() {
  const { route, go, back, canGoBack, stats, toasts, paletteOpen, setPaletteOpen, info } = useApp();

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
      } else if (e.ctrlKey && /^[1-8]$/.test(e.key)) {
        e.preventDefault();
        go({ name: NAV[Number(e.key) - 1][0] } as Route);
      } else if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [go, back, paletteOpen, setPaletteOpen]);

  useEffect(() => {
    document.querySelector(".main")?.scrollTo({ top: 0 });
  }, [route]);

  const view = (() => {
    switch (route.name) {
      case "base": return <Base />;
      case "board": return <Board key={JSON.stringify([route.discipline, route.preview?.seed, route.preview?.templateId])} discipline={route.discipline} preview={route.preview} />;
      case "lab": return <Lab key={route.runId ?? "index"} runId={route.runId} />;
      case "subjects": return <Subjects discipline={route.discipline} concept={route.concept} />;
      case "resources": return <Resources key={`${route.concept}-${route.discipline}`} concept={route.concept} discipline={route.discipline} />;
      case "recall": return <Recall />;
      case "journal": return <Journal entryId={route.entryId} />;
      case "settings": return <Settings />;
    }
  })();

  return (
    <div className="shell">
      <div className="titlebar">
        <span className="logo">BYTE<b>QUEST</b>.EXE</span>
        <span className="sub">hands-on computing lab · v{info?.version ?? "preview"}</span>
        <span className="spacer" />
        <button className="tbtn" onClick={() => back()} disabled={!canGoBack} title="Back (Alt+←)">◄ Back</button>
        <button className="tbtn" onClick={() => setPaletteOpen(true)} title="Command palette (Ctrl+K)">Command… Ctrl+K</button>
      </div>
      <nav className="menubar" aria-label="Main">
        {NAV.map(([name, label, key]) => (
          <button key={name} className={route.name === name ? "on" : ""} onClick={() => go({ name } as Route)} title={`Ctrl+${key}`}>
            <span className="key">{key}</span>{label}
            {name === "recall" && stats.reviewsDue > 0 && <span className="badge">{stats.reviewsDue}</span>}
            {name === "lab" && stats.active > 0 && <span className="badge">{stats.active}</span>}
          </button>
        ))}
      </nav>
      <main className="main" style={route.name === "lab" && route.runId ? { overflow: "hidden" } : undefined}>{view}</main>
      <footer className="statusbar">
        <span className="ok">SYSTEM READY</span>
        <span>DB: local SQLite</span>
        <span>{MISSIONS.length} missions · {CONCEPTS.length} concepts</span>
        <span>{stats.completed} completed · {stats.active} active</span>
        <span className="grow" />
        <span>Ctrl+K commands · Ctrl+1-8 jump · Alt+← back</span>
      </footer>
      {paletteOpen && <Palette onClose={() => setPaletteOpen(false)} />}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>
    </div>
  );
}

interface Cmd {
  label: string;
  hint: string;
  run: () => void;
}

function Palette({ onClose }: { onClose: () => void }) {
  const { go, setSetting, db } = useApp();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [runs, setRuns] = useState<repo.Run[]>([]);
  useEffect(() => {
    void repo.listRuns(db).then(setRuns);
  }, [db]);
  const all: Cmd[] = useMemo(() => [
    ...NAV.map(([name, label]) => ({ label: `Go to ${label}`, hint: "view", run: () => go({ name } as Route) })),
    { label: "Roll a new mission", hint: "missions", run: () => go({ name: "board" }) },
    ...runs.filter((r) => r.status !== "completed").map((r) => ({ label: `Open lab: ${r.title}`, hint: r.status, run: () => go({ name: "lab", runId: r.id }) })),
    ...MISSIONS.map((m) => ({ label: `Mission: ${m.title}`, hint: m.discipline, run: () => go({ name: "board", discipline: m.discipline }) })),
    ...DISCIPLINES.map((d) => ({ label: `Subject: ${d.name}`, hint: d.code, run: () => go({ name: "subjects", discipline: d.id }) })),
    ...CONCEPTS.map((c) => ({ label: `Concept: ${c.name}`, hint: c.discipline, run: () => go({ name: "subjects", concept: c.id }) })),
    ...(["phosphor", "midnight", "amber", "gothic", "classic", "mono"] as repo.ThemeId[]).map((t) => ({ label: `Theme: ${t}`, hint: "display", run: () => void setSetting("theme", t) })),
  ], [go, runs, setSetting]);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = all.filter((c) => words.every((w) => c.label.toLowerCase().includes(w))).slice(0, 14);
  const exec = (c: Cmd | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="panel dialog palette" role="dialog" aria-label="Command palette">
        <div className="pb">
          <input
            autoFocus type="text" value={q} placeholder="Type a command, mission, subject or concept…" aria-label="Command"
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(list.length - 1, s + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              else if (e.key === "Enter") exec(list[sel]);
            }}
          />
        </div>
        <div style={{ paddingBottom: 6 }}>
          {list.map((c, i) => (
            <div key={c.label} className={`item ${i === sel ? "on" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => exec(c)}>
              <span>{c.label}</span><span className="spacer" /><span className="small dim">{c.hint}</span>
            </div>
          ))}
          {!list.length && <div className="item dim">No matches</div>}
        </div>
      </div>
    </div>
  );
}
