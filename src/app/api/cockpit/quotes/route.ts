// GET /api/cockpit/quotes?symbols=^SSMI,NVDA,BTC-USD[&dividends=1]
import { BadRequest, cockpitRoute, failed, mapLimit } from "@/lib/cockpit/http";
import { yahooChart } from "@/lib/cockpit/yahoo";

export const GET = cockpitRoute(async (q) => {
  const symbols = [...new Set((q.get("symbols") ?? "").split(",").map((s) => s.trim()).filter(Boolean))];
  if (!symbols.length) throw new BadRequest("symbols fehlt");
  if (symbols.length > 40) throw new BadRequest("Maximal 40 Symbole");
  const withDividends = q.get("dividends") === "1";
  const rows = await mapLimit(symbols, 8, (s) => yahooChart(s, { withDividends }));
  // Keyed by the requested symbol: Yahoo answers USDEUR=X as EUR=X.
  return { quotes: rows.map((r, i) => (failed(r) ? { symbol: symbols[i], error: r.error } : { ...r, symbol: symbols[i] })), asOf: Date.now() };
});
