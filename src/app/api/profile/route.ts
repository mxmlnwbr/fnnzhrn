import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getProfiles } from "@/lib/yahoo";

export async function GET(request: NextRequest) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const symbols = (request.nextUrl.searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200);
  return Response.json(await getProfiles(symbols), {
    // Sectors hardly ever change; let the browser keep them for a day. Private, since only signed-in users get them.
    headers: { "Cache-Control": "private, max-age=86400" },
  });
}
