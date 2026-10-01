import type { NextRequest } from "next/server";
import type { Listing } from "@/lib/swissquote";
import { resolveTickers } from "@/lib/yahoo";

/** Maps imported securities to Yahoo tickers that actually have a price. Body: `Listing[]`. */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Listing[] | null;
  if (!Array.isArray(body)) return Response.json({ error: "Expected a list of listings" }, { status: 400 });
  const listings = body
    .filter((l) => l && typeof l.symbol === "string" && l.symbol)
    .map((l) => ({
      symbol: l.symbol,
      name: typeof l.name === "string" ? l.name.slice(0, 100) : undefined,
      isin: String(l.isin ?? ""),
      currency: String(l.currency ?? ""),
    }))
    .slice(0, 500);
  try {
    return Response.json(await resolveTickers(listings));
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
