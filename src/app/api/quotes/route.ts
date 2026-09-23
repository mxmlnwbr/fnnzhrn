import type { NextRequest } from "next/server";
import { getQuotes } from "@/lib/yahoo";

export async function GET(request: NextRequest) {
  const symbols = (request.nextUrl.searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    return Response.json(await getQuotes(symbols));
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
