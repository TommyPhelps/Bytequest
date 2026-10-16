import { useEffect, useState } from "react";
import type { MissionCriteria, RecContext } from "../core/missions/engine.ts";
import type { Settings } from "../db/repo.ts";
import * as repo from "../db/repo.ts";
import { useApp } from "./store.tsx";

export function criteriaFrom(s: Settings): MissionCriteria {
  return {
    disciplines: [],
    tier: s.defaultTier,
    maxMinutes: s.maxMinutes,
    hasLinux: s.hasLinux,
    hardware: s.hardware,
    allowSimulated: s.allowSimulated,
    offlineOnly: s.offlineOnly,
    languages: s.languages,
    strictLanguages: false,
    styles: [],
  };
}

/** Everything the recommender needs, re-read whenever user data changes. */
export function useRecContext(): RecContext | null {
  const { db, progress, settings, rev } = useApp();
  const [ctx, setCtx] = useState<RecContext | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const [recent, struggling] = await Promise.all([repo.recentTemplates(db), repo.shelvedDisciplines(db)]);
      if (live) setCtx({ progress, recent, favorites: settings.favorites, strugglingIn: struggling, now: new Date() });
    })();
    return () => {
      live = false;
    };
  }, [db, progress, settings.favorites, rev]);
  return ctx;
}
