// GET /api/cockpit/value?market=us&pe=15&growth=1&debt=1: value candidates ("Value-Chancen")
import { cockpitRoute } from "@/lib/cockpit/http";
import { valueStocks } from "@/lib/cockpit/screener";

export const maxDuration = 60;

export const GET = cockpitRoute(async (q) => {
  const maxPe = Math.min(Math.max(Number(q.get("pe")) || 15, 5), 50);
  const filters = { maxPe, growth: q.get("growth") !== "0", lowDebt: q.get("debt") !== "0" };
  return { ...(await valueStocks(q.get("market"), filters)), filters, asOf: Date.now() };
}, 600);
