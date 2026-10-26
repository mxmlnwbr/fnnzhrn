import { requireUser } from "@/lib/auth";
import { deleteConversation, loadConversation, saveConversation } from "@/lib/assistant/store";

const MAX_MESSAGES = 200;
const MAX_CHARS = 100_000;
const TITLE_CHARS = 80;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StoredMessage = { role: "user" | "assistant"; content: string; cost?: number; error?: string; billing?: boolean };

/** The messages as the chat shows them, keeping only the fields it knows; a string says what's wrong. */
function parseMessages(body: unknown): StoredMessage[] | string {
  const list = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(list) || !list.length) return "messages fehlt";
  if (list.length > MAX_MESSAGES) return "Das Gespräch ist zu lang.";
  const out: StoredMessage[] = [];
  for (const m of list) {
    if ((m?.role !== "user" && m?.role !== "assistant") || typeof m.content !== "string" || m.content.length > MAX_CHARS) return "Ungültiges Gespräch";
    out.push({
      role: m.role,
      content: m.content,
      ...(typeof m.cost === "number" && Number.isFinite(m.cost) ? { cost: m.cost } : {}),
      ...(typeof m.error === "string" ? { error: m.error.slice(0, 1000) } : {}),
      ...(m.billing === true ? { billing: true } : {}),
    });
  }
  return out;
}

/** The title in the history: the first question, on one line. */
function titleOf(messages: StoredMessage[]) {
  const first = messages.find((m) => m.role === "user")?.content.replace(/\s+/g, " ").trim() || "Gespräch";
  return first.length > TITLE_CHARS ? `${first.slice(0, TITLE_CHARS - 1)}…` : first;
}

/** One of the signed-in user's conversations: `{ id, messages }`. */
export async function GET(request: Request, ctx: RouteContext<"/api/assistant/conversations/[id]">) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  const messages = UUID.test(id) ? await loadConversation(user, id) : null;
  if (!messages) return Response.json({ error: "Gespräch nicht gefunden" }, { status: 404 });
  return Response.json({ id, messages }, { headers: { "Cache-Control": "private, no-store" } });
}

/** Saves a conversation under the id the browser gave it. Body: `{ messages }`. */
export async function PUT(request: Request, ctx: RouteContext<"/api/assistant/conversations/[id]">) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Ungültige Id" }, { status: 400 });
  const messages = parseMessages(await request.json().catch(() => null));
  if (typeof messages === "string") return Response.json({ error: messages }, { status: 400 });
  if (!(await saveConversation(user, id, titleOf(messages), messages))) return Response.json({ error: "Gespräch nicht gefunden" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/assistant/conversations/[id]">) {
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  const { id } = await ctx.params;
  if (UUID.test(id)) await deleteConversation(user, id);
  return Response.json({ ok: true });
}
