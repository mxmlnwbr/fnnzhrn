import { describe, expect, it } from "vitest";
import { costOfTotalsUsd, costUsd } from "./pricing";

describe("costUsd", () => {
  it("prices input, output and cache tokens at the answering model's rates", () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 0 };
    expect(costUsd(usage, "claude-opus-5-5")).toBeCloseTo(4 + 2 + 0.2);
  });

  it("prices each iteration at its own model, e.g. a declined attempt and its fallback", () => {
    const usage = {
      input_tokens: 0,
      output_tokens: 0,
      iterations: [
        { model: "claude-opus-5-5", input_tokens: 1_000_000, output_tokens: 0 },
        { model: "claude-sonnet-5-5", input_tokens: 1_000_000, output_tokens: 1_000_000 },
      ],
    };
    expect(costUsd(usage, "claude-sonnet-5-5")).toBeCloseTo(4 + 2 + 10);
  });

  it("falls back to the default model's price for unknown models", () => {
    expect(costUsd({ input_tokens: 10_000, output_tokens: 0 }, "claude-something-new")).toBeCloseTo(0.001);
  });

  it("charges Haiku 5.5's long-prompt rate above 100K prompt tokens", () => {
    expect(costUsd({ input_tokens: 100_000, output_tokens: 0 }, "claude-haiku-5-5")).toBeCloseTo(0.01);
    expect(costUsd({ input_tokens: 50_000, output_tokens: 1000, cache_read_input_tokens: 60_000 }, "claude-haiku-5-5")).toBeCloseTo(0.025 + 0.0025 + 0.003);
  });

  it("prices 1-hour cache writes at twice the input rate", () => {
    const usage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 2_000_000,
      cache_creation: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 1_000_000 },
    };
    expect(costUsd(usage, "claude-opus-5-5")).toBeCloseTo(5 + 8);
  });
});

describe("costOfTotalsUsd", () => {
  it("prices summed tokens without the per-request long-prompt rate", () => {
    const hour = { input_tokens: 1_000_000, output_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 0 } };
    expect(costOfTotalsUsd(hour, "claude-haiku-5-5")).toBeCloseTo(0.1 + 0.125);
  });
});
