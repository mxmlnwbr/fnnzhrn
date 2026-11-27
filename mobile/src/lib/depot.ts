import { EMPTY_STORE, normalizeStore } from "@core/sync";
import type { DepotStore, PortfolioData, Transaction } from "@core/types";

import { getJson, putJson } from "./api";

/** The signed-in user's depots from the server, with a first, empty depot when nothing is saved yet. */
export async function loadStore(): Promise<DepotStore> {
  const { data } = await getJson<{ data: Partial<DepotStore> | null }>("/api/portfolio");
  return data ? normalizeStore(data) : EMPTY_STORE;
}

/**
 * Changes one depot and saves all of them. The server keeps the whole store as one document, so this
 * loads the latest copy first; a change made on fnnzhrn.ch a moment ago stays.
 */
async function changeDepot(depotId: string, update: (data: PortfolioData) => PortfolioData): Promise<DepotStore> {
  const store = await loadStore();
  if (!store.depots.some((d) => d.id === depotId)) throw new Error("Dieses Depot gibt es nicht mehr.");
  const next: DepotStore = {
    ...store,
    depots: store.depots.map((d) => (d.id === depotId ? { ...d, data: update(d.data) } : d)),
  };
  await putJson("/api/portfolio", { data: next });
  return next;
}

export function addTransaction(depotId: string, transaction: Transaction) {
  return changeDepot(depotId, (data) => ({ ...data, transactions: [...data.transactions, transaction] }));
}

export function removeTransaction(depotId: string, transactionId: string) {
  return changeDepot(depotId, (data) => ({ ...data, transactions: data.transactions.filter((t) => t.id !== transactionId) }));
}

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** The day of `date` in Switzerland, as "YYYY-MM-DD". */
export const isoDate = (date: Date) => date.toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });

/** "2026-11-27" as "27.11.2026". */
export const swissDate = (iso: string) => iso.split("-").reverse().join(".");
