import { useCallback, useEffect, useRef, useState } from "react";
import * as repo from "../db/repo.ts";
import { HINT_LABEL, TIER_LABEL, type HintLevel } from "../core/types.ts";
import { conceptName, DISCIPLINE_BY_ID } from "../core/catalog/subjects.ts";
import { RESOURCE_BY_ID } from "../core/catalog/resources.ts";
import { briefMarkdown, missionFolderName } from "../core/safety.ts";
import { labOpen, labPrepare, openExternal } from "../platform/native.ts";
import { useApp } from "../state/store.tsx";
import { AutoText, Bar, CommandBlock, Confirm, Empty, Modal, Panel } from "../ui/bits.tsx";
import { Diagram } from "../ui/diagrams.tsx";

type Tab = "brief" | "steps" | "diagram" | "hints" | "verify" | "answers" | "resources" | "reflect";
const TABS: [Tab, string][] = [["brief", "Brief"], ["steps", "Steps"], ["diagram", "Diagram"], ["hints", "Hints"], ["verify", "Verify"], ["answers", "Answer key"], ["resources", "Resources"], ["reflect", "Reflect"]];

export function Lab({ runId }: { runId?: string }) {
  return runId ? <LabRun runId={runId} /> : <LabIndex />;
}

function LabIndex() {
  const { db, rev, go } = useApp();
  const [runs, setRuns] = useState<repo.Run[] | null>(null);
  useEffect(() => {
    void repo.listRuns(db).then(setRuns);
  }, [db, rev]);
  if (!runs) return null;
  const table = (list: repo.Run[], empty: string) =>
    list.length ? (
      <table className="sheet">
        <thead><tr><th>Mission</th><th>Subject</th><th>Tier</th><th>Progress</th><th>Updated</th></tr></thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.id} className="click" onClick={() => go({ name: "lab", runId: r.id })}>
              <td><b>{r.title}</b> <span className="small dim">{r.seed}</span></td>
              <td>{DISCIPLINE_BY_ID.get(r.discipline)?.name}</td>
              <td>{TIER_LABEL[r.tier]}</td>
              <td style={{ minWidth: 140 }}>
                <Bar value={r.verifyDone.length} max={r.instance.variant.verify.length} />
                <span className="small dim">{r.verifyDone.length}/{r.instance.variant.verify.length} verified</span>
              </td>
              <td className="small dim">{r.updatedAt.slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : <div className="dim small">{empty}</div>;
  return (
    <div className="page">
      <h1>PROJECT LAB</h1>
      <Panel title="Active missions">
        {runs.some((r) => r.status === "active") ? table(runs.filter((r) => r.status === "active"), "") : (
          <Empty title="LAB IDLE">
            <p>No active missions. <button className="btn small" onClick={() => go({ name: "board" })}>Open the mission board</button></p>
          </Empty>
        )}
      </Panel>
      <Panel title="Shelved" meta="paused, no penalty; pick up any time">{table(runs.filter((r) => r.status === "shelved"), "Nothing shelved.")}</Panel>
      <Panel title="Completed" meta="your project history">{table(runs.filter((r) => r.status === "completed"), "Nothing completed yet.")}</Panel>
    </div>
  );
}

function loadSplit(): number {
  try {
    const v = Number(localStorage.getItem("bq.labSplit"));
    return v >= 30 && v <= 75 ? v : 58;
  } catch {
    return 58;
  }
}

function LabRun({ runId }: { runId: string }) {
  const { db, settings, setSetting, toast, refresh, go, rev } = useApp();
  const [run, setRun] = useState<repo.Run | null | undefined>(undefined);
  const [evidence, setEvidence] = useState<repo.Evidence[]>([]);
  const [tab, setTab] = useState<Tab>("brief");
  const [split, setSplit] = useState(loadSplit);
  const [drag, setDrag] = useState(false);
  const [confirmAnswers, setConfirmAnswers] = useState(false);
  const [confirmHint, setConfirmHint] = useState(false);
  const [overwriteAsk, setOverwriteAsk] = useState<string[] | null>(null);
  const [debrief, setDebrief] = useState(false);
  const [evKind, setEvKind] = useState<repo.EvidenceKind>("result");
  const [evText, setEvText] = useState("");
  const body = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await repo.getRun(db, runId);
    setRun(r);
    if (r) setEvidence(await repo.listEvidence(db, runId));
  }, [db, runId]);
  useEffect(() => {
    void load();
  }, [load, rev]);

  useEffect(() => {
    if (!drag) return;
    const move = (e: MouseEvent) => {
      const rect = body.current?.getBoundingClientRect();
      if (!rect) return;
      const pct = Math.min(75, Math.max(30, ((e.clientX - rect.left) / rect.width) * 100));
      setSplit(pct);
    };
    const up = () => {
      setDrag(false);
      try {
        localStorage.setItem("bq.labSplit", String(Math.round(split)));
      } catch {
        /* storage unavailable: keep the in-memory value */
      }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [drag, split]);

  if (run === undefined) return null;
  if (run === null) return <div className="page"><Empty title="MISSION NOT FOUND">It may have been deleted.</Empty></div>;

  const inst = run.instance;
  const v = inst.variant;
  const hl = settings.hintLevel;
  const showWhy = hl === "generous" || hl === "standard";
  const patch = async (p: repo.RunPatch) => {
    await repo.updateRun(db, run.id, p);
    await load();
  };
  const toggleIn = (list: number[], i: number) => (list.includes(i) ? list.filter((x) => x !== i) : [...list, i].sort((a, b) => a - b));
  const allVerified = new Set(run.verifyDone).size >= v.verify.length;
  const editable = run.status !== "completed";

  const prepare = async (overwrite: boolean) => {
    if (!settings.labRoot) {
      toast("Choose a lab folder in Settings first.", "warn");
      return;
    }
    try {
      const files = [{ name: "BRIEF.md", content: briefMarkdown(inst) }, ...inst.files];
      const res = await labPrepare(settings.labRoot, missionFolderName(inst, new Date(run.startedAt)), files, overwrite);
      await patch({ projectPath: res.folder });
      if (res.skipped.length && !overwrite) setOverwriteAsk(res.skipped);
      toast(`Project folder ready: ${res.written.length} file(s) written${res.skipped.length ? `, ${res.skipped.length} already existed (kept)` : ""}.`);
    } catch (e) {
      toast(`Couldn't prepare the folder: ${String(e)}`, "err");
    }
  };

  const open = async (tool: repo.EditorTool) => {
    if (!run.projectPath) return;
    try {
      toast(await labOpen(run.projectPath, tool));
    } catch (e) {
      toast(String(e), "err");
    }
  };

  const revealHint = () => {
    if (hl === "minimal" && !confirmHint) {
      setConfirmHint(true);
      return;
    }
    void patch({ hintsShown: hl === "generous" ? v.hints.length : Math.min(v.hints.length, run.hintsShown + 1) });
  };

  const left = (
    <div className="lab-pane">
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {label}
            {id === "verify" && ` ${run.verifyDone.length}/${v.verify.length}`}
            {id === "steps" && ` ${run.stepsDone.length}/${v.steps.length}`}
          </button>
        ))}
      </div>

      {tab === "brief" && (
        <div className="stack">
          <div className="inset prose">{v.objective}</div>
          <h3>This tier requires</h3>
          <ul className="clean">{v.demands.map((d) => <li key={d}>{d}</li>)}</ul>
          <h3>Tools</h3>
          <ul className="clean">{inst.tools.map((t) => <li key={t}>{t}</li>)}</ul>
          <h3>Setup</h3>
          <ul className="clean prose">{inst.setup.map((t) => <li key={t}>{t}</li>)}</ul>
          <h3>Safety boundaries</h3>
          <ul className="clean prose">{inst.safety.map((t) => <li key={t}>{t}</li>)}</ul>
          <h3>Deliverable</h3>
          <div className="prose">{v.deliverable}</div>
          <div className="small dim">Teaches: {inst.concepts.map(conceptName).join(", ")} · Prerequisites: {inst.prerequisites.map(conceptName).join(", ") || "none"}</div>
        </div>
      )}

      {tab === "steps" && (
        <div>
          {v.steps.map((s, i) => (
            <div key={i} className={`step ${run.stepsDone.includes(i) ? "done" : ""}`}>
              <div className="stack" style={{ gap: 4, alignItems: "center" }}>
                <span className="n">{i + 1}</span>
                <input type="checkbox" disabled={!editable} checked={run.stepsDone.includes(i)} onChange={() => void patch({ stepsDone: toggleIn(run.stepsDone, i) })} aria-label={`Step ${i + 1} done`} />
              </div>
              <div>
                <div className="txt prose">{s.text}</div>
                {s.why && showWhy && <div className="why">{s.why}</div>}
                {s.cmd?.map((c, k) => <CommandBlock key={k} c={c} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "diagram" && <Diagram id={inst.diagram} params={inst.diagramParams} caption={inst.diagramCaption} />}

      {tab === "hints" && (
        <div className="stack">
          <div className="row small dim">
            Hint level:
            <select value={hl} onChange={(e) => void setSetting("hintLevel", e.target.value as HintLevel)}>
              {(Object.keys(HINT_LABEL) as HintLevel[]).map((h) => <option key={h} value={h}>{HINT_LABEL[h]}</option>)}
            </select>
          </div>
          {hl === "off" ? (
            <div className="dim">Hints are switched off. Change the hint level above if you get stuck. Using hints never costs anything.</div>
          ) : (
            <>
              {v.hints.slice(0, run.hintsShown).map((h, i) => (
                <div key={i} className="hint"><span className="retro">HINT {i + 1}</span><div className="prose">{h}</div></div>
              ))}
              {run.hintsShown < v.hints.length ? (
                <button className="btn" onClick={revealHint}>{run.hintsShown ? "Next hint" : "Show a hint"} ({v.hints.length - run.hintsShown} left)</button>
              ) : <div className="small dim">All hints shown.</div>}
            </>
          )}
        </div>
      )}

      {tab === "verify" && (
        <div className="stack">
          <p className="prose dim">Tick each criterion only once you've actually observed it. Completing the mission records demonstrated skill, so it requires all of them.</p>
          {v.verify.map((c, i) => (
            <label key={i} className="chk prose" style={{ alignItems: "flex-start" }}>
              <input type="checkbox" disabled={!editable} checked={run.verifyDone.includes(i)} onChange={() => void patch({ verifyDone: toggleIn(run.verifyDone, i) })} style={{ marginTop: 4 }} />
              <span>{c}</span>
            </label>
          ))}
          {inst.files.length > 0 && (
            <>
              <h3>Generated files</h3>
              <table className="sheet"><tbody>{inst.files.map((f) => <tr key={f.name}><td><code>{f.name}</code></td><td className="small">{f.note}</td></tr>)}</tbody></table>
            </>
          )}
        </div>
      )}

      {tab === "answers" && (
        <div className="stack">
          {!inst.answers.length ? (
            <div className="dim prose">This mission has no generated answer key; its verification criteria are the check. Compare with the resources tab or your own tests.</div>
          ) : run.answersRevealed ? (
            inst.answers.map((a, i) => (
              <div key={i} className="answer"><div className="small dim">{a.label}</div><pre className="code" style={{ whiteSpace: "pre-wrap" }}>{a.value}</pre></div>
            ))
          ) : (
            <>
              <p className="prose">The answer key for seed <b>{inst.seed}</b> is computed by BYTEQUEST's own reference code. Try to finish first. Looking is allowed, never penalised, and noted in your history.</p>
              <button className="btn" onClick={() => setConfirmAnswers(true)}>Reveal answer key</button>
            </>
          )}
        </div>
      )}

      {tab === "resources" && (
        <div className="stack">
          {inst.resources.map((id) => RESOURCE_BY_ID.get(id)).filter((r) => r !== undefined).map((r) => (
            <div key={r.id} className="inset">
              <div className="row"><b>{r.title}</b><span className="dim small">{r.provider}</span><span className="spacer" />
                <button className="btn small" onClick={() => openExternal(r.url).catch((e) => toast(String(e), "err"))}>Open ↗</button>
              </div>
              <div className="prose small">{r.why}</div>
              <div className="small dim">{r.accessNote}</div>
            </div>
          ))}
          {inst.extensions.length > 0 && (<><h3>Optional extensions</h3><ul className="clean prose">{[...(v.extensions ?? []), ...inst.extensions].map((e) => <li key={e}>{e}</li>)}</ul></>)}
        </div>
      )}

      {tab === "reflect" && (
        <div className="stack">
          <p className="prose dim">Answer in your own words. These are saved with the mission and shown again in your journal.</p>
          {inst.reflection.map((q, i) => (
            <div key={i} className="stack" style={{ gap: 4 }}>
              <b className="prose">{q}</b>
              <AutoText label={q} rows={3} value={run.reflection[String(i)] ?? ""} onSave={(t) => patch({ reflection: { ...run.reflection, [String(i)]: t } })} />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const right = (
    <div className="lab-pane">
      <Panel title="Project folder">
        {run.projectPath ? (
          <div className="stack">
            <code className="small" style={{ wordBreak: "break-all" }}>{run.projectPath}</code>
            <div className="row" style={{ gap: 4 }}>
              {(["vscode", "terminal", "nvim", "vim", "explorer"] as repo.EditorTool[]).map((t) => (
                <button key={t} className={`btn small ${settings.editor === t ? "on" : ""}`} onClick={() => void open(t)}>
                  {{ vscode: "VS Code", terminal: "Terminal", nvim: "Neovim", vim: "Vim", explorer: "Explorer" }[t]}
                </button>
              ))}
            </div>
            <button className="btn small" onClick={() => void prepare(false)}>Re-write missing files</button>
          </div>
        ) : (
          <div className="stack">
            <p className="small dim">Creates <code>{missionFolderName(inst, new Date(run.startedAt))}</code> inside your lab folder with BRIEF.md{inst.files.length ? ` and ${inst.files.map((f) => f.name).join(", ")}` : ""}. Nothing outside that folder is touched.</p>
            <button className="btn" disabled={!editable} onClick={() => void prepare(false)}>Prepare project folder</button>
          </div>
        )}
      </Panel>
      <Panel title="Notes" meta="autosaves">
        <AutoText label="Mission notes" rows={12} value={run.notes} onSave={(t) => patch({ notes: t })} placeholder={"What you tried, commands that worked, what broke...\n\nMarkdown is fine."} />
      </Panel>
      <Panel title="Evidence log" meta="results, outputs, paths, links">
        <div className="stack">
          {editable && (
            <div className="row" style={{ gap: 4 }}>
              <select value={evKind} onChange={(e) => setEvKind(e.target.value as repo.EvidenceKind)} aria-label="Evidence type">
                <option value="result">Result</option><option value="note">Note</option><option value="path">File/screenshot path</option><option value="link">Link</option>
              </select>
              <input type="text" style={{ flex: 1 }} value={evText} placeholder="e.g. broadcast = 10.42.103.255, or C:\lab\capture.png" onChange={(e) => setEvText(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && evText.trim()) {
                    await repo.addEvidence(db, run.id, evKind, evText);
                    setEvText("");
                    await load();
                  }
                }} aria-label="Evidence text" />
              <button className="btn small" onClick={async () => { await repo.addEvidence(db, run.id, evKind, evText); setEvText(""); await load(); }}>Add</button>
            </div>
          )}
          {evidence.length ? (
            <table className="sheet"><tbody>
              {evidence.map((e) => (
                <tr key={e.id}>
                  <td className="small dim" style={{ width: 70 }}>{e.kind}</td>
                  <td style={{ wordBreak: "break-word" }}>{e.body}</td>
                  <td className="small dim" style={{ width: 90 }}>{e.createdAt.slice(5, 16).replace("T", " ")}</td>
                  {editable && <td style={{ width: 30 }}><button className="btn small" aria-label="Delete" onClick={async () => { await repo.deleteEvidence(db, e.id); await load(); }}>×</button></td>}
                </tr>
              ))}
            </tbody></table>
          ) : <div className="small dim">No evidence yet. Paste real outputs here as you go; they make the debrief easy.</div>}
        </div>
      </Panel>
    </div>
  );

  return (
    <div className="lab-wrap">
      <div className="lab-head">
        <div className="stack" style={{ gap: 0 }}>
          <span className="retro">{DISCIPLINE_BY_ID.get(inst.discipline)?.code} · {TIER_LABEL[inst.tier]} · {inst.seed}{inst.lang ? ` · ${inst.params.lang ?? inst.lang}` : ""}</span>
          <h2>{inst.title}</h2>
        </div>
        <span className="spacer" />
        <span className={`chip ${run.status === "completed" ? "ok" : run.status === "shelved" ? "dim" : ""}`}>{run.status.toUpperCase()}</span>
        {run.answersRevealed && <span className="chip dim">answer key viewed</span>}
        {run.status === "active" && (
          <>
            <button className="btn" onClick={async () => { await repo.setRunStatus(db, run.id, "shelved"); await refresh(); toast("Shelved. Pick it up whenever you like."); }}>Shelve</button>
            <button className="btn primary" disabled={!allVerified} title={allVerified ? "" : "Tick every verification criterion first"} onClick={() => setDebrief(true)}>Complete mission</button>
          </>
        )}
        {run.status === "shelved" && <button className="btn primary" onClick={async () => { await repo.setRunStatus(db, run.id, "active"); await refresh(); }}>Resume</button>}
        {run.status !== "active" && <button className="btn" onClick={() => go({ name: "board", preview: undefined })}>New mission</button>}
      </div>
      <div className="lab-body" ref={body} style={{ gridTemplateColumns: `${split}% 6px 1fr` }}>
        {left}
        <div className={`splitter ${drag ? "drag" : ""}`} onMouseDown={() => setDrag(true)} role="separator" aria-orientation="vertical" aria-label="Resize panes" />
        {right}
      </div>

      {confirmAnswers && (
        <Confirm title="Reveal the answer key?" confirmLabel="Reveal" onCancel={() => setConfirmAnswers(false)} onConfirm={() => { setConfirmAnswers(false); void patch({ answersRevealed: true }); }}>
          <p className="prose">Comparing against the key is a fine way to check your work. If you haven't tried yet, a hint might teach you more.</p>
        </Confirm>
      )}
      {confirmHint && (
        <Confirm title="Show a hint?" confirmLabel="Show hint" onCancel={() => setConfirmHint(false)} onConfirm={() => { setConfirmHint(false); void patch({ hintsShown: Math.min(v.hints.length, run.hintsShown + 1) }); }}>
          <p className="prose">Your hint level is Minimal. Hints never cost anything; this is just a speed bump.</p>
        </Confirm>
      )}
      {overwriteAsk && (
        <Confirm title="Some files already exist" confirmLabel="Overwrite them" danger onCancel={() => setOverwriteAsk(null)} onConfirm={() => { setOverwriteAsk(null); void prepare(true); }}>
          <p className="prose">These files were kept because they already exist in the project folder:</p>
          <ul className="clean">{overwriteAsk.map((f) => <li key={f}><code>{f}</code></li>)}</ul>
          <p className="warn">Overwriting replaces them with fresh copies for this seed. Any edits you made to them will be lost.</p>
        </Confirm>
      )}
      {debrief && <Debrief run={run} onClose={() => setDebrief(false)} onDone={async () => { setDebrief(false); await refresh(); await load(); }} />}
    </div>
  );
}

function Debrief({ run, onClose, onDone }: { run: repo.Run; onClose: () => void; onDone: () => Promise<void> }) {
  const { db, toast } = useApp();
  const [conf, setConf] = useState<Record<string, number>>({});
  const [f, setF] = useState({ built: run.instance.variant.deliverable, wentWrong: "", fixed: "", learned: "", unclear: "", nextTry: "", mistake: "" });
  const [busy, setBusy] = useState(false);
  const field = (k: keyof typeof f, label: string) => (
    <label className="field"><span>{label}</span><textarea rows={2} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
  );
  const submit = async () => {
    setBusy(true);
    try {
      await repo.completeRun(db, run.id, { confidence: conf, ...f });
      toast("SKILL UNLOCKED: mission complete. Recall prompts scheduled.");
      await onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "err");
      setBusy(false);
    }
  };
  return (
    <Modal title="Mission debrief" wide onClose={onClose} footer={<><button className="btn" onClick={onClose}>Not yet</button><button className="btn primary" disabled={busy} onClick={submit}>Log completion</button></>}>
      <p className="prose dim">This becomes a journal entry. Your confidence ratings set when the first recall prompts come back (lower confidence = sooner).</p>
      <h3>How confident are you with each concept?</h3>
      <table className="sheet"><tbody>
        {run.instance.concepts.map((c) => (
          <tr key={c}>
            <td>{conceptName(c)}</td>
            <td>
              <div className="seg">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} className={`btn small ${conf[c] === n ? "on" : ""}`} onClick={() => setConf({ ...conf, [c]: n })}>{n}</button>
                ))}
              </div>
            </td>
          </tr>
        ))}
      </tbody></table>
      <div className="small dim">1 = shaky, could not redo it alone · 5 = could teach it</div>
      <div className="grid2">
        {field("built", "What I built")}
        {field("wentWrong", "What went wrong")}
        {field("fixed", "How I fixed it")}
        {field("learned", "What I learned")}
        {field("unclear", "What I still don't understand")}
        {field("nextTry", "What I want to try next")}
      </div>
      {field("mistake", "A mistake worth remembering (saved to these concepts)")}
    </Modal>
  );
}
