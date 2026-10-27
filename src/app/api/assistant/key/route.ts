import Anthropic from "@anthropic-ai/sdk";
import { requireUser } from "@/lib/auth";
import { isAssistantModel } from "@/lib/assistant/pricing";
import { assistantStatus, deleteApiKey, saveApiKey, saveLimit, saveModel } from "@/lib/assistant/store";

/** Whether the signed-in user has connected a Claude API key, and what the assistant has cost them. */
export async function GET(request: Request) {
  const id = await requireUser(request);
  if (id instanceof Response) return id;
  return Response.json(await assistantStatus(id), { headers: { "Cache-Control": "private, no-store" } });
}

/** Connects the user's own Claude API key after checking it with Anthropic. Body: `{ key: string }`. */
export async function PUT(request: Request) {
  const id = await requireUser(request);
  if (id instanceof Response) return id;
  const body = await request.json().catch(() => ({}));
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!/^sk-ant-[\w-]{20,300}$/.test(key)) return Response.json({ error: "Das sieht nicht wie ein Claude API-Key aus (sk-ant-…)." }, { status: 400 });
  try {
    await new Anthropic({ apiKey: key, maxRetries: 0 }).models.list({ limit: 1 });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return Response.json({ error: "Anthropic kennt diesen Key nicht." }, { status: 400 });
    if (e instanceof Anthropic.PermissionDeniedError) return Response.json({ error: "Dieser Key hat keine Berechtigung für die API." }, { status: 400 });
    if (e instanceof Anthropic.APIError) return Response.json({ error: `Anthropic antwortet mit ${e.status ?? "einem Fehler"}: ${e.message}` }, { status: 502 });
    return Response.json({ error: "Anthropic ist gerade nicht erreichbar." }, { status: 502 });
  }
  await saveApiKey(id, key);
  return Response.json(await assistantStatus(id));
}

/**
 * Picks the model for the user's answers, or sets the monthly limit the user set in the Claude Console, to
 * compare their spend with. Body: `{ model }`, one of `ASSISTANT_MODELS`, or `{ limit: number | null }` in US dollars.
 */
export async function PATCH(request: Request) {
  const id = await requireUser(request);
  if (id instanceof Response) return id;
  const body = await request.json().catch(() => ({}));
  if ("limit" in body) {
    const limit = body.limit;
    if (limit !== null && !(typeof limit === "number" && limit > 0 && limit < 100_000)) return Response.json({ error: "Ungültiges Limit" }, { status: 400 });
    await saveLimit(id, limit === null ? null : Math.round(limit * 100) / 100);
    return Response.json(await assistantStatus(id));
  }
  if (!isAssistantModel(body.model)) return Response.json({ error: "Unbekanntes Modell" }, { status: 400 });
  await saveModel(id, body.model);
  return Response.json(await assistantStatus(id));
}

/** Removes the user's key; their usage history stays. */
export async function DELETE(request: Request) {
  const id = await requireUser(request);
  if (id instanceof Response) return id;
  await deleteApiKey(id);
  return Response.json(await assistantStatus(id));
}
