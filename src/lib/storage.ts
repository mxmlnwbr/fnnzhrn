"use client";

import { useSyncExternalStore } from "react";
import { authClient } from "./auth-client";
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
const OWNER_KEY = "portfolio-tracker:v1:account";
/** Email of that account, to show while the server can't be reached. */
const EMAIL_KEY = "portfolio-tracker:v1:email";
/**
 * Owner key from when sync ran on Supabase. Accounts there have other ids, so a copy it marks is
 * treated as signed-out data and merged into the new account at sign-in instead of being dropped.
 */
const SUPABASE_OWNER_KEY = "portfolio-tracker:v1:owner";
const ENABLED = process.env.NEXT_PUBLIC_SYNC_ENABLED === "1";
/** Set while the local copy has changes the server hasn't confirmed yet. */
const DIRTY_KEY = "portfolio-tracker:v1:dirty";
/** Depot shown on this device; deliberately not synced, so each device remembers its own. */
const ACTIVE_KEY = "portfolio-tracker:v1:active";
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
let sync: SyncState = ENABLED ? { status: "loading" } : { status: "disabled" };
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

/** Calls the portfolio API, turning failures (including a dropped session) into errors. */
async function api(init?: RequestInit): Promise<{ data?: unknown }> {
  const res = await fetch("/api/portfolio", { ...init, headers: { "Content-Type": "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    // The session ended (signed out elsewhere or expired): hand over to the signed-out state.
    setTimeout(() => void checkSession(), 0);
  }
  if (!res.ok) throw new Error(body.error ?? `Request failed: ${res.status}`);
  return body;
}

async function push() {
  const uid = userId;
  if (!uid) return;
  const rev = revision;
  setSync({ syncing: true });
  let error: string | null = null;
  try {
    await api({ method: "PUT", body: JSON.stringify({ data: read() }) });
  } catch (e) {
    error = (e as Error).message;
  }
  if (uid !== userId) return;
  if (!error && rev === revision) setItem(DIRTY_KEY, null);
  setSync({ syncing: false, error });
}

async function fetchRemote(): Promise<DepotStore | null> {
  const { data } = await api();
  return data ? normalizeStore(data as DepotStore | PortfolioData) : null;
}

/** Brings the local copy and the account in line after sign-in, on load and when the tab regains focus. */
async function reconcile() {
  const uid = userId;
  if (!uid) return;
  setSync({ syncing: true });
  try {
    const remote = await fetchRemote();
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
    setItem(EMAIL_KEY, null);
    // Keep edits that never reached the server; they merge back in at the next sign-in.
    if (!getItem(DIRTY_KEY)) writeLocal(EMPTY, false);
  }
  sync = { status: "signed-out" };
  notify();
}

function signedIn(id: string, email: string) {
  // Already in sync with this account; a failed (e.g. offline) state reconciles again.
  if (id === userId && sync.status === "signed-in" && !sync.error) return;
  userId = id;
  setItem(EMAIL_KEY, email);
  sync = { status: "signed-in", email, syncing: true, error: null };
  notify();
  void reconcile();
}

/** Picks up sign-ins and sign-outs, including ones from another tab or device. */
async function checkSession() {
  const { data, error } = await authClient.getSession().catch((e: Error) => ({ data: null, error: e }));
  if (error) {
    // Server unreachable (e.g. offline): stay with the account this copy belongs to, so nothing is cleared.
    const owner = getItem(OWNER_KEY);
    if (owner) {
      userId = owner;
      sync = { status: "signed-in", email: getItem(EMAIL_KEY) ?? "", syncing: false, error: error.message || "Server unreachable" };
      notify();
    } else if (sync.status === "loading") {
      sync = { status: "signed-out" };
      notify();
    }
    return;
  }
  if (data?.user) signedIn(data.user.id, data.user.email);
  else if (sync.status !== "signed-out") onSignedOut();
}

function start() {
  if (started) return;
  started = true;
  if (!ENABLED) return;
  if (getItem(SUPABASE_OWNER_KEY)) {
    setItem(SUPABASE_OWNER_KEY, null);
    // Edits waiting for Supabase come along with the copy; the merge at sign-in uploads them.
    setItem(DIRTY_KEY, null);
  }
  void checkSession();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || (sync.status === "signed-in" && sync.syncing)) return;
    // A known session is re-checked by the sync itself (a 401 signs out); otherwise look for a new one.
    if (sync.status === "signed-in" && userId) void reconcile();
    else void checkSession();
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

const LOADING: SyncState = { status: "loading" };

/** Server-rendered as loading, so the page never flashes the sign-in screen or the dashboard before the session is known. */
export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribe, () => sync, () => LOADING);
}

export async function signOut() {
  if (!ENABLED) return;
  clearTimeout(pushTimer);
  if (getItem(DIRTY_KEY)) await push();
  await authClient.signOut();
  onSignedOut();
}

export async function retrySync() {
  await checkSession();
  // A recovered session already started syncing; otherwise sync again now.
  if (sync.status === "signed-in" && !sync.syncing) await reconcile();
}

export function parseImport(text: string): PortfolioData {
  return normalizePortfolio(JSON.parse(text) as Partial<PortfolioData>);
}
