/** The models a member can choose for their answers, cheapest first. */
export const ASSISTANT_MODELS = [
  { id: "claude-haiku-5-5", label: "Haiku 5.5", hint: "günstig", description: "Am günstigsten, gut für einfache Fragen" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5", hint: "ausgewogen", description: "Etwa 20× teurer als Haiku, besser bei Berechnungen über mehrere Depots" },
  { id: "claude-opus-5-5", label: "Opus 5.5", hint: "genau", description: "Etwa doppelt so teuer wie Sonnet, für die schwierigsten Fragen" },
] as const;

export type AssistantModel = (typeof ASSISTANT_MODELS)[number]["id"];

/** What a member gets until they pick another model. */
export const DEFAULT_MODEL: AssistantModel = "claude-haiku-5-5";

export const isAssistantModel = (id: unknown): id is AssistantModel => ASSISTANT_MODELS.some((m) => m.id === id);

/** US dollars per million tokens: input, output, cache reads, cache writes (5-minute cache; a 1-hour write costs 2× input). */
type Price = { input: number; output: number; cacheRead: number; cacheWrite: number };

const PRICES: Record<string, Price> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

/** Haiku 5.5 costs more for prompts over 100K tokens. */
const LONG_PROMPT = 100_000;
const LONG_PRICES: Record<string, Price> = {
  "claude-haiku-5-5": { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 },
};

/** Token counts as the API reports them, overall or per iteration. */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  /** Cache writes split by how long they're kept, when the API reports it. */
  cache_creation?: { ephemeral_5m_input_tokens: number; ephemeral_1h_input_tokens: number } | null;
  model?: string | null;
}

/** Longest known model id that the given one starts with, so dated or suffixed ids still find a price. */
function priceFor(model: string, promptTokens: number): Price {
  const id =
    Object.keys(PRICES)
      .filter((k) => model.startsWith(k))
      .sort((a, b) => b.length - a.length)[0] ?? DEFAULT_MODEL;
  return (promptTokens > LONG_PROMPT && LONG_PRICES[id]) || PRICES[id];
}

/**
 * What one response cost in US dollars. With `iterations` (one per model that ran, e.g. a refused
 * attempt and the fallback that answered) each is priced at its own model's rates; otherwise the totals
 * are priced at the model that answered. Thinking tokens are part of `output_tokens`.
 */
export function costUsd(usage: TokenUsage & { iterations?: TokenUsage[] | null }, model: string): number {
  const parts = usage.iterations?.length ? usage.iterations : [usage];
  return parts.reduce((total, u) => total + price(u, model, true), 0);
}

/**
 * What a sum of many requests' tokens cost, e.g. an hour of the Usage Report. Haiku's long-prompt rate is
 * per request, so it can't be told from a sum and isn't applied.
 */
export const costOfTotalsUsd = (usage: TokenUsage, model: string) => price(usage, model, false);

function price(u: TokenUsage, model: string, oneRequest: boolean) {
  const writes = u.cache_creation_input_tokens ?? (u.cache_creation ? u.cache_creation.ephemeral_5m_input_tokens + u.cache_creation.ephemeral_1h_input_tokens : 0);
  const hour = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const p = priceFor(u.model ?? model, oneRequest ? u.input_tokens + (u.cache_read_input_tokens ?? 0) + writes : 0);
  return (
    (u.input_tokens * p.input + u.output_tokens * p.output + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (writes - hour) * p.cacheWrite + hour * p.input * 2) /
    1e6
  );
}
