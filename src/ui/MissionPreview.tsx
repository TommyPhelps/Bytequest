import type { MissionInstance } from "../core/types.ts";
import { HARDWARE_LABEL, STYLE_LABEL, TIER_LABEL } from "../core/types.ts";
import { conceptName, DISCIPLINE_BY_ID } from "../core/catalog/subjects.ts";
import { readiness } from "../core/missions/engine.ts";
import { ReadyChip } from "./bits.tsx";
import { Diagram } from "./diagrams.tsx";
import { useApp } from "../state/store.tsx";

const ONLINE_LABEL = { offline: "Works offline", optional: "Internet optional", required: "Needs internet" } as const;
const OS_LABEL = { windows: "Windows", linux: "Linux (WSL, VM or Pi)", any: "Any OS" } as const;

export function MissionPreview({ inst, reasons, showDiagram = true }: { inst: MissionInstance; reasons?: string[]; showDiagram?: boolean }) {
  const { progress } = useApp();
  const v = inst.variant;
  const disc = DISCIPLINE_BY_ID.get(inst.discipline);
  return (
    <div className="stack">
      <div className="mcard">
        <div className="stack" style={{ gap: 4 }}>
          <div className="retro">NEW MISSION AVAILABLE · {disc?.code} · {STYLE_LABEL[inst.style].toUpperCase()}</div>
          <div className="title">{inst.title}</div>
          <div className="prose dim">{inst.tagline}</div>
        </div>
        <div className="stack" style={{ gap: 4, alignItems: "flex-end" }}>
          <span className="chip on">{TIER_LABEL[inst.tier]}</span>
          <span className="small dim">~{v.minutes} min</span>
          <span className="small dim">seed {inst.seed}</span>
        </div>
      </div>
      {inst.requestedTier !== inst.tier && (
        <div className="small dim">
          This mission has no {TIER_LABEL[inst.requestedTier]} variant yet; showing the nearest tier ({TIER_LABEL[inst.tier]}). Available: {inst.availableTiers.map((t) => TIER_LABEL[t]).join(", ")}.
        </div>
      )}
      <div className="inset prose">{v.objective}</div>
      <div className="grid2">
        <div className="stack" style={{ gap: 6 }}>
          <h3>This tier requires</h3>
          <ul className="clean">{v.demands.map((d) => <li key={d}>{d}</li>)}</ul>
          <h3>Deliverable</h3>
          <div className="prose">{v.deliverable}</div>
        </div>
        <div className="meta-grid">
          <span>Subject</span><span>{disc?.name}</span>
          <span>Runs on</span><span>{inst.os.map((o) => OS_LABEL[o]).join(" / ")}</span>
          <span>Hardware</span><span>{HARDWARE_LABEL[inst.hardware.needs]}{inst.hardware.simulatedOk ? " (or free simulator)" : ""}</span>
          <span>Network</span><span>{ONLINE_LABEL[inst.online]}</span>
          {inst.lang && (<><span>Language</span><span>{inst.params.lang ?? inst.lang}</span></>)}
          <span>Tools</span><span>{inst.tools.join(" · ")}</span>
          <span>Teaches</span><span>{inst.concepts.map(conceptName).join(", ")}</span>
          <span>Prereqs</span>
          <span className="row" style={{ gap: 4 }}>
            {inst.prerequisites.length ? inst.prerequisites.map((p) => (
              <span key={p} className="row" style={{ gap: 3 }}>{conceptName(p)} <ReadyChip r={readiness(progress.get(p))} /></span>
            )) : "none"}
          </span>
        </div>
      </div>
      {reasons && reasons.length > 0 && (
        <div className="small dim">Why this mission: {reasons.join(" · ")}</div>
      )}
      {showDiagram && <Diagram id={inst.diagram} params={inst.diagramParams} caption={inst.diagramCaption} />}
    </div>
  );
}
