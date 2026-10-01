"use client";

import { useSyncExternalStore } from "react";
import { getSupabase } from "./supabase";
import {
  ALL_DEPOTS_ID,
  combineDepots,
  EMPTY_PORTFOLIO,
  EMPTY_STORE,
  applyDeletions,
  mergeStores,
  normalizePortfolio,
  normalizeStore,
  removeDepot,
  saveCombinedSettings,
} from "./sync";
import type { Depot, DepotStore, PortfolioData } from "./types";

const KEY = "portfolio-tracker:v1";
/** Id of the account the local copy belongs to; absent for signed-out data. */
const OWNER_KEY = "portfolio-tracker:v1:owner";
/** Set while the local copy has changes the server hasn't confirmed yet. */
const DIRTY_KEY = "portfolio-tracker:v1:dirty";
/** Depot shown on this device; deliberately not synced, so each device remembers its own. */
const ACTIVE_KEY = "portfolio-tracker:v1:active";
const TABLE = "portfolios";
const EMPTY = EMPTY_STORE;

export type SyncState =
  | { status: "disabled" }
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; email: string; syncing: boolean; error: string | null };

let cache: DepotStore | null = null;
let activeId: string | null = null;
/** The combined view of the store it was built from, so it keeps its identity between renders. */
let combinedCache: { store: DepotStore; depot: Depot } | null = null;
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

function read(): DepotStore {
  if (cache) return cache;
  try {
    const raw = getItem(KEY);
    cache = raw ? normalizeStore(JSON.parse(raw)) : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

/**
 * The depot shown, or all depots added up. Falls back to the first depot when the chosen one is gone
 * (e.g. deleted on another device), and when only one depot is left to add up.
 */
function active(): Depot {
  const store = read();
  activeId ??= getItem(ACTIVE_KEY);
  if (activeId === ALL_DEPOTS_ID && store.depots.length > 1) {
    if (combinedCache?.store !== store) combinedCache = { store, depot: combineDepots(store) };
    return combinedCache.depot;
  }
  return store.depots.find((d) => d.id === activeId) ?? store.depots[0];
}

function writeLocal(data: DepotStore, dirty: boolean) {
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

function save(data: DepotStore) {
  revision++;
  writeLocal(data, true);
  if (userId) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void push(), 400);
  }
}

/** Saves the depot currently shown. In the combined view only settings can change. */
export function savePortfolio(data: PortfolioData) {
  const id = active().id;
  if (id === ALL_DEPOTS_ID) return save(saveCombinedSettings(read(), data.settings));
  save({ ...read(), depots: read().depots.map((d) => (d.id === id ? { ...d, data } : d)) });
}

export function selectDepot(id: string) {
  activeId = id;
  setItem(ACTIVE_KEY, id);
  notify();
}

/** Adds an empty depot, with the base currency of the one shown, and switches to it. */
export function createDepot(name: string) {
  const depot: Depot = {
    id: crypto.randomUUID(),
    name,
    data: { ...EMPTY_PORTFOLIO, settings: { baseCurrency: active().data.settings.baseCurrency } },
  };
  save({ ...read(), depots: [...read().depots, depot] });
  selectDepot(depot.id);
}

export function renameDepot(id: string, name: string) {
  save({ ...read(), depots: read().depots.map((d) => (d.id === id ? { ...d, name } : d)) });
}

/** Removes a depot with everything in it, imported data included; see `removeDepot`. */
export function deleteDepot(id: string) {
  save(removeDepot(read(), id, crypto.randomUUID()));
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

async function fetchRemote(uid: string): Promise<DepotStore | null> {
  const sb = getSupabase()!;
  const { data, error } = await sb.from(TABLE).select("data").eq("user_id", uid).maybeSingle();
  if (error) throw error;
  return data ? normalizeStore(data.data as DepotStore | PortfolioData) : null;
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
      const merged = owner === null && remote ? mergeStores(local, remote) : owner === null ? local : remote ?? EMPTY;
      const needsUpload = !remote || JSON.stringify(merged) !== JSON.stringify(remote);
      revision++;
      writeLocal(merged, needsUpload);
      if (needsUpload) return await push();
    } else if (getItem(DIRTY_KEY) || !remote) {
      // Unsaved local edits (e.g. made offline) win over the server copy, except for depots deleted there.
      if (remote) {
        const kept = applyDeletions(local, remote);
        if (kept !== local) {
          revision++;
          writeLocal(kept, true);
        }
      }
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

const SERVER_DEPOT = EMPTY.depots[0];

/** The depot shown. */
export function useActiveDepot(): Depot {
  return useSyncExternalStore(subscribe, active, () => SERVER_DEPOT);
}

export function useDepots(): Depot[] {
  return useSyncExternalStore(subscribe, () => read().depots, () => EMPTY.depots);
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
