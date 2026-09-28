import type { NextRequest } from "next/server";
import { getProfiles } from "@/lib/yahoo";

export async function GET(request: NextRequest) {
  const symbols = (request.nextUrl.searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200);
  return Response.json(await getProfiles(symbols), {
    // Sectors hardly ever change; let browsers and the CDN keep them for a day.
    headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
  });
}
