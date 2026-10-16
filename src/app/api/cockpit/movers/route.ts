// GET /api/cockpit/movers?market=us|ch|de|eu|gb|jp: today's top 10 gainers and losers of a market
import { cockpitRoute } from "@/lib/cockpit/http";
import { movers } from "@/lib/cockpit/screener";

export const maxDuration = 60;

export const GET = cockpitRoute(async (q) => ({ ...(await movers(q.get("market"))), asOf: Date.now() }), 300);
