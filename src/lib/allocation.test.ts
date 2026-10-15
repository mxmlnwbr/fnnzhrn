import { describe, expect, it } from "vitest";
import { allocation, defaultClass, foldSmall, industries, positionSlices, rebalance, sectorOf, topSlices } from "./allocation";
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

describe("by position", () => {
  const holdings = ["A", "B", "C", "D"].map((s, i) => holding(s, "USD", 1, 400 - i * 100));
  const slices = allocation(holdings, {}, { CHF: 50 }, {}, "position");

  it("gives each position its own slice and cash one", () => {
    expect(slices.map((s) => [s.key, s.value])).toEqual([["A", 400], ["B", 300], ["C", 200], ["D", 100], ["Cash", 50]]);
  });

  it("folds small slices into Other", () => {
    const top = topSlices(slices, 3);
    expect(top.map((s) => [s.key, s.value])).toEqual([["A", 400], ["B", 300], ["Other", 350]]);
    expect(top[2].positions.map((p) => p.symbol)).toEqual(["C", "D"]);
    expect(topSlices(slices, 5)).toBe(slices);
    expect(top.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1);
  });
});

describe("sectors and industries", () => {
  const holdings = [holding("ROP.SW", "CHF", 1, 500), holding("NOVN.SW", "CHF", 1, 300), holding("UBSG.SW", "CHF", 1, 150), holding("VWRL.SW", "CHF", 1, 40), holding("BTC-USD", "USD", 1, 10)];
  const quotes = {
    "ROP.SW": quote("ROP.SW", "EQUITY", "Roche"),
    "NOVN.SW": quote("NOVN.SW", "EQUITY", "Novartis"),
    "UBSG.SW": quote("UBSG.SW", "EQUITY", "UBS"),
    "VWRL.SW": quote("VWRL.SW", "ETF", "Vanguard FTSE All-World"),
    "BTC-USD": quote("BTC-USD", "CRYPTOCURRENCY", "Bitcoin"),
  };
  const profiles = {
    "ROP.SW": { sector: "Healthcare", industry: "Drug Manufacturers - General" },
    "NOVN.SW": { sector: "Healthcare", industry: "Drug Manufacturers - General" },
    "UBSG.SW": { sector: "Financial Services", industry: "Banks - Diversified" },
  };

  it("groups stocks by sector, funds and crypto apart", () => {
    const bySector = allocation(holdings, quotes, {}, {}, "sector", profiles);
    expect(bySector.map((s) => [s.key, s.value])).toEqual([
      ["Healthcare", 800],
      ["Financial Services", 150],
      ["ETF / fund", 40],
      ["Crypto", 10],
    ]);
    expect(sectorOf("Stocks", quotes["UBSG.SW"], undefined)).toBe("Other");
  });

  it("breaks a sector down by industry", () => {
    const health = allocation(holdings, quotes, {}, {}, "sector", profiles)[0];
    expect(industries(health, 1000).map((i) => [i.industry, i.share, i.positions.length])).toEqual([["Drug Manufacturers - General", 0.8, 2]]);
  });

  it("folds only small slices, and only two or more", () => {
    const byPosition = allocation(holdings, quotes, {}, {}, "position", profiles);
    expect(foldSmall(byPosition, 0.05).map((s) => s.key)).toEqual(["ROP.SW", "NOVN.SW", "UBSG.SW", "Other"]);
    expect(foldSmall(byPosition, 0.02)).toBe(byPosition);
  });
});

describe("positionSlices", () => {
  it("splits a class into its positions, with shares of that class, for rebalancing within it", () => {
    const quotes = { A: quote("A", "EQUITY", "A"), B: quote("B", "EQUITY", "B") };
    const classes = allocation([holding("A", "USD", 10, 300), holding("B", "USD", 10, 100)], quotes, { CHF: 600 }, {}, "class");
    const stocks = positionSlices(classes.find((c) => c.key === "Stocks"));
    expect(stocks.map((s) => [s.key, s.share])).toEqual([
      ["A", 0.75],
      ["B", 0.25],
    ]);
    const plan = rebalance(stocks, { A: 50, B: 50 }, { kind: "full" });
    expect(plan.trades.map((t) => [t.symbol, t.amount, t.shares])).toEqual([
      ["A", -100, -3],
      ["B", 100, 10],
    ]);
    expect(positionSlices(undefined)).toEqual([]);
  });
});
