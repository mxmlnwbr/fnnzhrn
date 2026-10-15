// GET /api/cockpit/earnings?days=7&minCap=10e9
import { cockpitRoute } from "@/lib/cockpit/http";
import { earnings } from "@/lib/cockpit/markets";

export const GET = cockpitRoute(async (q) => {
  const days = Math.min(Number(q.get("days")) || 7, 14);
  const minCap = Number(q.get("minCap")) || 10e9;
  return { rows: await earnings(days, minCap), asOf: Date.now() };
}, 3600);
