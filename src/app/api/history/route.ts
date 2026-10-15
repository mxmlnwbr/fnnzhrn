import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getHistory } from "@/lib/yahoo";

export async function GET(request: NextRequest) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const params = request.nextUrl.searchParams;
  const symbols = (params.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const from = params.get("from");
  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return Response.json({ error: "from must be YYYY-MM-DD" }, { status: 400 });
  }
  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        return [symbol, await getHistory(symbol, from)] as const;
      } catch {
        return [symbol, []] as const;
      }
    }),
  );
  return Response.json(Object.fromEntries(entries));
}
