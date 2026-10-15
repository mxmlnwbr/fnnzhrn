import type { Depot, DepotStore, PortfolioData, Settings } from "./types";

export const EMPTY_PORTFOLIO: PortfolioData = { version: 1, settings: { baseCurrency: "CHF" }, transactions: [], cash: [] };

/** Id of the depot that data from before multiple depots moves into, so every device picks the same one. */
export const FIRST_DEPOT_ID = "main";
export const FIRST_DEPOT_NAME = "Depot 1";
/** Id of the view that adds up all depots. */
export const ALL_DEPOTS_ID = "all";

export const EMPTY_STORE: DepotStore = {
  version: 2,
  depots: [{ id: FIRST_DEPOT_ID, name: FIRST_DEPOT_NAME, data: EMPTY_PORTFOLIO }],
};

/** Fills in defaults and rejects data without a transactions array. */
export function normalizePortfolio(data: Partial<PortfolioData> | null | undefined): PortfolioData {
  if (!data || !Array.isArray(data.transactions)) throw new Error("File has no transactions array");
  return {
    version: 1,
    settings: { ...EMPTY_PORTFOLIO.settings, ...data.settings },
    transactions: data.transactions,
    cash: Array.isArray(data.cash) ? data.cash : [],
  };
}

/** Accepts a store with depots, or a single portfolio saved before depots existed, which becomes the first depot. */
export function normalizeStore(data: Partial<DepotStore> | Partial<PortfolioData> | null | undefined): DepotStore {
  if (data && "depots" in data && Array.isArray(data.depots)) {
    const depots = data.depots.map(
      (d: Partial<Depot>, i): Depot => ({
        id: d.id || `depot-${i}`,
        name: d.name?.trim() || `Depot ${i + 1}`,
        data: normalizePortfolio(d.data),
      }),
    );
    if (!depots.length) return EMPTY_STORE;
    const combined = data.combined && typeof data.combined === "object" ? { combined: data.combined } : {};
    const deleted = Array.isArray(data.deletedDepots)
      ? { deletedDepots: data.deletedDepots.filter((id): id is string => typeof id === "string") }
      : {};
    return { version: 2, depots, ...combined, ...deleted };
  }
  return {
    version: 2,
    depots: [{ id: FIRST_DEPOT_ID, name: FIRST_DEPOT_NAME, data: normalizePortfolio(data as Partial<PortfolioData>) }],
  };
}

function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const ids = new Set(remote.map((x) => x.id));
  return [...remote, ...local.filter((x) => !ids.has(x.id))];
}

/**
 * Combines data entered in this browser while signed out with the account's saved data.
 * Transactions and cash accounts are matched by id; the account's settings win.
 */
export function mergePortfolios(local: PortfolioData, remote: PortfolioData): PortfolioData {
  return {
    ...remote,
    transactions: mergeById(local.transactions, remote.transactions),
    cash: mergeById(local.cash, remote.cash),
  };
}

const isEmpty = (d: Depot) => d.data.transactions.length === 0 && d.data.cash.length === 0;

/**
 * Same as `mergePortfolios` for all depots: depots are matched by id, and local ones the account
 * doesn't have are added unless they're empty. Data entered while signed out is kept even in a
 * depot the account deleted (new browsers start with the same first depot id), which brings it back.
 */
export function mergeStores(local: DepotStore, remote: DepotStore): DepotStore {
  const localById = new Map(local.depots.map((d) => [d.id, d]));
  const remoteIds = new Set(remote.depots.map((d) => d.id));
  const added = local.depots.filter((d) => !remoteIds.has(d.id) && !isEmpty(d));
  const combined = remote.combined ?? local.combined;
  const deletedDepots = remote.deletedDepots?.filter((id) => !added.some((d) => d.id === id));
  return {
    version: 2,
    depots: [
      ...remote.depots.map((d) => {
        const l = localById.get(d.id);
        return l ? { ...d, data: mergePortfolios(l.data, d.data) } : d;
      }),
      ...added,
    ],
    ...(combined ? { combined } : {}),
    ...(deletedDepots?.length ? { deletedDepots } : {}),
  };
}

/**
 * Removes a depot with everything in it: transactions (imported or not), cash accounts and settings.
 * Deleting the last one leaves a fresh empty depot, and the combined view drops targets for
 * positions no depot has any more.
 */
export function removeDepot(store: DepotStore, id: string, freshId: string): DepotStore {
  const rest = store.depots.filter((d) => d.id !== id);
  const depots = rest.length ? rest : [{ id: freshId, name: FIRST_DEPOT_NAME, data: EMPTY_PORTFOLIO }];
  const symbols = new Set(depots.flatMap((d) => d.data.transactions.map((t) => t.symbol)));
  const targets = store.combined?.targets;
  const combined = store.combined && {
    ...store.combined,
    ...(targets ? { targets: Object.fromEntries(Object.entries(targets).filter(([s]) => symbols.has(s))) } : {}),
  };
  return {
    ...store,
    depots,
    ...(combined ? { combined } : {}),
    deletedDepots: [...new Set([...(store.deletedDepots ?? []), id])],
  };
}

/**
 * Takes over the account's deletions before this device uploads its own copy, so offline edits
 * don't bring back a depot deleted elsewhere.
 */
export function applyDeletions(local: DepotStore, remote: DepotStore): DepotStore {
  const deleted = new Set([...(local.deletedDepots ?? []), ...(remote.deletedDepots ?? [])]);
  if (!deleted.size) return local;
  const depots = local.depots.filter((d) => !deleted.has(d.id));
  return { ...local, depots: depots.length ? depots : remote.depots, deletedDepots: [...deleted] };
}

/** Asset class overrides of all depots together; where they disagree, the later depot wins. */
function allCategories(store: DepotStore): Record<string, string> {
  return Object.assign({}, ...store.depots.map((d) => d.data.settings.categories));
}

/**
 * All depots added up into one portfolio. Ids get the depot's id appended so they stay unique
 * (the same import in two depots yields the same ids), and cash accounts are labelled with their depot.
 */
export function combineDepots(store: DepotStore): Depot {
  const { depots, combined } = store;
  return {
    id: ALL_DEPOTS_ID,
    name: "All depots",
    data: {
      version: 1,
      settings: {
        baseCurrency: combined?.baseCurrency ?? depots[0].data.settings.baseCurrency,
        categories: allCategories(store),
        targets: combined?.targets ?? {},
      },
      // `depotIdOf` reads the depot back from these ids.
      transactions: depots.flatMap((d) => d.data.transactions.map((t) => ({ ...t, id: `${t.id}@${d.id}` }))),
      cash: depots.flatMap((d) => d.data.cash.map((a) => ({ ...a, id: `${a.id}@${d.id}`, name: `${a.name} · ${d.name}` }))),
    },
  };
}

/** The depot an id from the combined view came from. */
export function depotIdOf(combinedId: string): string {
  return combinedId.slice(combinedId.lastIndexOf("@") + 1);
}

/**
 * Saves settings changed in the combined view. Asset classes belong to a security, not a depot,
 * so a change there is applied in every depot.
 */
export function saveCombinedSettings(store: DepotStore, settings: Settings): DepotStore {
  const before = allCategories(store);
  const after = settings.categories ?? {};
  const changed = Object.entries(after).filter(([k, v]) => before[k] !== v);
  const removed = Object.keys(before).filter((k) => !(k in after));
  return {
    ...store,
    depots:
      changed.length || removed.length
        ? store.depots.map((d) => {
            const categories = { ...d.data.settings.categories, ...Object.fromEntries(changed) };
            for (const k of removed) delete categories[k];
            return { ...d, data: { ...d.data, settings: { ...d.data.settings, categories } } };
          })
        : store.depots,
    combined: { baseCurrency: settings.baseCurrency, targets: settings.targets },
  };
}
