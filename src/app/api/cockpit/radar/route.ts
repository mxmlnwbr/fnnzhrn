// GET /api/cockpit/radar: stocks with large drawdowns ("Schnäppchen-Radar")
import { cockpitRoute } from "@/lib/cockpit/http";
import { radar } from "@/lib/cockpit/markets";

export const GET = cockpitRoute(async () => ({ ...(await radar()), asOf: Date.now() }), 3600);
