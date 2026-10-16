// GET /api/cockpit/radar?market=us|ch|de|eu|gb|jp: stocks with large drawdowns ("Schnäppchen-Radar")
import { cockpitRoute } from "@/lib/cockpit/http";
import { radar } from "@/lib/cockpit/markets";

// Up to 60 charts are fetched per market; more than Vercel's default allows.
export const maxDuration = 60;

export const GET = cockpitRoute(async (q) => ({ ...(await radar(q.get("market"))), asOf: Date.now() }), 1800);
