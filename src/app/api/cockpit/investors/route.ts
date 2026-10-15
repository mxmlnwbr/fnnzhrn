// GET /api/cockpit/investors: 13F changes of well-known investors ("Buffett-Radar")
import { cockpitRoute } from "@/lib/cockpit/http";
import { investorChanges } from "@/lib/cockpit/investors";

export const GET = cockpitRoute(async () => ({ funds: await investorChanges(), asOf: Date.now() }), 3600);
