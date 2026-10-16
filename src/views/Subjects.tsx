import { CONCEPTS, CONCEPT_BY_ID, DISCIPLINES, DISCIPLINE_BY_ID, ancestry, conceptName, dependents } from "../core/catalog/subjects.ts";
import { MISSIONS, missionsFor } from "../core/missions/index.ts";
import { RESOURCES } from "../core/catalog/resources.ts";
import { readiness } from "../core/missions/engine.ts";
import type { DisciplineId } from "../core/types.ts";
import * as repo from "../db/repo.ts";
import { useApp } from "../state/store.tsx";
import { Panel, ReadyChip } from "../ui/bits.tsx";

const FAMILIARITY = ["Never touched it", "Heard of it", "Used it a bit", "Comfortable"];

export function Subjects({ discipline, concept }: { discipline?: DisciplineId; concept?: string }) {
  const { progress, go, settings, setSetting } = useApp();
  const demonstratedIn = (d: DisciplineId) => CONCEPTS.filter((c) => c.discipline === d && (progress.get(c.id)?.demonstrated ?? 0) > 0).length;

  if (concept && CONCEPT_BY_ID.has(concept)) return <ConceptView id={concept} />;

  const d = discipline ? DISCIPLINE_BY_ID.get(discipline) : undefined;
  return (
    <div className="page">
      <div className="row">
        <h1>SUBJECT MAP</h1>
        <span className="dim">{DISCIPLINES.length} regions · {CONCEPTS.length} concepts · no fixed path; follow the connections</span>
      </div>
      <div className="map">
        {DISCIPLINES.map((x) => {
          const total = CONCEPTS.filter((c) => c.discipline === x.id).length;
          const n = missionsFor(x.id).length;
          return (
            <button key={x.id} className={`panel disc-tile ${discipline === x.id ? "on" : ""}`} style={discipline === x.id ? { borderColor: "var(--accent)" } : undefined} onClick={() => go({ name: "subjects", discipline: x.id })}>
              <div className="pb stack" style={{ gap: 4 }}>
                <div className="row"><span className="disc-code">{x.code}</span><b>{x.name}</b><span className="spacer" />{settings.favorites.includes(x.id) && <span className="accent">★</span>}</div>
                <div className="small dim prose">{x.blurb}</div>
                <div className="small">{demonstratedIn(x.id)}/{total} concepts demonstrated · {n ? `${n} missions` : <span className="warn">missions coming in a later phase</span>}</div>
              </div>
            </button>
          );
        })}
      </div>
      {d && (
        <div className="grid2">
          <Panel
            title={`${d.code} · ${d.name}`}
            actions={
              <button className="btn small" onClick={() => void setSetting("favorites", settings.favorites.includes(d.id) ? settings.favorites.filter((f) => f !== d.id) : [...settings.favorites, d.id])}>
                {settings.favorites.includes(d.id) ? "★ Starred" : "☆ Star"}
              </button>
            }
          >
            <div className="stack">
              <div className="small dim">Connected regions: {d.neighbors.map((n) => (
                <button key={n} className="chip" style={{ marginRight: 4 }} onClick={() => go({ name: "subjects", discipline: n })}>{DISCIPLINE_BY_ID.get(n)?.name}</button>
              ))}</div>
              <table className="sheet">
                <thead><tr><th>Concept</th><th>Needs</th><th>Status</th></tr></thead>
                <tbody>
                  {CONCEPTS.filter((c) => c.discipline === d.id).map((c) => (
                    <tr key={c.id} className="click" onClick={() => go({ name: "subjects", concept: c.id })}>
                      <td><b>{c.name}</b>{c.volatile && <span className="chip dim" style={{ marginLeft: 6 }} title="Tools and versions change; check dates">version-sensitive</span>}<div className="small dim">{c.summary}</div></td>
                      <td className="small">{c.prereqs.map(conceptName).join(", ") || "-"}</td>
                      <td><ReadyChip r={readiness(progress.get(c.id))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Missions in this region">
            {missionsFor(d.id).length ? (
              <table className="sheet"><tbody>
                {missionsFor(d.id).map((m) => (
                  <tr key={m.id} className="click" onClick={() => go({ name: "board", discipline: d.id })}>
                    <td><b>{m.title}</b><div className="small dim">{m.tagline}</div></td>
                  </tr>
                ))}
              </tbody></table>
            ) : <div className="dim">No missions here yet. The concepts and resources are mapped so you can still explore with the resource catalog.</div>}
            <h3 style={{ marginTop: 10 }}>Free resources</h3>
            <ul className="clean">
              {RESOURCES.filter((r) => r.disciplines.includes(d.id)).map((r) => <li key={r.id}>{r.title} <span className="dim small">({r.provider})</span></li>)}
            </ul>
            <button className="btn small" onClick={() => go({ name: "resources", discipline: d.id })}>Open in resource catalog</button>
          </Panel>
        </div>
      )}
    </div>
  );
}

function ConceptView({ id }: { id: string }) {
  const { db, progress, go, refresh } = useApp();
  const c = CONCEPT_BY_ID.get(id)!;
  const p = progress.get(id);
  const missions = MISSIONS.filter((m) => m.concepts.includes(id));
  const needing = MISSIONS.filter((m) => m.prerequisites.includes(id));
  const res = RESOURCES.filter((r) => r.concepts.includes(id));
  return (
    <div className="page">
      <div className="row">
        <button className="btn small" onClick={() => go({ name: "subjects", discipline: c.discipline })}>← {DISCIPLINE_BY_ID.get(c.discipline)?.name}</button>
        <h1>{c.name.toUpperCase()}</h1>
        <ReadyChip r={readiness(p)} />
      </div>
      <div className="prose">{c.summary}{c.volatile ? " Version-sensitive: tools change, so check resource dates and versions." : ""}</div>
      <div className="grid2">
        <Panel title="Skill profile" meta="self-report and evidence are kept apart">
          <div className="meta-grid">
            <span>Prior familiarity (you)</span>
            <span>
              <select value={p?.familiarity ?? ""} onChange={async (e) => { await repo.setFamiliarity(db, id, e.target.value === "" ? null : Number(e.target.value)); await refresh(); }}>
                <option value="">Not set</option>
                {FAMILIARITY.map((f, i) => <option key={i} value={i}>{f}</option>)}
              </select>
            </span>
            <span>Demonstrated</span><span>{p?.demonstrated ?? 0} verified mission(s)</span>
            <span>Recalled cleanly</span><span>{p?.recalled ?? 0} time(s)</span>
            <span>Exposure</span><span>{p?.exposures ?? 0} mission start(s)</span>
            <span>Confidence</span><span>{p?.confidence ? `${p.confidence}/5` : "-"}</span>
            <span>Last practiced</span><span>{p?.lastPracticed?.slice(0, 10) ?? "-"}</span>
          </div>
          {p?.mistakes && (<><h3 style={{ marginTop: 8 }}>Mistakes you noted</h3><pre className="code" style={{ whiteSpace: "pre-wrap" }}>{p.mistakes}</pre></>)}
        </Panel>
        <Panel title="Connections">
          <div className="stack">
            <div><span className="dim">Builds on: </span>{c.prereqs.length ? c.prereqs.map((x) => <button key={x} className="chip" style={{ marginRight: 4 }} onClick={() => go({ name: "subjects", concept: x })}>{conceptName(x)}</button>) : "nothing; a starting point"}</div>
            <div><span className="dim">Unlocks: </span>{dependents(id).map((x) => <button key={x.id} className="chip" style={{ marginRight: 4 }} onClick={() => go({ name: "subjects", concept: x.id })}>{x.name}</button>)}</div>
            <div className="small dim">Full path to here: {ancestry(id).reverse().map(conceptName).join(" → ") || "-"}</div>
          </div>
        </Panel>
        <Panel title="Missions that teach it">
          {missions.length ? missions.map((m) => <div key={m.id}><button className="btn small" onClick={() => go({ name: "board", discipline: m.discipline })}>{m.title}</button></div>) : <span className="dim">None yet.</span>}
          {needing.length > 0 && <div className="small dim" style={{ marginTop: 6 }}>Prerequisite for: {needing.map((m) => m.title).join(", ")}</div>}
        </Panel>
        <Panel title="Free resources">
          {res.length ? <ul className="clean">{res.map((r) => <li key={r.id}>{r.title} <span className="small dim">· {r.provider}</span></li>)}</ul> : <span className="dim">None curated yet.</span>}
          <button className="btn small" onClick={() => go({ name: "resources", concept: id })}>Open in catalog</button>
        </Panel>
      </div>
    </div>
  );
}
