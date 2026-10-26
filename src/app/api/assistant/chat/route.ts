import Anthropic from "@anthropic-ai/sdk";
import { requireMemberUser } from "@/lib/auth";
import { costUsd } from "@/lib/assistant/pricing";
import { assistantStatus, loadApiKey, recordUsage } from "@/lib/assistant/store";
import { runTool, TOOL_DEFINITIONS, ToolInputError } from "@/lib/assistant/tools";

// A question can take several rounds of tool calls, each fetching market data.
export const maxDuration = 300;

const MAX_MESSAGES = 40;
const MAX_CHARS = 8000;
/** Rounds of tool calls per question, so a confused model can't run up the bill. */
const MAX_ROUNDS = 8;

const SYSTEM = `Du bist der Assistent von fnnzhrn, einem Freundeskreis, der sich für Finanzen interessiert. Du beantwortest Fragen eines Mitglieds zu seinen eigenen Daten in den fnnzhrn-Tools und zu den Märkten:

- Depot: Portfolio-Tracker mit Transaktionen, Positionen, Cash-Konten, Zielgewichten (Werkzeuge get_depot, get_depot_records)
- Finanzen: Einnahmen, Fixkosten, variable Ausgaben, Investitionen, Monate und Jahres-Snapshots (get_finances)
- Cockpit: Kurse, Gewinner/Verlierer, Value-Chancen, Schnäppchen-Radar, News, Quartalszahlen, Marktstimmung, 13F-Änderungen (get_quotes, search_symbol, get_news, get_market_screen, get_earnings, get_sentiment, get_investors)

Hol dir die Daten mit den Werkzeugen, statt zu raten, und rechne mit den Zahlen aus den Werkzeugen. Sag, wenn etwas in den Daten fehlt. Antworte in der Sprache der Frage (meist Deutsch, Schweizer Schreibweise mit ss statt ß), knapp und mit Zahlen; Tabellen in Markdown, wenn sie helfen. Beträge mit Währung. Du gibst keine Anlageberatung: Einschätzungen sind Einschätzungen, keine Empfehlungen.`;

type ChatMessage = { role: "user" | "assistant"; content: string };

function parseMessages(body: unknown): ChatMessage[] | string {
  const list = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(list) || !list.length) return "messages fehlt";
  if (list.length > MAX_MESSAGES) return "Der Verlauf ist zu lang. Starte ein neues Gespräch.";
  const messages: ChatMessage[] = [];
  for (const [i, m] of list.entries()) {
    const role = i % 2 === 0 ? "user" : "assistant";
    if (m?.role !== role || typeof m.content !== "string" || !m.content.trim()) return "Ungültiger Verlauf";
    if (m.content.length > MAX_CHARS) return `Eine Nachricht darf höchstens ${MAX_CHARS} Zeichen haben.`;
    messages.push({ role, content: m.content });
  }
  if (messages.at(-1)!.role !== "user") return "Die letzte Nachricht muss eine Frage sein";
  return messages;
}

/**
 * Answers the signed-in user's question with their own Claude API key. Body: `{ messages }`, alternating
 * user and assistant text, ending with the question. Streams newline-delimited JSON events:
 * `text` (part of the answer), `tool` (a tool being used), `done` (with the cost and the updated spend)
 * and `error`.
 */
export async function POST(request: Request) {
  const user = await requireMemberUser(request);
  if (user instanceof Response) return user;
  const parsed = parseMessages(await request.json().catch(() => null));
  if (typeof parsed === "string") return Response.json({ error: parsed }, { status: 400 });
  const connected = await loadApiKey(user.id);
  if (!connected) return Response.json({ error: "Verbinde zuerst deinen Claude API-Key.", needsKey: true }, { status: 409 });

  const { key: apiKey, model } = connected;
  const client = new Anthropic({ apiKey });
  // Haiku 5.5 has no server-side fallback; a refusal there ends the answer.
  const fallback = model === "claude-haiku-5-5" ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };
  const today = new Date().toLocaleDateString("de-CH", { timeZone: "Europe/Zurich", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const messages: Anthropic.Beta.BetaMessageParam[] = parsed.map((m) => ({ role: m.role, content: m.content }));
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      let cost = 0;
      try {
        for (let round = 0; ; round++) {
          const response = client.beta.messages.stream(
            {
              model,
              max_tokens: 16000,
              ...fallback,
              output_config: { effort: "medium" },
              cache_control: { type: "ephemeral" },
              system: `${SYSTEM}\n\nHeute ist ${today}.`,
              tools: TOOL_DEFINITIONS,
              messages,
            },
            { signal: request.signal },
          );
          for await (const event of response) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") send({ type: "text", text: event.delta.text });
          }
          const message = await response.finalMessage();
          const u = message.usage;
          const answerCost = costUsd(u, message.model);
          cost += answerCost;
          await recordUsage(user.id, {
            model: message.model,
            inputTokens: u.input_tokens,
            outputTokens: u.output_tokens,
            cacheReadTokens: u.cache_read_input_tokens ?? 0,
            cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
            costUsd: answerCost,
          });

          if (message.stop_reason === "refusal") {
            send({ type: "error", error: "Claude hat diese Frage abgelehnt. Formuliere sie anders." });
            break;
          }
          if (message.stop_reason === "max_tokens") {
            send({ type: "error", error: "Die Antwort wurde zu lang und ist abgeschnitten." });
            break;
          }
          if (message.stop_reason !== "tool_use") break;
          if (round + 1 >= MAX_ROUNDS) {
            send({ type: "error", error: "Zu viele Abfragen für eine Frage. Stell sie genauer." });
            break;
          }

          const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
          for (const c of calls) send({ type: "tool", name: c.name });
          const results = await Promise.all(
            calls.map(async (c): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
              try {
                return { type: "tool_result", tool_use_id: c.id, content: await runTool(c.name, c.input, user) };
              } catch (e) {
                const reason = e instanceof ToolInputError ? `Ungültige Eingabe: ${e.message}` : `Fehler: ${(e as Error).message}`;
                return { type: "tool_result", tool_use_id: c.id, content: reason, is_error: true };
              }
            }),
          );
          messages.push({ role: "assistant", content: message.content }, { role: "user", content: results });
          send({ type: "text", text: "\n\n" });
        }
        send({ type: "done", cost, status: await assistantStatus(user.id) });
      } catch (e) {
        send({ type: "error", ...describeError(e), cost, status: await assistantStatus(user.id).catch(() => null) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

/** What to tell the user about a failed request; `billing` shows how to top up, `needsKey` how to connect a key. */
function describeError(e: unknown): { error: string; billing?: boolean; needsKey?: boolean } {
  if (e instanceof Anthropic.AuthenticationError) return { error: "Dein API-Key wird nicht mehr akzeptiert. Verbinde einen neuen.", needsKey: true };
  if (e instanceof Anthropic.PermissionDeniedError) return { error: "Dein API-Key hat keine Berechtigung für dieses Modell.", needsKey: true };
  if (e instanceof Anthropic.RateLimitError) return { error: "Dein Anthropic-Konto ist gerade am Limit. Versuch es in einer Minute nochmals." };
  // Anthropic answers an empty credit balance with a plain 400; its message is the only way to tell.
  if (e instanceof Anthropic.BadRequestError && /credit balance/i.test(e.message)) return { error: "Dein Guthaben bei Anthropic ist aufgebraucht.", billing: true };
  if (e instanceof Anthropic.APIError) return { error: `Anthropic antwortet mit ${e.status ?? "einem Fehler"}: ${e.message}` };
  if ((e as Error).name === "AbortError") return { error: "Abgebrochen." };
  return { error: (e as Error).message || "Unbekannter Fehler" };
}
