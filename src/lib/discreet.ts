"use client";

import { useSyncExternalStore } from "react";

/** Per-device setting, deliberately kept out of the synced portfolio. */
const KEY = "portfolio-tracker:discreet";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

let current: boolean | null = null;

export function setDiscreet(on: boolean) {
  current = on;
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable; the setting lasts until reload.
  }
  listeners.forEach((l) => l());
}

/** Discreet mode shows percentages only, so the app can be shown around without revealing amounts. */
export function useDiscreet(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (current ??= read()),
    () => false,
  );
}
