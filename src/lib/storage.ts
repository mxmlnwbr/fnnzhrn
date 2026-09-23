"use client";

import { useSyncExternalStore } from "react";
import type { PortfolioData } from "./types";

const KEY = "portfolio-tracker:v1";
const EMPTY: PortfolioData = { version: 1, settings: { baseCurrency: "CHF" }, transactions: [] };

let cache: PortfolioData | null = null;
const listeners = new Set<() => void>();

function read(): PortfolioData {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as PortfolioData) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

export function savePortfolio(data: PortfolioData) {
  cache = data;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable (private mode); keep the in-memory copy.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePortfolio(): PortfolioData {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function parseImport(text: string): PortfolioData {
  const data = JSON.parse(text) as Partial<PortfolioData>;
  if (!Array.isArray(data.transactions)) throw new Error("File has no transactions array");
  return {
    version: 1,
    settings: { ...EMPTY.settings, ...data.settings },
    transactions: data.transactions,
  };
}
