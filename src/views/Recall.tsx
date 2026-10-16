import { useEffect, useState } from "react";
import * as repo from "../db/repo.ts";
import { RESULT_LABEL, dueLabel, type RecallResult } from "../core/recall.ts";
import { MISSION_BY_ID } from "../core/missions/index.ts";
import { conceptName } from "../core/catalog/subjects.ts";
import { useApp } from "../state/store.tsx";
import { Empty, Panel } from "../ui/bits.tsx";

export function Recall() {
  const { db, rev, refresh, toast } = useApp();
  const [all, setAll] = useState<repo.Review[]>([]);
  const [attempt, setAttempt] = useState("");
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    void repo.listReviews(db).then(setAll);
  }, [db, rev]);
  const now = new Date();
  const due = all.filter((r) => new Date(r.dueAt) <= now);
  const upcoming = all.filter((r) => new Date(r.dueAt) > now);
  const cur = due[0];

  const next = async () => {
    setAttempt("");
    setRevealed(false);
    await refresh();
  };
  const answer = async (res: RecallResult) => {
    await repo.answerReview(db, cur.id, res);
    if (res === "solid") toast("PATCH APPLIED: interval extended.");
    await next();
  };

  return (
    <div className="page">
      <div className="row">
        <h1>RECALL</h1>
        <span className="dim">{due.length} due · {upcoming.length} scheduled · postponing is always free</span>
      </div>
      {cur ? (
        <Panel className="recall-card" title={`Prompt 1 of ${due.length}`} meta={MISSION_BY_ID.get(cur.templateId)?.title ?? cur.templateId}>
          <div className="stack">
            <div className="prose" style={{ fontSize: "1.2em" }}>{cur.prompt}</div>
            <div className="small dim">Concepts: {cur.concepts.map(conceptName).join(", ")} · reviewed {cur.timesReviewed}× · interval {cur.intervalDays} d</div>
            <label className="field"><span>Your answer, from memory (not graded by the app)</span>
              <textarea rows={5} value={attempt} onChange={(e) => setAttempt(e.target.value)} placeholder="Explain it, sketch it in text, or write the code. Then reveal." /></label>
            {!revealed ? (
              <div className="row">
                <button className="btn primary" onClick={() => setRevealed(true)}>Reveal key points</button>
                <button className="btn" onClick={async () => { await repo.postponeReview(db, cur.id, 1); await next(); }}>Postpone 1 day</button>
                <button className="btn" onClick={async () => { await repo.postponeReview(db, cur.id, 7); await next(); }}>Postpone 1 week</button>
              </div>
            ) : (
              <>
                <div className="answer prose">{cur.answer}</div>
                <div className="row">
                  <span className="dim">How did you do?</span>
                  {(Object.keys(RESULT_LABEL) as RecallResult[]).map((r) => (
                    <button key={r} className={`btn ${r === "solid" ? "primary" : ""}`} onClick={() => void answer(r)}>{RESULT_LABEL[r]}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </Panel>
      ) : (
        <Empty title={all.length ? "ALL CAUGHT UP" : "NOTHING TO RECALL YET"}>
          <p>{all.length ? "No prompts are due. Come back whenever; nothing expires." : "Complete a mission and its recall prompts appear here a few days later."}</p>
        </Empty>
      )}
      {upcoming.length > 0 && (
        <Panel title="Scheduled">
          <table className="sheet">
            <thead><tr><th>Prompt</th><th>Mission</th><th>Due</th><th>Last</th><th></th></tr></thead>
            <tbody>
              {upcoming.map((r) => (
                <tr key={r.id}>
                  <td className="prose">{r.prompt}</td>
                  <td className="small">{MISSION_BY_ID.get(r.templateId)?.title}</td>
                  <td className="small">{dueLabel(r.dueAt, now)}</td>
                  <td className="small dim">{r.lastResult ? RESULT_LABEL[r.lastResult] : "-"}</td>
                  <td><button className="btn small" title="Stop scheduling this prompt" onClick={async () => { await repo.setReviewRetired(db, r.id, true); await refresh(); }}>Retire</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
