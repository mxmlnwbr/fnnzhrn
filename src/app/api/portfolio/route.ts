import { requireUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { normalizeStore } from "@/lib/sync";

/** Generous for a few depots with years of transactions, small enough to keep junk out. */
const MAX_BYTES = 5_000_000;

/** The signed-in user's depots, or `data: null` when nothing is saved yet. */
export async function GET(request: Request) {
  const id = await requireUser(request);
  if (id instanceof Response) return id;
  const { rows } = await getPool()!.query("select data from portfolios where user_id = $1", [id]);
  return Response.json({ data: rows[0]?.data ?? null });
}

/** Replaces the signed-in user's depots. Body: `{ data: DepotStore }`. */
export async function PUT(request: Request) {
  const id = await requireUser(request);
  if (id instanceof Response) return id;
  const text = await request.text();
  if (text.length > MAX_BYTES) return Response.json({ error: "Portfolio too large" }, { status: 413 });
  let data;
  try {
    data = normalizeStore(JSON.parse(text).data);
  } catch (e) {
    return Response.json({ error: `Invalid portfolio: ${(e as Error).message}` }, { status: 400 });
  }
  await getPool()!.query(
    `insert into portfolios (user_id, data, updated_at) values ($1, $2, now())
     on conflict (user_id) do update set data = excluded.data, updated_at = excluded.updated_at`,
    [id, data],
  );
  return Response.json({ ok: true });
}
