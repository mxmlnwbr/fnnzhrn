import { requireUser } from "@/lib/auth";
import { checkAdminKey, forgetAccountSpend } from "@/lib/assistant/account";
import { assistantStatus, deleteAdminKey, saveAdminKey } from "@/lib/assistant/store";

/**
 * Connects the user's Admin API key after checking that it can read their account's cost report, so the
 * chat can show what the whole account spends this month. Body: `{ key: string }`.
 */
export async function PUT(request: Request) {
  const id = await requireUser(request);
  if (id instanceof Response) return id;
  const body = await request.json().catch(() => ({}));
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!/^sk-ant-admin[\w-]{20,300}$/.test(key)) return Response.json({ error: "Das sieht nicht wie ein Admin-Key aus (sk-ant-admin…)." }, { status: 400 });
  try {
    await checkAdminKey(key);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  await saveAdminKey(id, key);
  forgetAccountSpend(id);
  return Response.json(await assistantStatus(id));
}

/** Removes the Admin API key; the chat then shows only fnnzhrn's own spend. */
export async function DELETE(request: Request) {
  const id = await requireUser(request);
  if (id instanceof Response) return id;
  await deleteAdminKey(id);
  forgetAccountSpend(id);
  return Response.json(await assistantStatus(id));
}
