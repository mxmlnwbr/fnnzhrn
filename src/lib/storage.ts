"use client";

import { useSyncExternalStore } from "react";
import { getSupabase } from "./supabase";
import { EMPTY_PORTFOLIO, mergePortfolios, normalizePortfolio } from "./sync";
import type { PortfolioData } from "./types";

const KEY = "portfolio-tracker:v1";
/** Id of the account the local copy belongs to; absent for signed-out data. */
const OWNER_KEY = "portfolio-tracker:v1:owner";
/** Set while the local copy has changes the server hasn't confirmed yet. */
const DIRTY_KEY = "portfolio-tracker:v1:dirty";
const TABLE = "portfolios";
const EMPTY = EMPTY_PORTFOLIO;

export type SyncState =
  | { status: "disabled" }
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; email: string; syncing: boolean; error: string | null };

let cache: PortfolioData | null = null;
let sync: SyncState = { status: "disabled" };
let userId: string | null = null;
let started = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
/** Bumped on every local change, so a finished upload knows whether newer edits are pending. */
let revision = 0;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function getItem(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setItem(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode); keep the in-memory copy.
  }
}

function read(): PortfolioData {
  if (cache) return cache;
  try {
    const raw = getItem(KEY);
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as PortfolioData) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function writeLocal(data: PortfolioData, dirty: boolean) {
  cache = data;
  setItem(KEY, JSON.stringify(data));
  setItem(DIRTY_KEY, dirty ? "1" : null);
  notify();
}

function setSync(next: Partial<Extract<SyncState, { status: "signed-in" }>>) {
  if (sync.status === "signed-in") {
    sync = { ...sync, ...next };
    notify();
  }
}

export function savePortfolio(data: PortfolioData) {
  revision++;
  writeLocal(data, true);
  if (userId) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void push(), 400);
  }
}

async function push() {
  const sb = getSupabase();
  const uid = userId;
  if (!sb || !uid) return;
  const rev = revision;
  setSync({ syncing: true });
  const { error } = await sb
    .from(TABLE)
    .upsert({ user_id: uid, data: read(), updated_at: new Date().toISOString() });
  if (uid !== userId) return;
  if (!error && rev === revision) setItem(DIRTY_KEY, null);
  setSync({ syncing: false, error: error ? error.message : null });
}

async function fetchRemote(uid: string): Promise<PortfolioData | null> {
  const sb = getSupabase()!;
  const { data, error } = await sb.from(TABLE).select("data").eq("user_id", uid).maybeSingle();
  if (error) throw error;
  return data ? normalizePortfolio(data.data as PortfolioData) : null;
}

/** Brings the local copy and the account in line after sign-in, on load and when the tab regains focus. */
async function reconcile() {
  const uid = userId;
  if (!uid) return;
  setSync({ syncing: true });
  try {
    const remote = await fetchRemote(uid);
    if (uid !== userId) return;
    const local = read();
    const owner = getItem(OWNER_KEY);
    setItem(OWNER_KEY, uid);

    if (owner !== uid) {
      // Signed in on this browser: keep anything entered while signed out.
      const merged = owner === null && remote ? mergePortfolios(local, remote) : owner === null ? local : remote ?? EMPTY;
      const needsUpload =
        !remote || merged.transactions.length !== remote.transactions.length || merged.cash.length !== remote.cash.length;
      revision++;
      writeLocal(merged, needsUpload);
      if (needsUpload) return await push();
    } else if (getItem(DIRTY_KEY) || !remote) {
      // Unsaved local edits (e.g. made offline) win over the server copy.
      return await push();
    } else if (JSON.stringify(remote) !== JSON.stringify(local)) {
      revision++;
      writeLocal(remote, false);
    }
    setSync({ syncing: false, error: null });
  } catch (e) {
    if (uid === userId) setSync({ syncing: false, error: (e as Error).message });
  }
}

function onSignedOut() {
  userId = null;
  clearTimeout(pushTimer);
  if (getItem(OWNER_KEY)) {
    setItem(OWNER_KEY, null);
    // Keep edits that never reached the server; they merge back in at the next sign-in.
    if (!getItem(DIRTY_KEY)) writeLocal(EMPTY, false);
  }
  sync = { status: "signed-out" };
  notify();
}

function start() {
  if (started) return;
  started = true;
  const sb = getSupabase();
  if (!sb) return;
  sync = { status: "loading" };

  sb.auth.onAuthStateChange((_event, session) => {
    const user = session?.user;
    if (!user) {
      if (sync.status !== "signed-out") onSignedOut();
      return;
    }
    if (user.id === userId) return;
    userId = user.id;
    sync = { status: "signed-in", email: user.email ?? "", syncing: true, error: null };
    notify();
    // Supabase calls made inside this callback can deadlock, so run after it returns.
    setTimeout(() => void reconcile(), 0);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && sync.status === "signed-in" && !sync.syncing) void reconcile();
  });
}

function subscribe(listener: () => void) {
  start();
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

const DISABLED: SyncState = { status: "disabled" };

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribe, () => sync, () => DISABLED);
}

export async function sendLoginLink(email: string) {
  const { error } = await getSupabase()!.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOut() {
  const sb = getSupabase();
  if (!sb) return;
  clearTimeout(pushTimer);
  if (getItem(DIRTY_KEY)) await push();
  await sb.auth.signOut();
}

export async function retrySync() {
  await reconcile();
}

export function parseImport(text: string): PortfolioData {
  return normalizePortfolio(JSON.parse(text) as Partial<PortfolioData>);
}
