import { useEffect, useMemo, useState } from "react";
import { MISSIONS } from "../core/missions/index.ts";
import { roll } from "../core/missions/engine.ts";
import { CONCEPTS, DISCIPLINES } from "../core/catalog/subjects.ts";
import { HARDWARE_LABEL, TIERS, TIER_LABEL, type DisciplineId, type Hardware } from "../core/types.ts";
import { newSeed } from "../core/rng.ts";
import * as repo from "../db/repo.ts";
import { useApp } from "../state/store.tsx";
import { criteriaFrom, useRecContext } from "../state/missionCtx.ts";
import { Bar, Empty, Panel } from "../ui/bits.tsx";
import { MissionPreview } from "../ui/MissionPreview.tsx";

export function Base() {
  const { db, settings, stats, go, rev } = useApp();
  const ctx = useRecContext();
  const [seed, setSeed] = useState(() => newSeed());
  const [active, setActive] = useState<repo.Run[]>([]);
  useEffect(() => {
    void repo.listRuns(db, "active").then(setActive);
  }, [db, rev]);
  const suggestion = useMemo(() => (ctx ? roll(MISSIONS, criteriaFrom(settings), ctx, seed) : null), [ctx, settings, seed]);

  if (!settings.onboarded) return <FirstRun />;

  return (
    <div className="page">
      <div className="banner">
        <span className="big">SYSTEM READY</span>
        <span className="dim">{stats.completed} missions completed · {stats.conceptsDemonstrated} of {CONCEPTS.length} concepts demonstrated · {stats.reviewsDue} recall prompts due</span>
        <span className="spacer" />
        {stats.reviewsDue > 0 && <button className="btn" onClick={() => go({ name: "recall" })}>PATCH YOUR BRAIN ({stats.reviewsDue})</button>}
      </div>
      <div className="grid2">
        <Panel
          title="Suggested mission"
          actions={<button className="btn small" onClick={() => setSeed(newSeed())}>Reroll</button>}
        >
          {suggestion ? (
            <div className="stack">
              <MissionPreview inst={suggestion.instance} reasons={suggestion.reasons} showDiagram={false} />
              <div className="row">
                <button className="btn primary" onClick={() => go({ name: "board", preview: suggestion.instance })}>Open on the board</button>
                <span className="small dim">Tune difficulty, time and subjects on the Mission Board.</span>
              </div>
            </div>
          ) : (
            <Empty title="NOTHING FITS">Your saved filters exclude every mission. <button className="btn small" onClick={() => go({ name: "board" })}>Adjust them</button></Empty>
          )}
        </Panel>
        <div className="stack">
          <Panel title="In the lab" meta={`${active.length} active`}>
            {active.length ? (
              <table className="sheet"><tbody>
                {active.map((r) => (
                  <tr key={r.id} className="click" onClick={() => go({ name: "lab", runId: r.id })}>
                    <td><b>{r.title}</b><div className="small dim">{TIER_LABEL[r.tier]} · {r.seed}</div></td>
                    <td style={{ width: 160 }}><Bar value={r.verifyDone.length} max={r.instance.variant.verify.length} /><span className="small dim">{r.verifyDone.length}/{r.instance.variant.verify.length} verified</span></td>
                  </tr>
                ))}
              </tbody></table>
            ) : <div className="dim small">No missions in progress.</div>}
          </Panel>
          <Panel title="Field record" meta="only completed, verified work counts">
            <table className="sheet">
              <thead><tr><th>Subject</th><th>Missions done</th><th>Available</th></tr></thead>
              <tbody>
                {DISCIPLINES.filter((d) => MISSIONS.some((m) => m.discipline === d.id)).map((d) => (
                  <tr key={d.id} className="click" onClick={() => go({ name: "subjects", discipline: d.id })}>
                    <td><span className="disc-code">{d.code}</span> {d.name}</td>
                    <td className="num">{stats.byDiscipline[d.id] ?? 0}</td>
                    <td className="num dim">{MISSIONS.filter((m) => m.discipline === d.id).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </div>
  );
}

const LANGS: [string, string][] = [["python", "Python"], ["c", "C"], ["rust", "Rust"], ["go", "Go"], ["javascript", "JavaScript"], ["csharp", "C#"], ["gdscript", "GDScript"]];

function FirstRun() {
  const { settings, setSetting, go } = useApp();
  const [fav, setFav] = useState<DisciplineId[]>(settings.favorites);
  const [langs, setLangs] = useState<string[]>(settings.languages);
  const [linux, setLinux] = useState(settings.hasLinux);
  const [hw, setHw] = useState<Hardware[]>(settings.hardware);
  const [tier, setTier] = useState(settings.defaultTier);
  const toggle = <T,>(l: T[], x: T) => (l.includes(x) ? l.filter((y) => y !== x) : [...l, x]);
  const finish = async () => {
    await setSetting("favorites", fav);
    await setSetting("languages", langs.length ? langs : ["python"]);
    await setSetting("hasLinux", linux);
    await setSetting("hardware", hw);
    await setSetting("defaultTier", tier);
    await setSetting("onboarded", true);
    go({ name: "board" });
  };
  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <div className="banner"><span className="big">INSERT KNOWLEDGE</span><span className="dim">Four quick questions so the first missions fit. Change any of it later.</span></div>
      <Panel title="1 · What are you curious about?">
        <div className="row" style={{ gap: 6 }}>
          {DISCIPLINES.map((d) => <button key={d.id} className={`chip ${fav.includes(d.id) ? "on" : ""}`} onClick={() => setFav(toggle(fav, d.id))}>{d.name}</button>)}
        </div>
        <p className="small dim">Starred subjects get a boost in suggestions. Nothing is locked; you can do any mission any time.</p>
      </Panel>
      <Panel title="2 · Languages you'd like to write">
        <div className="row" style={{ gap: 6 }}>
          {LANGS.map(([id, l]) => <button key={id} className={`chip ${langs.includes(id) ? "on" : ""}`} onClick={() => setLangs(toggle(langs, id))}>{l}</button>)}
        </div>
      </Panel>
      <Panel title="3 · Your bench">
        <div className="stack">
          <label className="chk"><input type="checkbox" checked={linux} onChange={(e) => setLinux(e.target.checked)} /> I can use Linux (WSL on Windows 11, a VM, or a Pi)</label>
          {(["arduino", "esp32", "raspberry-pi"] as Hardware[]).map((h) => (
            <label key={h} className="chk"><input type="checkbox" checked={hw.includes(h)} onChange={() => setHw(toggle(hw, h))} /> I own: {HARDWARE_LABEL[h]}</label>
          ))}
          <span className="small dim">No boards? Embedded missions can run in the free Wokwi simulator.</span>
        </div>
      </Panel>
      <Panel title="4 · Starting difficulty">
        <div className="seg">{TIERS.map((t) => <button key={t} className={`btn ${tier === t ? "on" : ""}`} onClick={() => setTier(t)}>{TIER_LABEL[t]}</button>)}</div>
        <p className="small dim">Difficulty changes the actual requirements, not just the wording. Switch any time per mission.</p>
      </Panel>
      <div className="row"><button className="btn primary" onClick={finish}>ACCESS GRANTED: show me missions</button></div>
    </div>
  );
}
