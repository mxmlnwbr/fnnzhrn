import { describe, expect, it } from "vitest";
import { buildHistory, buildPositions, summarize } from "./portfolio";
import type { Quote, Transaction } from "./types";

const tx = (t: Partial<Transaction> & Pick<Transaction, "type" | "date">): Transaction => ({
  id: `${t.date}-${t.type}-${Math.random()}`,
  symbol: "ABC",
  quantity: 0,
  price: 0,
  fees: 0,
  ...t,
});

const quote = (price: number, previousClose = price, currency = "USD"): Quote => ({
  symbol: "ABC",
  name: "ABC Corp",
  currency,
  price,
  previousClose,
  changePercent: price / previousClose - 1,
});

describe("buildPositions", () => {
  it("uses average cost and books realized P/L on sells", () => {
    const p = buildPositions([
      tx({ type: "buy", date: "2024-01-01", quantity: 10, price: 100, fees: 10 }),
      tx({ type: "buy", date: "2024-02-01", quantity: 10, price: 120 }),
      tx({ type: "sell", date: "2024-03-01", quantity: 5, price: 150, fees: 5 }),
    ]).get("ABC")!;
    // avg cost = (1010 + 1200) / 20 = 110.5
    expect(p.quantity).toBe(15);
    expect(p.cost).toBeCloseTo(15 * 110.5);
    expect(p.realized).toBeCloseTo(5 * 150 - 5 - 5 * 110.5);
  });

  it("counts dividends net of withholding", () => {
    const p = buildPositions([tx({ type: "dividend", date: "2024-01-01", price: 50, fees: 17.5 })]).get("ABC")!;
    expect(p.dividends).toBeCloseTo(32.5);
  });
});

describe("summarize", () => {
  it("adds cash balances to net worth in the base currency", () => {
    const s = summarize(
      [tx({ type: "buy", date: "2024-01-01", quantity: 10, price: 100 })],
      { ABC: quote(110) },
      { USD: 0.9, CHF: 1 },
      [
        { id: "a", name: "Bank", currency: "CHF", balance: 500 },
        { id: "b", name: "Broker", currency: "USD", balance: 100 },
      ],
    );
    expect(s.cash).toBeCloseTo(590);
    expect(s.netWorth).toBeCloseTo(990 + 590);
    expect(s.holdings[0].weight).toBe(1);
  });

  it("converts to the base currency and computes weights", () => {
    const s = summarize(
      [tx({ type: "buy", date: "2024-01-01", quantity: 10, price: 100 })],
      { ABC: quote(110, 105) },
      { USD: 0.9, CHF: 1 },
    );
    expect(s.marketValue).toBeCloseTo(990);
    expect(s.costBasis).toBeCloseTo(900);
    expect(s.unrealizedPL).toBeCloseTo(90);
    expect(s.dayChange).toBeCloseTo(45);
    expect(s.holdings[0].weight).toBe(1);
    expect(s.totalReturnPercent).toBeCloseTo(0.1);
  });

  it("drops fully sold positions from holdings but keeps realized P/L", () => {
    const s = summarize(
      [
        tx({ type: "buy", date: "2024-01-01", quantity: 10, price: 100 }),
        tx({ type: "sell", date: "2024-02-01", quantity: 10, price: 130 }),
      ],
      { ABC: quote(140) },
      { USD: 1 },
    );
    expect(s.holdings).toHaveLength(0);
    expect(s.realizedPL).toBeCloseTo(300);
  });
});

describe("buildHistory", () => {
  it("forward-fills prices and tracks net invested", () => {
    const h = buildHistory(
      [
        tx({ type: "buy", date: "2024-01-02", quantity: 2, price: 10 }),
        tx({ type: "buy", date: "2024-01-04", quantity: 1, price: 12 }),
      ],
      {
        ABC: [
          { date: "2024-01-01", close: 9 },
          { date: "2024-01-02", close: 10 },
          { date: "2024-01-03", close: 11 },
          { date: "2024-01-04", close: 12 },
        ],
      },
      { ABC: "EUR" },
      { EUR: [{ date: "2024-01-01", close: 2 }] },
      "CHF",
    );
    expect(h.map((p) => p.date)).toEqual(["2024-01-02", "2024-01-03", "2024-01-04"]);
    expect(h.map((p) => p.value)).toEqual([40, 44, 72]);
    expect(h.map((p) => p.invested)).toEqual([40, 40, 64]);
  });
});
