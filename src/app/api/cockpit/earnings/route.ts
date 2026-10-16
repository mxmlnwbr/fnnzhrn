// GET /api/cockpit/earnings?days=7&minCap=10e9
import { cockpitRoute } from "@/lib/cockpit/http";
import { earnings } from "@/lib/cockpit/markets";

export const maxDuration = 60;

export const GET = cockpitRoute(async (q) => {
  const days = Math.min(Math.max(Math.floor(Number(q.get("days")) || 7), 1), 14);
  const minCap = Math.max(Number(q.get("minCap")) || 10e9, 0);
  return { rows: await earnings(days, minCap), asOf: Date.now() };
}, 3600);
