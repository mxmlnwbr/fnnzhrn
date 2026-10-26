// GET /api/cockpit/depot[?depot=<id>|all]
// The signed-in user's depot from the tracker, summarised for the Cockpit's "Mein Depot" tile.
import { requireUser } from "@/lib/auth";
import { userDepotOverview } from "@/lib/cockpit/depot-data";

// Quotes, FX rates and one chart per position held on 1 January: more than Vercel's default allows.
export const maxDuration = 60;

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  try {
    const overview = await userDepotOverview(user, new URL(request.url).searchParams.get("depot"));
    if (!overview) return Response.json({ empty: true, depots: [] });
    return Response.json({ ...overview, asOf: Date.now() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
