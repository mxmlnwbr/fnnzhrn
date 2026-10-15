// GET /api/cockpit/screener?id=day_gainers&count=10 (Yahoo predefined screeners, US stocks)
import { cockpitRoute } from "@/lib/cockpit/http";
import { yahooScreener } from "@/lib/cockpit/yahoo";

export const GET = cockpitRoute(async (q) => {
  const count = Math.min(Number(q.get("count")) || 10, 100);
  return { quotes: await yahooScreener(q.get("id"), count), asOf: Date.now() };
}, 300);
