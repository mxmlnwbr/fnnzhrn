import { describe, expect, it } from "vitest";
import { EMPTY_PORTFOLIO, mergePortfolios, normalizePortfolio } from "./sync";
import type { PortfolioData, Transaction } from "./types";

const tx = (id: string): Transaction => ({ id, symbol: "ABC", type: "buy", date: "2026-01-01", quantity: 1, price: 10, fees: 0 });
const portfolio = (ids: string[], baseCurrency = "CHF"): PortfolioData => ({
  version: 1,
  settings: { baseCurrency },
  transactions: ids.map(tx),
  cash: [],
});

describe("mergePortfolios", () => {
  it("adds transactions entered while signed out to the account's", () => {
    const merged = mergePortfolios(portfolio(["a", "local"]), portfolio(["a", "b"], "USD"));
    expect(merged.transactions.map((t) => t.id)).toEqual(["a", "b", "local"]);
    expect(merged.settings.baseCurrency).toBe("USD");
  });

  it("adds cash accounts entered while signed out", () => {
    const account = (id: string) => ({ id, name: id, currency: "CHF", balance: 1 });
    const merged = mergePortfolios({ ...portfolio([]), cash: [account("a"), account("local")] }, { ...portfolio([]), cash: [account("a")] });
    expect(merged.cash.map((a) => a.id)).toEqual(["a", "local"]);
  });

  it("returns the account's data when nothing is new locally", () => {
    const remote = portfolio(["a"]);
    expect(mergePortfolios(EMPTY_PORTFOLIO, remote)).toEqual(remote);
  });
});

describe("normalizePortfolio", () => {
  it("fills in default settings", () => {
    expect(normalizePortfolio({ transactions: [] })).toEqual(EMPTY_PORTFOLIO);
  });

  it("keeps cash accounts and defaults them for older data", () => {
    const cash = [{ id: "a", name: "Bank", currency: "CHF", balance: 5 }];
    expect(normalizePortfolio({ transactions: [], cash }).cash).toEqual(cash);
  });

  it("rejects data without transactions", () => {
    expect(() => normalizePortfolio({})).toThrow();
    expect(() => normalizePortfolio(null)).toThrow();
  });
});
