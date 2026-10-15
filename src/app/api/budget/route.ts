import { requireUser } from "@/lib/auth";
import { normalizeBudget } from "@/lib/budget";
import { saveBudget } from "@/lib/budget-store";

const MAX_BYTES = 500_000;

/** Replaces the signed-in user's financial overview. Body: `{ data: Budget }`. */
export async function PUT(request: Request) {
  const id = await requireUser(request);
  if (id instanceof Response) return id;
  const text = await request.text();
  if (text.length > MAX_BYTES) return Response.json({ error: "Budget too large" }, { status: 413 });
  let data;
  try {
    data = normalizeBudget(JSON.parse(text).data);
  } catch (e) {
    return Response.json({ error: `Invalid budget: ${(e as Error).message}` }, { status: 400 });
  }
  await saveBudget(id, data);
  return Response.json({ ok: true });
}
