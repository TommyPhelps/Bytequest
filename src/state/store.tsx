import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SqlDriver } from "../db/driver.ts";
import { migrate } from "../db/schema.ts";
import * as repo from "../db/repo.ts";
import type { DisciplineId, MissionInstance } from "../core/types.ts";
import type { LinkStatus } from "../core/catalog/resources.ts";
import { appInfo, type AppInfo } from "../platform/native.ts";

export type Route =
  | { name: "base" }
  | { name: "board"; discipline?: DisciplineId; preview?: MissionInstance }
  | { name: "lab"; runId?: string }
  | { name: "subjects"; discipline?: DisciplineId; concept?: string }
  | { name: "resources"; concept?: string; discipline?: DisciplineId }
  | { name: "recall" }
  | { name: "journal"; entryId?: number }
  | { name: "settings" };

export type RouteName = Route["name"];

export interface Toast {
  id: number;
  text: string;
  kind: "ok" | "warn" | "err";
}

interface Ctx {
  db: SqlDriver;
  info: AppInfo | null;
  settings: repo.Settings;
  setSetting: <K extends keyof repo.Settings>(k: K, v: repo.Settings[K]) => Promise<void>;
  progress: Map<string, repo.ConceptProgress>;
  stats: repo.Stats;
  links: Map<string, LinkStatus>;
  /** Increments whenever user data changes; views re-query when it moves. */
  rev: number;
  refresh: () => Promise<void>;
  route: Route;
  go: (r: Route) => void;
  back: () => void;
  canGoBack: boolean;
  toast: (text: string, kind?: Toast["kind"]) => void;
  toasts: Toast[];
  paletteOpen: boolean;
  setPaletteOpen: (b: boolean) => void;
}

const AppContext = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppContext);
  if (!c) throw new Error("useApp outside provider");
  return c;
}

const EMPTY_STATS: repo.Stats = { completed: 0, active: 0, shelved: 0, byDiscipline: {}, conceptsDemonstrated: 0, reviewsDue: 0 };

type Boot = { state: "loading" } | { state: "error"; message: string } | { state: "ready" };

export function AppProvider({ db, children }: { db: SqlDriver; children: ReactNode }) {
  const [boot, setBoot] = useState<Boot>({ state: "loading" });
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [settings, setSettings] = useState<repo.Settings>(repo.DEFAULT_SETTINGS);
  const [progress, setProgress] = useState(new Map<string, repo.ConceptProgress>());
  const [stats, setStats] = useState<repo.Stats>(EMPTY_STATS);
  const [links, setLinks] = useState(new Map<string, LinkStatus>());
  const [rev, setRev] = useState(0);
  const [history, setHistory] = useState<Route[]>([{ name: "base" }]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const toastId = useRef(0);

  const refresh = useCallback(async () => {
    const [p, s, l] = await Promise.all([repo.loadProgress(db), repo.loadStats(db), repo.loadLinkChecks(db)]);
    setProgress(p);
    setStats(s);
    setLinks(l);
    setRev((r) => r + 1);
  }, [db]);

  useEffect(() => {
    (async () => {
      try {
        await migrate(db);
        let s = await repo.loadSettings(db);
        let i: AppInfo | null = null;
        try {
          i = await appInfo();
        } catch {
          i = null;
        }
        setInfo(i);
        if (!s.labRoot && i?.defaultLabRoot) {
          await repo.saveSetting(db, "labRoot", i.defaultLabRoot);
          s = { ...s, labRoot: i.defaultLabRoot };
        }
        setSettings(s);
        await refresh();
        setBoot({ state: "ready" });
      } catch (e) {
        setBoot({ state: "error", message: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, [db, refresh]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.density = settings.density;
    root.style.setProperty("--scale", String(settings.textScale));
  }, [settings.theme, settings.density, settings.textScale]);

  const setSetting = useCallback(
    async <K extends keyof repo.Settings>(k: K, v: repo.Settings[K]) => {
      setSettings((s) => ({ ...s, [k]: v }));
      await repo.saveSetting(db, k, v);
    },
    [db],
  );

  const toast = useCallback((text: string, kind: Toast["kind"] = "ok") => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "err" ? 8000 : 4000);
  }, []);

  const go = useCallback((r: Route) => {
    setHistory((h) => {
      const cur = h[h.length - 1];
      if (JSON.stringify(cur) === JSON.stringify(r)) return h;
      return [...h.slice(-49), r];
    });
  }, []);
  const back = useCallback(() => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h)), []);

  const value = useMemo<Ctx>(
    () => ({
      db, info, settings, setSetting, progress, stats, links, rev, refresh,
      route: history[history.length - 1], go, back, canGoBack: history.length > 1,
      toast, toasts, paletteOpen, setPaletteOpen,
    }),
    [db, info, settings, setSetting, progress, stats, links, rev, refresh, history, go, back, toast, toasts, paletteOpen],
  );

  if (boot.state === "loading") return <div className="boot">BYTEQUEST.EXE<br />LOADING LAB DATA…</div>;
  if (boot.state === "error")
    return (
      <div className="boot boot-error" role="alert">
        <div>SYSTEM HALTED</div>
        <p>BYTEQUEST could not open its local database.</p>
        <pre>{boot.message}</pre>
        <p>Your data has not been changed. Restart the app; if this keeps happening, restore a backup from Settings after it starts, or report the message above.</p>
      </div>
    );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
