import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const quote = vi.fn();
const chart = vi.fn();
vi.mock("yahoo-finance2", () => ({
  default: class {
    quote = quote;
    chart = chart;
  },
}));

const { getHistory, getQuotes } = await import("./yahoo");

function validationError() {
  return Object.assign(new Error("Failed Yahoo Schema validation"), {
    name: "FailedYahooValidationError",
    errors: [{ instancePath: "/0/someField", message: "must be number" }],
  });
}

beforeEach(() => {
  quote.mockReset();
  chart.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("getQuotes", () => {
  it("falls back to the unvalidated result when Yahoo's schema changed", async () => {
    quote.mockRejectedValueOnce(validationError()).mockResolvedValueOnce([
      { symbol: "NESN.SW", currency: "CHF", regularMarketPrice: 80, regularMarketPreviousClose: 79, longName: "Nestle" },
      { symbol: "ODD.SW", currency: "CHF", regularMarketPrice: { raw: 5 } },
      { symbol: "VOD.L", currency: "GBp", regularMarketPrice: 7200, regularMarketPreviousClose: 7200, shortName: "Vodafone" },
    ]);
    const quotes = await getQuotes(["NESN.SW", "ODD.SW", "VOD.L"]);
    expect(quote).toHaveBeenLastCalledWith(["NESN.SW", "ODD.SW", "VOD.L"], { return: "array" }, { validateResult: false });
    expect(Object.keys(quotes)).toEqual(["NESN.SW", "VOD.L"]);
    expect(quotes["NESN.SW"]).toMatchObject({ price: 80, previousClose: 79, name: "Nestle" });
    expect(quotes["VOD.L"]).toMatchObject({ currency: "GBP", price: 72 });
  });

  it("still reports other errors", async () => {
    quote.mockRejectedValueOnce(new Error("Too Many Requests"));
    await expect(getQuotes(["AAPL"])).rejects.toThrow("Too Many Requests");
    expect(quote).toHaveBeenCalledTimes(1);
  });
});

describe("getHistory", () => {
  it("accepts dates as epoch seconds from an unvalidated result", async () => {
    chart.mockRejectedValueOnce(validationError()).mockResolvedValueOnce({
      meta: { currency: "USD" },
      quotes: [
        { date: 1735776000, close: 10 },
        { date: new Date("2025-01-03T14:30:00Z"), close: 11 },
        { date: 1736208000, close: null },
      ],
    });
    expect(await getHistory("AAPL", "2025-01-01")).toEqual([
      { date: "2025-01-02", close: 10 },
      { date: "2025-01-03", close: 11 },
    ]);
  });
});
