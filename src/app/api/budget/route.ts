import { requireMemberUser, requireUser } from "@/lib/auth";
import { normalizeBudget } from "@/lib/budget";
import { loadBudget, saveBudget } from "@/lib/budget-store";

// Room for years of months with their expenses.
const MAX_BYTES = 2_000_000;

/** The signed-in user's financial overview, as the Finanzen page loads it; for the mobile app. */
export async function GET(request: Request) {
  const user = await requireMemberUser(request);
  if (user instanceof Response) return user;
  return Response.json({ data: await loadBudget(user.id, user.email) });
}

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
