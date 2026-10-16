import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Readiness } from "../core/missions/engine.ts";
import type { Command } from "../core/types.ts";
import { EFFECT_LABEL, needsConfirm } from "../core/safety.ts";
import { copyText } from "../platform/native.ts";
import { useApp } from "../state/store.tsx";

export function Panel({ title, meta, actions, children, className, bodyClass }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`panel ${className ?? ""}`}>
      <div className="ph">
        <span>{title}</span>
        {meta && <span className="meta">{meta}</span>}
        <span className="spacer" />
        {actions}
      </div>
      <div className={`pb ${bodyClass ?? ""}`}>{children}</div>
    </section>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="retro">{title}</span>
      {children}
    </div>
  );
}

export function Modal({ title, onClose, children, wide, footer }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`panel dialog ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="ph">
          <span>{title}</span>
          <span className="spacer" />
          <button className="btn small" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="pb stack">{children}</div>
        {footer && <div className="pb row" style={{ justifyContent: "flex-end", borderTop: "1px solid var(--lo)" }}>{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ title, children, confirmLabel, danger, onConfirm, onCancel }: { title: string; children: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className={`btn ${danger ? "danger" : "primary"}`} onClick={onConfirm} autoFocus>{confirmLabel}</button>
        </>
      }
    >
      {children}
    </Modal>
  );
}

const READY_LABEL: Record<Readiness, string> = { demonstrated: "demonstrated", familiar: "self-rated familiar", exposed: "seen", new: "new" };
export function ReadyChip({ r }: { r: Readiness }) {
  const cls = r === "demonstrated" ? "ok" : r === "familiar" ? "" : r === "exposed" ? "dim" : "warn";
  return <span className={`chip ${cls}`}>{READY_LABEL[r]}</span>;
}

export function CommandBlock({ c }: { c: Command }) {
  const { toast } = useApp();
  const [confirm, setConfirm] = useState(false);
  const copy = async () => {
    try {
      await copyText(c.code);
      toast("Copied. Paste it into your own terminal or editor.");
    } catch {
      toast("Couldn't reach the clipboard; select the text and copy it manually.", "warn");
    }
  };
  return (
    <div className="cmd">
      <div className="cmdh">
        <span className="dim">{c.shell}</span>
        <span className={`effect-${c.effect}`}>{EFFECT_LABEL[c.effect]}</span>
        <span className="spacer" />
        <button className="btn small" onClick={() => (needsConfirm(c.effect) ? setConfirm(true) : copy())}>Copy</button>
      </div>
      <pre className="code">{c.code}</pre>
      <div className="cmdx">{c.explain}</div>
      {confirm && (
        <Confirm
          title="This command changes your system"
          confirmLabel="I understand, copy it"
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            void copy();
          }}
        >
          <p className="prose">{c.explain}</p>
          <p className="warn">BYTEQUEST never runs commands for you. Read it, then run it yourself only if you're sure; prefer a VM or WSL for anything that changes system settings.</p>
          <pre className="code">{c.code}</pre>
        </Confirm>
      )}
    </div>
  );
}

/** Debounced text area that saves after you stop typing. */
export function AutoText({ value, onSave, rows = 10, placeholder, label }: { value: string; onSave: (v: string) => Promise<void> | void; rows?: number; placeholder?: string; label: string }) {
  const [v, setV] = useState(value);
  const [state, setState] = useState<"saved" | "dirty" | "saving">("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(v);
  useEffect(() => setV(value), [value]);
  const flush = async (text: string) => {
    setState("saving");
    await onSave(text);
    setState(latest.current === text ? "saved" : "dirty");
  };
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
      void onSave(latest.current);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="stack" style={{ gap: 4 }}>
      <textarea
        aria-label={label}
        rows={rows}
        value={v}
        placeholder={placeholder}
        onChange={(e) => {
          const t = e.target.value;
          setV(t);
          latest.current = t;
          setState("dirty");
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            timer.current = null;
            void flush(t);
          }, 700);
        }}
      />
      <span className="small dim">{state === "saved" ? "Saved locally" : state === "saving" ? "Saving…" : "Editing…"}</span>
    </div>
  );
}

export function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="bar" aria-label={`${value} of ${max}`}>
      <i style={{ width: `${max ? Math.min(100, (100 * value) / max) : 0}%` }} />
    </div>
  );
}
