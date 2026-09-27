import { describe, expect, it } from "vitest";
import { allocation, defaultClass, rebalance } from "./allocation";
import type { Holding, Quote } from "./types";

const holding = (symbol: string, currency: string, quantity: number, marketValue: number): Holding => ({
  symbol,
  name: symbol,
  currency,
  quantity,
  avgCost: 0,
  price: marketValue / quantity,
  costBasis: 0,
  marketValue,
  unrealizedPL: 0,
  unrealizedPLPercent: 0,
  realizedPL: 0,
  dividends: 0,
  dayChange: 0,
  dayChangePercent: 0,
  weight: 0,
});
const quote = (symbol: string, type: string, name: string): Quote => ({
  symbol,
  name,
  type,
  currency: "USD",
  price: 1,
  previousClose: 1,
  changePercent: 0,
});

describe("defaultClass", () => {
  it("reads the class from the quote type and fund name", () => {
    expect(defaultClass(quote("NESN.SW", "EQUITY", "Nestlé"))).toBe("Stocks");
    expect(defaultClass(quote("VWRL.SW", "ETF", "Vanguard FTSE All-World UCITS ETF"))).toBe("Stocks");
    expect(defaultClass(quote("IDTL.SW", "ETF", "iShares $ Treasury Bond 20+yr UCITS ETF"))).toBe("Bonds");
    expect(defaultClass(quote("VTIP", "ETF", "Vanguard Short-Term Inflation-Protected Securities ETF TIPS"))).toBe("Bonds");
    expect(defaultClass(quote("SCHH", "ETF", "Schwab U.S. REIT ETF"))).toBe("Real estate");
    expect(defaultClass(quote("SXRS.DE", "ETF", "iShares Diversified Commodity Swap UCITS ETF"))).toBe("Commodities");
    expect(defaultClass(quote("BTC-USD", "CRYPTOCURRENCY", "Bitcoin USD"))).toBe("Crypto");
    expect(defaultClass(undefined)).toBe("Other");
  });
});

describe("allocation", () => {
  const holdings = [holding("AAPL", "USD", 10, 6000), holding("IDTL.SW", "USD", 100, 2000), holding("NESN.SW", "CHF", 10, 1000)];
  const quotes = {
    AAPL: quote("AAPL", "EQUITY", "Apple"),
    "IDTL.SW": quote("IDTL.SW", "ETF", "iShares Treasury Bond"),
    "NESN.SW": quote("NESN.SW", "EQUITY", "Nestle"),
  };

  it("groups by asset class with cash as its own class, honouring overrides", () => {
    const byClass = allocation(holdings, quotes, { CHF: 1000 }, { "NESN.SW": "Other" }, "class");
    expect(byClass.map((s) => [s.key, s.value, s.share])).toEqual([
      ["Stocks", 6000, 0.6],
      ["Bonds", 2000, 0.2],
      ["Other", 1000, 0.1],
      ["Cash", 1000, 0.1],
    ]);
  });

  it("groups by currency, cash included", () => {
    const byCurrency = allocation(holdings, quotes, { CHF: 1000, EUR: 500 }, {}, "currency");
    expect(byCurrency.map((s) => [s.key, s.value])).toEqual([
      ["USD", 8000],
      ["CHF", 2000],
      ["EUR", 500],
    ]);
  });
});

describe("rebalance", () => {
  const holdings = [holding("AAPL", "USD", 10, 6000), holding("MSFT", "USD", 10, 2000), holding("IDTL.SW", "USD", 100, 2000)];
  const quotes = {
    AAPL: quote("AAPL", "EQUITY", "Apple"),
    MSFT: quote("MSFT", "EQUITY", "Microsoft"),
    "IDTL.SW": quote("IDTL.SW", "ETF", "Treasury Bond"),
  };
  const classes = allocation(holdings, quotes, {}, {}, "class");

  it("sells overweight and buys underweight classes, spread over positions by size", () => {
    const r = rebalance(classes, { Stocks: 60, Bonds: 40 }, { kind: "full" });
    expect(r.rows.map((x) => [x.key, x.delta])).toEqual([
      ["Stocks", -2000],
      ["Bonds", 2000],
    ]);
    expect(r.trades).toEqual([
      { symbol: "AAPL", name: "AAPL", amount: -1500, shares: -2 },
      { symbol: "MSFT", name: "MSFT", amount: -500, shares: -2 },
      { symbol: "IDTL.SW", name: "IDTL.SW", amount: 2000, shares: 100 },
    ]);
  });

  it("only buys with new money, filling the shortfall first", () => {
    const r = rebalance(classes, { Stocks: 60, Bonds: 40 }, { kind: "buy", newMoney: 1000 });
    expect(r.trades).toEqual([{ symbol: "IDTL.SW", name: "IDTL.SW", amount: 1000, shares: 50 }]);
    // More money than the shortfall: the rest follows the targets.
    const more = rebalance(classes, { Stocks: 60, Bonds: 40 }, { kind: "buy", newMoney: 5000 });
    const bonds = more.rows.find((x) => x.key === "Bonds")!;
    const stocks = more.rows.find((x) => x.key === "Stocks")!;
    expect(bonds.delta + stocks.delta).toBeCloseTo(5000);
    expect((bonds.value + bonds.delta) / 15000).toBeCloseTo(0.4);
  });

  it("reports targets for classes with nothing to buy into", () => {
    const r = rebalance(classes, { Stocks: 70, Bonds: 20, Crypto: 10 }, { kind: "full" });
    expect(r.unplaced).toEqual([{ key: "Crypto", amount: 1000 }]);
  });
});
