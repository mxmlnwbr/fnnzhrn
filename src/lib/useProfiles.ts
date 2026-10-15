"use client";

import { useEffect, useState } from "react";
import type { Profile } from "./types";

const KEY = "portfolio-tracker:profiles";
/** Profiles hardly change, so they're kept for a week per browser. */
const MAX_AGE = 7 * 24 * 3600 * 1000;

type Cache = Record<string, Profile & { at: number }>;

function load(): Cache {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Cache;
  } catch {
    return {};
  }
}

/** Sector and industry for the given symbols, fetched only while `enabled`. */
export function useProfiles(symbols: string[], enabled: boolean): Record<string, Profile> {
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const key = [...symbols].sort().join(",");

  useEffect(() => {
    if (!enabled || !key) return;
    let cancelled = false;
    const cache = load();
    const now = Date.now();
    const fresh = Object.fromEntries(key.split(",").flatMap((s) => (cache[s] && now - cache[s].at < MAX_AGE ? [[s, cache[s]]] : [])));
    const missing = key.split(",").filter((s) => !fresh[s]);
    // Cached profiles show right away, via the same async path as fetched ones.
    Promise.resolve()
      .then(async () => {
        if (!missing.length) return fresh;
        const res = await fetch(`/api/profile?symbols=${encodeURIComponent(missing.join(","))}`);
        const fetched = res.ok ? ((await res.json()) as Record<string, Profile>) : {};
        const next: Cache = { ...cache };
        for (const [s, p] of Object.entries(fetched)) next[s] = { ...p, at: now };
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
          // Storage full or unavailable; profiles are refetched next time.
        }
        return { ...fresh, ...fetched };
      })
      .then((p) => !cancelled && setProfiles(p))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key, enabled]);

  return profiles;
}
