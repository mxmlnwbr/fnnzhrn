// GET /api/cockpit/depot[?depot=<id>|all]
// The signed-in user's depot from the tracker, summarised for the Cockpit's "Mein Depot" tile.
import { requireUser } from "@/lib/auth";
import { depotOverview } from "@/lib/cockpit/depot-summary";
import { failed, mapLimit } from "@/lib/cockpit/http";
import { yahooChart } from "@/lib/cockpit/yahoo";
import { fxSymbol, normaliseCurrency } from "@/lib/currency";
import { getPool } from "@/lib/db";
import { buildPositions } from "@/lib/portfolio";
import { ALL_DEPOTS_ID, combineDepots, normalizeStore } from "@/lib/sync";
import { getQuotes } from "@/lib/yahoo";

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  try {
    const { rows } = await getPool()!.query("select data from portfolios where user_id = $1", [user]);
    if (!rows[0]) return Response.json({ empty: true, depots: [] });
    const store = normalizeStore(rows[0].data);
    const depots = store.depots.map((d) => ({ id: d.id, name: d.name }));
    // Several depots: all of them added up unless one is asked for.
    const wanted = new URL(request.url).searchParams.get("depot") ?? (depots.length > 1 ? ALL_DEPOTS_ID : depots[0].id);
    const depot = wanted === ALL_DEPOTS_ID && depots.length > 1 ? combineDepots(store) : (store.depots.find((d) => d.id === wanted) ?? store.depots[0]);
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

    const overview = depotOverview(transactions, cash, base, quotes, fx, yearStartPrices);
    return Response.json(
      { depots, selected: depot.id, ...overview, asOf: Date.now() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
