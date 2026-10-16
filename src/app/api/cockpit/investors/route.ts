// GET /api/cockpit/investors: 13F changes of well-known investors ("Buffett-Radar")
import { cockpitRoute } from "@/lib/cockpit/http";
import { investorChanges } from "@/lib/cockpit/investors";

// Two 13F filings per fund, some of them megabytes: more than Vercel's default allows.
export const maxDuration = 60;

export const GET = cockpitRoute(async () => ({ funds: await investorChanges(), asOf: Date.now() }), 3600);
