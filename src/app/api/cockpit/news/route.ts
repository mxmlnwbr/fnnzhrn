// GET /api/cockpit/news?s=NVDA|NVIDIA Corporation&s=UBSG.SW|UBS Group AG   news per stock
// GET /api/cockpit/news?topic=mna                                           takeover rumours / sale candidates
import { cockpitRoute } from "@/lib/cockpit/http";
import { mnaNews, stockNews } from "@/lib/cockpit/news";

export const GET = cockpitRoute(async (q) => {
  const items = q.get("topic") === "mna" ? await mnaNews() : await stockNews(q.getAll("s"));
  return { items, asOf: Date.now() };
}, 600);
