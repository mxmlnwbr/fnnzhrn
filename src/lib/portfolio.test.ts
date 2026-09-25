import { describe, expect, it } from "vitest";
import { buildHistory, buildPositions, incomeOverview, returnSeries, summarize } from "./portfolio";
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

describe("returnSeries", () => {
  it("measures growth net of deposits and withdrawals", () => {
    const r = returnSeries([
      { date: "2024-01-01", value: 100, invested: 100 },
      { date: "2024-01-02", value: 110, invested: 100 },
      // Deposit of 110 on a flat day: no change in return.
      { date: "2024-01-03", value: 220, invested: 210 },
      { date: "2024-01-04", value: 242, invested: 210 },
      // Withdrawal of 42 on a flat day.
      { date: "2024-01-05", value: 200, invested: 168 },
    ]);
    expect(r[0]).toBe(0);
    expect(r[1]).toBeCloseTo(0.1);
    expect(r[2]).toBeCloseTo(0.1);
    expect(r[3]).toBeCloseTo(0.21);
    expect(r[4]).toBeCloseTo(0.21);
  });

  it("skips days without a previous value", () => {
    expect(returnSeries([
      { date: "2024-01-01", value: 0, invested: 0 },
      { date: "2024-01-02", value: 50, invested: 50 },
      { date: "2024-01-03", value: 55, invested: 50 },
    ])).toEqual([0, 0, expect.closeTo(0.1)]);
  });
});

describe("incomeOverview", () => {
  const txs: Transaction[] = [
    { id: "1", symbol: "AAPL", type: "buy", date: "2024-03-01", quantity: 10, price: 100, fees: 10 },
    { id: "2", symbol: "AAPL", type: "dividend", date: "2024-06-01", quantity: 0, price: 20, fees: 3 },
    { id: "3", symbol: "NESN.SW", type: "buy", date: "2025-02-01", quantity: 5, price: 80, fees: 5 },
    { id: "4", symbol: "NESN.SW", type: "dividend", date: "2025-05-01", quantity: 0, price: 15, fees: 5.25 },
    { id: "5", symbol: "AAPL", type: "sell", date: "2025-07-01", quantity: 2, price: 150, fees: 4 },
  ];
  const quotes = {
    AAPL: { symbol: "AAPL", name: "Apple", currency: "USD", price: 150, previousClose: 150, changePercent: 0 },
    "NESN.SW": { symbol: "NESN.SW", name: "Nestle", currency: "CHF", price: 80, previousClose: 80, changePercent: 0 },
  };
  const fx = { CHF: 1, USD: 0.5 };
  const o = incomeOverview(txs, quotes, fx, "2025-09-25");

  it("sums dividends net of withholding tax, in the base currency", () => {
    expect(o.dividends.gross).toBeCloseTo(10 + 15);
    expect(o.dividends.tax).toBeCloseTo(1.5 + 5.25);
    expect(o.dividends.net).toBeCloseTo(8.5 + 9.75);
    expect(o.dividends.last12Months).toBeCloseTo(9.75);
    expect(o.dividends.byYear.map((r) => [r.key, r.amount])).toEqual([["2025", 9.75], ["2024", 8.5]]);
    expect(o.dividends.bySymbol.map((r) => r.key)).toEqual(["NESN.SW", "AAPL"]);
  });

  it("sums trading fees and traded volume", () => {
    expect(o.fees.total).toBeCloseTo(5 + 5 + 2);
    expect(o.fees.trades).toBe(3);
    expect(o.fees.volume).toBeCloseTo(500 + 400 + 150);
    expect(o.fees.byYear.map((r) => [r.key, r.amount, r.count])).toEqual([["2025", 7, 2], ["2024", 5, 1]]);
    expect(o.fees.bySymbol.map((r) => [r.key, r.amount])).toEqual([["AAPL", 7], ["NESN.SW", 5]]);
  });
});
