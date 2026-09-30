import { describe, expect, it } from "vitest";
import { EMPTY_PORTFOLIO, EMPTY_STORE, mergePortfolios, mergeStores, normalizePortfolio, normalizeStore } from "./sync";
import type { Depot, DepotStore, PortfolioData, Transaction } from "./types";

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

const depot = (id: string, ids: string[]): Depot => ({ id, name: id, data: portfolio(ids) });
const store = (...depots: Depot[]): DepotStore => ({ version: 2, depots });
const txIds = (s: DepotStore) => Object.fromEntries(s.depots.map((d) => [d.id, d.data.transactions.map((t) => t.id)]));

describe("normalizeStore", () => {
  it("moves a portfolio saved before depots existed into the first depot", () => {
    const old = portfolio(["a"], "USD");
    expect(normalizeStore(old)).toEqual({ version: 2, depots: [{ id: "main", name: "Depot 1", data: old }] });
  });

  it("keeps depots and fills in their defaults", () => {
    const normalized = normalizeStore({ version: 2, depots: [{ id: "x", name: " Broker ", data: { transactions: [] } as never }] });
    expect(normalized.depots).toEqual([{ id: "x", name: "Broker", data: EMPTY_PORTFOLIO }]);
  });

  it("never returns an empty list of depots", () => {
    expect(normalizeStore({ version: 2, depots: [] })).toEqual(EMPTY_STORE);
  });

  it("rejects data that's neither", () => {
    expect(() => normalizeStore({})).toThrow();
  });
});

describe("mergeStores", () => {
  it("merges depots with the same id and keeps the account's order", () => {
    const merged = mergeStores(store(depot("main", ["local"])), store(depot("x", ["b"]), depot("main", ["a"])));
    expect(txIds(merged)).toEqual({ x: ["b"], main: ["a", "local"] });
    expect(merged.depots.map((d) => d.id)).toEqual(["x", "main"]);
  });

  it("adds local depots the account doesn't have, unless they're empty", () => {
    const merged = mergeStores(store(depot("main", []), depot("new", ["n"])), store(depot("x", ["b"])));
    expect(merged.depots.map((d) => d.id)).toEqual(["x", "new"]);
  });

  it("returns the account's data when nothing is new locally", () => {
    const remote = store(depot("main", ["a"]), depot("x", []));
    expect(mergeStores(EMPTY_STORE, remote)).toEqual(remote);
  });
});
