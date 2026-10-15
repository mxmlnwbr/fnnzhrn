// GET /api/cockpit/sentiment: CNN Fear & Greed incl. put/call ratio and VIX
import { cockpitRoute } from "@/lib/cockpit/http";
import { sentiment } from "@/lib/cockpit/markets";

export const GET = cockpitRoute(async () => ({ ...(await sentiment()), asOf: Date.now() }), 600);
