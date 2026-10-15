import { describe, expect, it } from "vitest";
import type { Quote, Transaction } from "../types";
import { depotOverview } from "./depot-summary";

const tx = (t: Partial<Transaction> & Pick<Transaction, "type" | "date">): Transaction => ({ id: `${t.date}-${t.type}`, symbol: "AAA", quantity: 0, price: 0, fees: 0, ...t });
const quotes: Record<string, Quote> = { AAA: { symbol: "AAA", name: "Aaa Inc", currency: "USD", price: 120, previousClose: 118, changePercent: 120 / 118 - 1 } };
const fx = { CHF: 1, USD: 0.9 };
const today = new Date("2026-10-15T12:00:00Z");

describe("depotOverview", () => {
  const transactions = [
    tx({ type: "buy", date: "2025-03-01", quantity: 10, price: 100 }),
    tx({ type: "buy", date: "2026-02-01", quantity: 5, price: 115 }),
    tx({ type: "sell", date: "2026-05-01", quantity: 3, price: 118 }),
    tx({ type: "dividend", date: "2026-06-01", price: 20 }),
    tx({ type: "dividend", date: "2025-06-01", price: 10 }),
  ];

  it("uses the tracker's holdings and converts to the base currency", () => {
    const o = depotOverview(transactions, [{ id: "c", name: "Cash", currency: "CHF", balance: 500 }], "CHF", quotes, fx, { AAA: 110 }, today);
    expect(o.holdings).toHaveLength(1);
    expect(o.holdings[0].quantity).toBe(12);
    expect(o.holdings[0].avgCost).toBeCloseTo(105);
    expect(o.marketValue).toBeCloseTo(12 * 120 * 0.9);
    expect(o.netWorth).toBeCloseTo(12 * 120 * 0.9 + 500);
    expect(o.holdings[0].weight).toBeCloseTo(100);
  });

  it("measures this year against the holdings on 1 January, net of buys and sells", () => {
    const o = depotOverview(transactions, [], "CHF", quotes, fx, { AAA: 110 }, today);
    // now 1296 − start 990 − bought 517.5 + sold 318.6
    expect(o.ytd).toBeCloseTo(107.1);
    expect(o.ytdPercent).toBeCloseTo((107.1 / (990 + 517.5)) * 100);
    expect(o.dividendsYtd).toBeCloseTo(18);
    expect(o.dividendsTotal).toBeCloseTo(27);
  });

  it("leaves the year-to-date figure out when a price on 1 January is missing", () => {
    const o = depotOverview(transactions, [], "CHF", quotes, fx, { AAA: null }, today);
    expect(o.ytd).toBeNull();
    expect(o.ytdPercent).toBeNull();
  });
});
