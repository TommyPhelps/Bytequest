import { useState } from "react";
import { ACCESS_LABEL, KIND_LABEL, RESOURCES, filterResources, type Access, type Level, type ResourceFilter, type ResourceKind } from "../core/catalog/resources.ts";
import { DISCIPLINES, conceptName } from "../core/catalog/subjects.ts";
import type { DisciplineId } from "../core/types.ts";
import * as repo from "../db/repo.ts";
import { checkLink, openExternal } from "../platform/native.ts";
import { useApp } from "../state/store.tsx";
import { Empty, Panel } from "../ui/bits.tsx";

export function Resources({ concept, discipline }: { concept?: string; discipline?: DisciplineId }) {
  const { db, links, refresh, toast } = useApp();
  const [f, setF] = useState<ResourceFilter>({ concept, discipline: discipline ?? "" });
  const [checking, setChecking] = useState<string | null>(null);
  const list = filterResources(RESOURCES, f, links);

  const checkAll = async () => {
    let bad = 0;
    for (const r of list) {
      setChecking(r.title);
      try {
        const s = await checkLink(r.url);
        if (!s.ok) bad++;
        await repo.saveLinkCheck(db, r.id, s);
      } catch (e) {
        toast(`Link checker unavailable: ${String(e)}`, "err");
        break;
      }
    }
    setChecking(null);
    await refresh();
    toast(bad ? `${bad} link(s) did not answer cleanly; they're marked in the table.` : "All checked links answered.", bad ? "warn" : "ok");
  };

  return (
    <div className="page">
      <div className="row">
        <h1>FREE RESOURCES</h1>
        <span className="dim">{RESOURCES.length} human-curated entries · links open in your browser</span>
        <span className="spacer" />
        <button className="btn" disabled={checking !== null} onClick={checkAll}>{checking ? `Checking ${checking}…` : `Check ${list.length} links`}</button>
      </div>
      <Panel title="Filter">
        <div className="row">
          <input type="search" placeholder="Search title, provider, topic…" value={f.text ?? ""} onChange={(e) => setF({ ...f, text: e.target.value })} style={{ minWidth: 260 }} aria-label="Search resources" />
          <select value={f.discipline ?? ""} onChange={(e) => setF({ ...f, discipline: e.target.value as DisciplineId | "" })} aria-label="Subject">
            <option value="">All subjects</option>{DISCIPLINES.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={f.kind ?? ""} onChange={(e) => setF({ ...f, kind: e.target.value as ResourceKind | "" })} aria-label="Format">
            <option value="">All formats</option>{(Object.keys(KIND_LABEL) as ResourceKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <select value={f.access ?? ""} onChange={(e) => setF({ ...f, access: e.target.value as Access | "" })} aria-label="Access">
            <option value="">Any access</option>{(Object.keys(ACCESS_LABEL) as Access[]).map((k) => <option key={k} value={k}>{ACCESS_LABEL[k]}</option>)}
          </select>
          <select value={f.level ?? ""} onChange={(e) => setF({ ...f, level: e.target.value as Level | "" })} aria-label="Level">
            <option value="">Any level</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
          </select>
          <label className="chk"><input type="checkbox" checked={f.minHandsOn === 3} onChange={(e) => setF({ ...f, minHandsOn: e.target.checked ? 3 : undefined })} /> Very hands-on only</label>
          <label className="chk"><input type="checkbox" checked={!!f.hideBroken} onChange={(e) => setF({ ...f, hideBroken: e.target.checked })} /> Hide failed links</label>
          {f.concept && <button className="chip on" onClick={() => setF({ ...f, concept: undefined })}>{conceptName(f.concept)} ×</button>}
        </div>
      </Panel>
      {list.length ? (
        <table className="sheet">
          <thead><tr><th>Resource</th><th>Format</th><th>Access (curated)</th><th>Level</th><th>Hands-on</th><th>Link status</th><th></th></tr></thead>
          <tbody>
            {list.map((r) => {
              const s = links.get(r.id);
              return (
                <tr key={r.id}>
                  <td><b>{r.title}</b> <span className="small dim">· {r.provider}</span><div className="small prose">{r.why}</div>{r.versionNote && <div className="small warn">Version note: {r.versionNote}</div>}<div className="small dim">Needs: {r.prerequisites}</div></td>
                  <td>{KIND_LABEL[r.kind]}</td>
                  <td className="small">{ACCESS_LABEL[r.access]}<div className="dim">{r.accessNote}</div></td>
                  <td>{r.level}</td>
                  <td className="num">{"■".repeat(r.handsOn)}{"□".repeat(3 - r.handsOn)}</td>
                  <td className="small">{s ? <span className={s.ok ? "ok" : "err"}>{s.ok ? "OK" : `FAIL ${s.status ?? ""}`}<div className="dim">{s.checkedAt.slice(0, 10)}</div>{s.error && <div className="dim">{s.error}</div>}</span> : <span className="dim">not checked</span>}</td>
                  <td><button className="btn small" onClick={() => openExternal(r.url).catch((e) => toast(String(e), "err"))}>Open ↗</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : <Empty title="NO MATCHES">Clear a filter to see more.</Empty>}
      <div className="small dim">Every entry was curated by hand on {RESOURCES[0].curatedOn}; "Access" describes the provider's terms at curation time. Link checks only confirm the page answers; they don't re-verify pricing. Video discovery with thumbnails is planned for a later phase.</div>
    </div>
  );
}
