import "server-only";
import { getPool } from "../db";
import { fxSymbol, normaliseCurrency } from "../currency";
import { buildPositions } from "../portfolio";
import { ALL_DEPOTS_ID, combineDepots, normalizeStore } from "../sync";
import { getQuotes } from "../yahoo";
import { depotOverview } from "./depot-summary";
import { failed, mapLimit } from "./http";
import { yahooChart } from "./yahoo";

/** The user's saved depots, or null when nothing is saved yet. */
export async function loadDepotStore(userId: string) {
  const { rows } = await getPool()!.query("select data from portfolios where user_id = $1", [userId]);
  return rows[0] ? normalizeStore(rows[0].data) : null;
}

/**
 * One of the user's depots (or all of them added up, `ALL_DEPOTS_ID`) with current prices, as the
 * Cockpit's "Mein Depot" tile shows it; null when the user has no depots. Without `wanted`, several
 * depots are added up.
 */
export async function userDepotOverview(userId: string, wanted: string | null) {
  const store = await loadDepotStore(userId);
  if (!store) return null;
  const depots = store.depots.map((d) => ({ id: d.id, name: d.name }));
  const id = wanted ?? (depots.length > 1 ? ALL_DEPOTS_ID : depots[0].id);
  const depot = id === ALL_DEPOTS_ID && depots.length > 1 ? combineDepots(store) : (store.depots.find((d) => d.id === id) ?? store.depots[0]);
  const { transactions, cash, settings } = depot.data;
  const base = settings.baseCurrency;

  const symbols = [...new Set(transactions.filter((t) => t.type !== "fee").map((t) => t.symbol))];
  const quotes = await getQuotes(symbols);
  const currencies = [...new Set([...Object.values(quotes).map((q) => q.currency), ...cash.map((a) => a.currency), ...transactions.flatMap((t) => (t.currency ? [t.currency] : []))])].filter(
    (c) => c !== base,
  );
  const fxQuotes = await getQuotes(currencies.map((c) => fxSymbol(c, base)));
  const fx: Record<string, number> = { [base]: 1 };
  for (const c of currencies) fx[c] = fxQuotes[fxSymbol(c, base)]?.price ?? 1;

  // Prices on 1 January, only for what was held then.
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const heldAtStart = [...buildPositions(transactions.filter((t) => t.date < yearStart))].filter(([, p]) => p.quantity > 0).map(([s]) => s);
  const charts = await mapLimit(heldAtStart, 6, (s) => yahooChart(s));
  const yearStartPrices: Record<string, number | null> = {};
  heldAtStart.forEach((s, i) => {
    const c = charts[i];
    yearStartPrices[s] = failed(c) || c.yearStartPrice == null ? null : c.yearStartPrice / normaliseCurrency(c.currency).divisor;
  });

  return { depots, selected: depot.id, ...depotOverview(transactions, cash, base, quotes, fx, yearStartPrices) };
}
