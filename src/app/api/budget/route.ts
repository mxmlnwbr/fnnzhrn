import { requireUser } from "@/lib/auth";
import { normalizeBudget } from "@/lib/budget";
import { getPool } from "@/lib/db";

const MAX_BYTES = 500_000;

/** The signed-in user's financial overview, or `data: null` when nothing is saved yet. */
export async function GET(request: Request) {
  const id = await requireUser(request);
  if (id instanceof Response) return id;
  const { rows } = await getPool()!.query("select data from budgets where user_id = $1", [id]);
  return Response.json({ data: rows[0]?.data ?? null });
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
  await getPool()!.query(
    `insert into budgets (user_id, data, updated_at) values ($1, $2, now())
     on conflict (user_id) do update set data = excluded.data, updated_at = excluded.updated_at`,
    [id, data],
  );
  return Response.json({ ok: true });
}
