import type { NextRequest } from "next/server";
import { searchSymbols } from "@/lib/yahoo";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) return Response.json([]);
  try {
    return Response.json(await searchSymbols(q));
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
