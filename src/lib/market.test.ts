import { describe, expect, it, vi } from "vitest";
import { cashCurrencies, loadMarketData, type GetJson } from "./market";
import type { Transaction } from "./types";

const buy = (symbol: string, date: string): Transaction => ({ id: symbol, symbol, type: "buy", date, quantity: 1, price: 10, fees: 0 });

function api(): { getJson: GetJson; paths: string[] } {
  const paths: string[] = [];
  const getJson = vi.fn(async (path: string) => {
    paths.push(path);
    if (path.startsWith("/api/quotes") && path.includes("USDCHF")) return { "USDCHF=X": { price: 0.9 } };
    if (path.startsWith("/api/quotes")) return { AAPL: { symbol: "AAPL", currency: "USD", price: 200 } };
    if (path.startsWith("/api/history")) return { AAPL: [{ date: "2024-01-02", close: 180 }] };
    throw new Error(`unexpected ${path}`);
  }) as GetJson;
  return { getJson, paths };
}

describe("loadMarketData", () => {
  it("loads quotes, FX rates and history through the given fetcher", async () => {
    const { getJson, paths } = api();
    const data = await loadMarketData(getJson, [buy("AAPL", "2024-01-02")], [], "CHF");
    expect(data.quotes.AAPL.price).toBe(200);
    expect(data.fx).toEqual({ CHF: 1, USD: 0.9 });
    expect(data.prices.AAPL).toHaveLength(1);
    expect(paths.some((p) => p.startsWith("/api/history?from=2024-01-02"))).toBe(true);
  });

  it("skips the history when asked to", async () => {
    const { getJson, paths } = api();
    const data = await loadMarketData(getJson, [buy("AAPL", "2024-01-02")], [], "CHF", { history: false });
    expect(data.fx.USD).toBe(0.9);
    expect(data.prices.AAPL).toEqual([]);
    expect(paths.some((p) => p.startsWith("/api/history"))).toBe(false);
  });

  it("asks for nothing without positions or cash", async () => {
    const { getJson, paths } = api();
    await loadMarketData(getJson, [], [], "CHF");
    expect(paths).toEqual([]);
  });
});

describe("cashCurrencies", () => {
  it("lists cash and custody-fee currencies once, sorted", () => {
    const fee: Transaction = { id: "f", symbol: "", type: "fee", date: "2024-01-01", quantity: 0, price: 5, fees: 0, currency: "USD" };
    expect(cashCurrencies([fee], [{ id: "a", name: "A", currency: "CHF", balance: 1 }, { id: "b", name: "B", currency: "USD", balance: 2 }])).toEqual(["CHF", "USD"]);
  });
});
