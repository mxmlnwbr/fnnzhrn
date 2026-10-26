/** The model the assistant asks first; refusals fall back to another model on Anthropic's side. */
export const ASSISTANT_MODEL = "claude-opus-5-5";

/** US dollars per million tokens: input, output, cache reads, cache writes (5-minute cache). */
type Price = { input: number; output: number; cacheRead: number; cacheWrite: number };

const PRICES: Record<string, Price> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

/** Token counts as the API reports them, overall or per iteration. */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  model?: string | null;
}

/** Longest known model id that the given one starts with, so dated or suffixed ids still find a price. */
function priceFor(model: string): Price {
  const id = Object.keys(PRICES)
    .filter((k) => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return PRICES[id ?? ASSISTANT_MODEL];
}

/**
 * What one response cost in US dollars. With `iterations` (one per model that ran, e.g. a refused
 * attempt and the fallback that answered) each is priced at its own model's rates; otherwise the totals
 * are priced at the model that answered. Thinking tokens are part of `output_tokens`.
 */
export function costUsd(usage: TokenUsage & { iterations?: TokenUsage[] | null }, model: string): number {
  const parts = usage.iterations?.length ? usage.iterations : [usage];
  let total = 0;
  for (const u of parts) {
    const p = priceFor(u.model ?? model);
    total +=
      (u.input_tokens * p.input +
        u.output_tokens * p.output +
        (u.cache_read_input_tokens ?? 0) * p.cacheRead +
        (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) /
      1e6;
  }
  return total;
}
