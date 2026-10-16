import { useCallback, useEffect, useMemo, useState } from "react";
import { MISSIONS, MISSION_BY_ID } from "../core/missions/index.ts";
import { availableTiers, excludeReason, instantiate, rank, resolveTier, roll, variantFor, type MissionCriteria } from "../core/missions/engine.ts";
import { DISCIPLINES, DISCIPLINE_BY_ID } from "../core/catalog/subjects.ts";
import { HARDWARE_LABEL, STYLE_LABEL, TIERS, TIER_BLURB, TIER_LABEL, type DisciplineId, type Hardware, type MissionInstance, type MissionStyle } from "../core/types.ts";
import { isSeed, newSeed } from "../core/rng.ts";
import * as repo from "../db/repo.ts";
import { useApp } from "../state/store.tsx";
import { criteriaFrom, useRecContext } from "../state/missionCtx.ts";
import { Empty, Panel } from "../ui/bits.tsx";
import { MissionPreview } from "../ui/MissionPreview.tsx";

const TIME_OPTIONS: [string, number | null][] = [["Any length", null], ["≤ 30 min", 30], ["≤ 1 hour", 60], ["≤ 2 hours", 120], ["≤ half day", 240]];
const LANGS: [string, string][] = [["python", "Python"], ["c", "C"], ["rust", "Rust"], ["go", "Go"], ["javascript", "JavaScript"], ["csharp", "C#"], ["gdscript", "GDScript"]];

export function Board({ discipline, preview }: { discipline?: DisciplineId; preview?: MissionInstance }) {
  const { db, settings, setSetting, go, toast, refresh } = useApp();
  const ctx = useRecContext();
  const [crit, setCrit] = useState<MissionCriteria>(() => ({ ...criteriaFrom(settings), disciplines: discipline ? [discipline] : [], tier: preview?.requestedTier ?? settings.defaultTier }));
  const [seed, setSeed] = useState(() => preview?.seed ?? newSeed());
  const [lock, setLock] = useState<string | null>(preview?.templateId ?? null);
  const [current, setCurrent] = useState<{ inst: MissionInstance; reasons: string[] } | null>(preview ? { inst: preview, reasons: [] } : null);
  const [seedInput, setSeedInput] = useState("");
  const [showExcluded, setShowExcluded] = useState(false);

  // Persist the filters people actually tune, so the board remembers them.
  const update = (patch: Partial<MissionCriteria>) => {
    setCrit((c) => ({ ...c, ...patch }));
    if (patch.tier) void setSetting("defaultTier", patch.tier);
    if (patch.maxMinutes !== undefined) void setSetting("maxMinutes", patch.maxMinutes);
    if (patch.hasLinux !== undefined) void setSetting("hasLinux", patch.hasLinux);
    if (patch.hardware) void setSetting("hardware", patch.hardware);
    if (patch.allowSimulated !== undefined) void setSetting("allowSimulated", patch.allowSimulated);
    if (patch.offlineOnly !== undefined) void setSetting("offlineOnly", patch.offlineOnly);
    if (patch.languages) void setSetting("languages", patch.languages);
  };

  const doRoll = useCallback(
    (s: string, opts: { lockTemplate?: string; exclude?: string } = {}) => {
      if (!ctx) return;
      const r = roll(MISSIONS, crit, ctx, s, { lockTemplate: opts.lockTemplate, excludeTemplate: opts.exclude });
      setCurrent(r ? { inst: r.instance, reasons: r.reasons } : null);
    },
    [ctx, crit],
  );

  // Re-roll when filters change (keeping a locked template if it still fits).
  useEffect(() => {
    if (!ctx) return;
    if (lock && MISSION_BY_ID.has(lock) && excludeReason(MISSION_BY_ID.get(lock)!, crit) === null) doRoll(seed, { lockTemplate: lock });
    else doRoll(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, crit]);

  const reroll = useCallback(() => {
    const s = newSeed();
    setSeed(s);
    setLock(null);
    doRoll(s, { exclude: current?.inst.templateId });
  }, [doRoll, current]);

  const rerollParams = () => {
    if (!current) return;
    const s = newSeed();
    setSeed(s);
    setLock(current.inst.templateId);
    doRoll(s, { lockTemplate: current.inst.templateId });
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select")) return;
      if (e.key === "r" && !e.ctrlKey && !e.metaKey && !e.altKey) reroll();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [reroll]);

  const accept = async () => {
    if (!current) return;
    const id = await repo.startRun(db, current.inst);
    await refresh();
    toast(`ACCESS GRANTED: ${current.inst.title} is now in your Lab.`);
    go({ name: "lab", runId: id });
  };

  const pickTemplate = (id: string) => {
    if (!ctx) return;
    setLock(id);
    const t = MISSION_BY_ID.get(id)!;
    setCurrent({ inst: instantiate(t, crit.tier, seed, crit.languages), reasons: rank([t], ctx)[0].reasons });
    document.querySelector(".main")?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const applySeed = () => {
    const s = seedInput.trim().toUpperCase();
    if (!isSeed(s)) {
      toast("Seeds look like BQ-7F3K-92QD.", "warn");
      return;
    }
    setSeed(s);
    if (current) {
      setLock(current.inst.templateId);
      doRoll(s, { lockTemplate: current.inst.templateId });
    } else doRoll(s);
  };

  const ranked = useMemo(() => (ctx ? rank(MISSIONS, ctx) : []), [ctx]);
  const fitting = ranked.filter((r) => excludeReason(r.template, crit) === null);
  const excluded = ranked.filter((r) => excludeReason(r.template, crit) !== null);

  const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

  return (
    <div className="page">
      <div className="row">
        <h1>MISSION BOARD</h1>
        <span className="dim">{fitting.length} of {MISSIONS.length} missions fit your filters · rerolls are unlimited and free</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 340px) 1fr", gap: "var(--gap)", alignItems: "start" }}>
        <Panel title="Parameters">
          <div className="stack">
            <div className="field">
              <span>Difficulty</span>
              <select value={crit.tier} onChange={(e) => update({ tier: e.target.value as typeof crit.tier })}>
                {TIERS.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
              </select>
              <span className="small dim" style={{ textTransform: "none", letterSpacing: 0 }}>{TIER_BLURB[crit.tier]}</span>
            </div>
            <div className="field">
              <span>Time available</span>
              <select value={String(crit.maxMinutes)} onChange={(e) => update({ maxMinutes: e.target.value === "null" ? null : Number(e.target.value) })}>
                {TIME_OPTIONS.map(([l, v]) => <option key={l} value={String(v)}>{l}</option>)}
              </select>
            </div>
            <div className="field">
              <span>Subjects</span>
              <div className="row" style={{ gap: 4 }}>
                {DISCIPLINES.filter((d) => MISSIONS.some((m) => m.discipline === d.id || m.secondary?.includes(d.id))).map((d) => (
                  <button key={d.id} className={`chip ${crit.disciplines.includes(d.id) ? "on" : ""}`} onClick={() => update({ disciplines: toggle(crit.disciplines, d.id) })} title={d.name}>{d.code}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>Mission style</span>
              <div className="row" style={{ gap: 4 }}>
                {(Object.keys(STYLE_LABEL) as MissionStyle[]).filter((s) => MISSIONS.some((m) => m.style === s)).map((s) => (
                  <button key={s} className={`chip ${crit.styles.includes(s) ? "on" : ""}`} onClick={() => update({ styles: toggle(crit.styles, s) })}>{STYLE_LABEL[s]}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>Languages you'd like to use</span>
              <div className="row" style={{ gap: 4 }}>
                {LANGS.map(([id, l]) => (
                  <button key={id} className={`chip ${crit.languages.includes(id) ? "on" : ""}`} onClick={() => update({ languages: toggle(crit.languages, id) })}>{l}</button>
                ))}
              </div>
              <label className="chk small"><input type="checkbox" checked={crit.strictLanguages} onChange={(e) => update({ strictLanguages: e.target.checked })} /> Only coding missions in these</label>
            </div>
            <div className="field">
              <span>Your setup</span>
              <label className="chk"><input type="checkbox" checked={crit.hasLinux} onChange={(e) => update({ hasLinux: e.target.checked })} /> I have Linux (WSL, VM or Pi)</label>
              {(["arduino", "esp32", "raspberry-pi"] as Hardware[]).map((h) => (
                <label key={h} className="chk"><input type="checkbox" checked={crit.hardware.includes(h)} onChange={() => update({ hardware: toggle(crit.hardware, h) })} /> {HARDWARE_LABEL[h]}</label>
              ))}
              <label className="chk"><input type="checkbox" checked={crit.allowSimulated} onChange={(e) => update({ allowSimulated: e.target.checked })} /> Simulators OK (Wokwi)</label>
              <label className="chk"><input type="checkbox" checked={crit.offlineOnly} onChange={(e) => update({ offlineOnly: e.target.checked })} /> Offline only</label>
            </div>
          </div>
        </Panel>

        <div className="stack">
          <Panel
            title="Mission"
            meta={current ? `seed ${current.inst.seed}` : undefined}
            actions={
              <div className="row" style={{ gap: 4 }}>
                <input type="text" placeholder="BQ-XXXX-XXXX" value={seedInput} onChange={(e) => setSeedInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applySeed()} style={{ width: 140, minHeight: 22 }} aria-label="Seed" />
                <button className="btn small" onClick={applySeed}>Use seed</button>
              </div>
            }
          >
            {current ? (
              <div className="stack">
                <MissionPreview inst={current.inst} reasons={current.reasons} />
                <div className="row">
                  <button className="btn primary" onClick={accept}>ACCEPT MISSION</button>
                  <button className="btn" onClick={reroll}>Reroll mission <span className="k">R</span></button>
                  <button className="btn" onClick={rerollParams} title="Same mission, new numbers, files and answer key">Reroll parameters</button>
                  <span className="small dim">Tier: {availableTiers(MISSION_BY_ID.get(current.inst.templateId)!).map((t) => TIER_LABEL[t]).join(" / ")}</span>
                </div>
              </div>
            ) : (
              <Empty title="NO MISSIONS MATCH">
                <p>Loosen a filter on the left: allow more time, simulators, or more subjects.</p>
              </Empty>
            )}
          </Panel>

          <Panel title="Mission catalog" meta="ranked for you · click to preview">
            <table className="sheet">
              <thead>
                <tr><th>Mission</th><th>Subject</th><th>Style</th><th>At {TIER_LABEL[crit.tier]}</th><th>Tiers</th><th>Why</th></tr>
              </thead>
              <tbody>
                {fitting.map(({ template: t, reasons }) => {
                  const tier = resolveTier(t, crit.tier);
                  return (
                    <tr key={t.id} className="click" onClick={() => pickTemplate(t.id)}>
                      <td><b>{t.title}</b><div className="small dim">{t.tagline}</div></td>
                      <td>{DISCIPLINE_BY_ID.get(t.discipline)?.code}</td>
                      <td>{STYLE_LABEL[t.style]}</td>
                      <td className="num">{variantFor(t, tier).minutes} min{tier !== crit.tier ? <div className="small dim">as {TIER_LABEL[tier]}</div> : null}</td>
                      <td className="small">{availableTiers(t).map((x) => TIER_LABEL[x][0]).join(" ")}</td>
                      <td className="small dim">{reasons.slice(0, 2).join(" · ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {excluded.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <button className="btn small" onClick={() => setShowExcluded((s) => !s)}>{showExcluded ? "Hide" : "Show"} {excluded.length} filtered out</button>
                {showExcluded && (
                  <table className="sheet" style={{ marginTop: 6 }}>
                    <tbody>
                      {excluded.map(({ template: t }) => (
                        <tr key={t.id}><td>{t.title}</td><td className="dim">{excludeReason(t, crit)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
