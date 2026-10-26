import { requireUser } from "@/lib/auth";
import { listConversations } from "@/lib/assistant/store";

/** The signed-in user's past conversations with the assistant, most recent first. */
export async function GET(request: Request) {
  const id = await requireUser(request);
  if (id instanceof Response) return id;
  return Response.json(await listConversations(id), { headers: { "Cache-Control": "private, no-store" } });
}
