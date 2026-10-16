import { describe, expect, it } from "vitest";
import { MARKETS, MAX_DEBT_TO_EQUITY, RADAR_CAP_FACTOR, inMarket, moversScreen, radarScreen, screenBody, slimQuote, valueScreen } from "./screens";

const conditions = (s: { conditions: { operator: string; operands: unknown[] }[] }) => s.conditions.map((c) => [c.operator, ...c.operands.map((o) => (typeof o === "object" ? "…" : o))].join(" "));

describe("moversScreen", () => {
  it("asks for liquid stocks of the market, biggest moves first", () => {
    const s = moversScreen(MARKETS.ch, "gainers");
    expect(s.sortField).toBe("percentchange");
    expect(s.sortType).toBe("DESC");
    expect(conditions(s)).toEqual(["eq region ch", "eq exchange EBS", "gt intradaymarketcap 1000000000", "gt avgdailyvol3m 10000"]);
    expect(moversScreen(MARKETS.ch, "losers").sortType).toBe("ASC");
  });

  it("keeps Yahoo's own floors for the US, incl. the price", () => {
    expect(conditions(moversScreen(MARKETS.us, "gainers"))).toContain("gte intradayprice 5");
    expect(conditions(moversScreen(MARKETS.us, "gainers"))).toContain("gt intradaymarketcap 2000000000");
  });

  it("filters London market caps in pence", () => {
    expect(conditions(moversScreen(MARKETS.gb, "gainers"))).toContain("gt intradaymarketcap 100000000000");
  });
});

describe("valueScreen", () => {
  it("screens on P/E, growth and debt, cheapest first", () => {
    const s = valueScreen(MARKETS.us, { maxPe: 15, growth: true, lowDebt: true });
    expect(s.sortField).toBe("peratio.lasttwelvemonths");
    expect(s.sortType).toBe("ASC");
    const c = conditions(s);
    expect(c).toContain("gt peratio.lasttwelvemonths 0");
    expect(c).toContain("lt peratio.lasttwelvemonths 15");
    expect(c).toContain("gt pegratio_5y 0");
    expect(c).toContain("gt epsgrowth.lasttwelvemonths 0");
    expect(c).toContain(`lt totaldebtequity.lasttwelvemonths ${MAX_DEBT_TO_EQUITY}`);
  });

  it("leaves growth and debt out when switched off", () => {
    const c = conditions(valueScreen(MARKETS.us, { maxPe: 20, growth: false, lowDebt: false }));
    expect(c.some((x) => x.startsWith("gt epsgrowth"))).toBe(false);
    expect(c.some((x) => x.startsWith("lt totaldebtequity"))).toBe(false);
    expect(c).toContain("lt peratio.lasttwelvemonths 20");
  });
});

describe("radarScreen", () => {
  it("takes the biggest 12-month losers above a lower cap floor", () => {
    const s = radarScreen(MARKETS.jp);
    expect(s.sortField).toBe("fiftytwowkpercentchange");
    expect(s.sortType).toBe("ASC");
    expect(conditions(s)).toContain(`gt intradaymarketcap ${MARKETS.jp.minCap * RADAR_CAP_FACTOR}`);
  });
});

describe("screenBody", () => {
  it("wraps the conditions the way Yahoo expects", () => {
    const body = screenBody(moversScreen(MARKETS.de, "gainers", 15));
    expect(body).toMatchObject({ size: 15, offset: 0, sortField: "percentchange", sortType: "DESC", quoteType: "EQUITY" });
    expect(body.query.operator).toBe("AND");
    expect(body.query.operands[0]).toEqual({ operator: "eq", operands: ["region", "de"] });
  });
});

describe("slimQuote and inMarket", () => {
  it("turns pence into pounds and keeps the market cap", () => {
    const q = slimQuote({ symbol: "BAB.L", shortName: "Babcock", currency: "GBp", regularMarketPrice: 1234.5, regularMarketChangePercent: 3.6, marketCap: 4.7e9, trailingPE: 23.5 });
    expect(q.currency).toBe("GBP");
    expect(q.price).toBeCloseTo(12.345);
    expect(q.marketCap).toBe(4.7e9);
    expect(q.pe).toBe(23.5);
    expect(inMarket(q, MARKETS.gb)).toBe(true);
  });

  it("drops listings quoted in another currency, and quotes without a price", () => {
    const toyotaInLondon = slimQuote({ symbol: "TYT.L", currency: "JPY", regularMarketPrice: 3000 });
    expect(inMarket(toyotaInLondon, MARKETS.gb)).toBe(false);
    const noPrice = slimQuote({ symbol: "X.SW", currency: "CHF" });
    expect(noPrice.price).toBeNull();
    expect(inMarket(noPrice, MARKETS.ch)).toBe(false);
  });

  it("scales percentages and timestamps", () => {
    const q = slimQuote({ symbol: "A", currency: "USD", regularMarketPrice: 1, fiftyTwoWeekHighChangePercent: -0.25, trailingAnnualDividendYield: 0.031, earningsTimestamp: 1700000000 });
    expect(q.fromHigh52).toBeCloseTo(-25);
    expect(q.dividendYield).toBeCloseTo(3.1);
    expect(q.earnings).toBe(1700000000000);
  });
});
