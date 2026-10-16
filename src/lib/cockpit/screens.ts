import { normaliseCurrency } from "../currency";

/**
 * What the Cockpit asks Yahoo's stock screener for: which market, which floors, which sort.
 * Pure definitions (no network), so they can be tested; `screener.ts` runs them.
 */

/** A condition in Yahoo's screener query language. */
export type Condition = { operator: "eq" | "gt" | "gte" | "lt" | "or"; operands: unknown[] };

export const eq = (field: string, value: string | number): Condition => ({ operator: "eq", operands: [field, value] });
export const gt = (field: string, value: number): Condition => ({ operator: "gt", operands: [field, value] });
export const gte = (field: string, value: number): Condition => ({ operator: "gte", operands: [field, value] });
export const lt = (field: string, value: number): Condition => ({ operator: "lt", operands: [field, value] });
export const or = (...conditions: Condition[]): Condition => ({ operator: "or", operands: conditions });
const exchanges = (...codes: string[]) => or(...codes.map((c) => eq("exchange", c)));

export type MarketId = "us" | "ch" | "de" | "eu" | "gb" | "jp";

export type Market = {
  id: MarketId;
  name: string;
  /** Currency of the quotes that belong to this market; other listings on the same exchanges are left out. */
  currency: string;
  /** Yahoo's region and exchange codes. */
  where: Condition[];
  /** Yahoo filters market caps in the exchange's quote unit, which is pence on the LSE. */
  capUnit: number;
  /** Floors for a liquid stock, in the market's currency and shares. */
  minCap: number;
  minVolume: number;
  minPrice: number;
};

/**
 * The markets with their own gainers/losers lists. Secondary listings (e.g. LVMH on SIX) rarely pass the
 * volume floor, and `inMarket` drops quotes in another currency (e.g. Toyota's yen listing in London).
 */
export const MARKETS: Record<MarketId, Market> = {
  // Same floors as Yahoo's own day gainers / losers.
  us: { id: "us", name: "USA", currency: "USD", where: [eq("region", "us"), exchanges("NMS", "NYQ", "NGM", "NCM")], capUnit: 1, minCap: 2e9, minVolume: 100_000, minPrice: 5 },
  ch: { id: "ch", name: "Schweiz", currency: "CHF", where: [eq("region", "ch"), eq("exchange", "EBS")], capUnit: 1, minCap: 1e9, minVolume: 10_000, minPrice: 0 },
  de: { id: "de", name: "Deutschland", currency: "EUR", where: [eq("region", "de"), eq("exchange", "GER")], capUnit: 1, minCap: 1e9, minVolume: 20_000, minPrice: 0 },
  eu: { id: "eu", name: "Europa", currency: "EUR", where: [exchanges("GER", "PAR", "AMS", "MIL", "MCE")], capUnit: 1, minCap: 1e9, minVolume: 50_000, minPrice: 0 },
  gb: { id: "gb", name: "UK", currency: "GBP", where: [eq("region", "gb"), eq("exchange", "LSE")], capUnit: 100, minCap: 1e9, minVolume: 100_000, minPrice: 0 },
  jp: { id: "jp", name: "Japan", currency: "JPY", where: [eq("region", "jp"), eq("exchange", "JPX")], capUnit: 1, minCap: 1.5e11, minVolume: 100_000, minPrice: 0 },
};

export const MARKET_IDS = Object.keys(MARKETS) as MarketId[];

export function isMarketId(id: string | null | undefined): id is MarketId {
  return MARKET_IDS.includes(id as MarketId);
}

export type Screen = { sortField: string; sortType: "ASC" | "DESC"; size: number; conditions: Condition[] };

/** The market cap floor the Schnäppchen-Radar uses: smaller companies than the movers, but no micro caps. */
export const RADAR_CAP_FACTOR = 0.3;
/** "Verschuldung tief": total debt below half the equity. */
export const MAX_DEBT_TO_EQUITY = 50;

/** Liquid stocks of a market: big enough, traded enough and, where Yahoo does the same, no penny stocks. */
function liquid(m: Market, capFactor = 1): Condition[] {
  return [
    ...m.where,
    gt("intradaymarketcap", m.minCap * capFactor * m.capUnit),
    gt("avgdailyvol3m", m.minVolume),
    ...(m.minPrice ? [gte("intradayprice", m.minPrice)] : []),
  ];
}

/** Today's biggest moves. A few more than wanted, since `inMarket` may drop some. */
export function moversScreen(m: Market, direction: "gainers" | "losers", size = 15): Screen {
  return { sortField: "percentchange", sortType: direction === "gainers" ? "DESC" : "ASC", size, conditions: liquid(m) };
}

export type ValueFilters = { maxPe: number; growth: boolean; lowDebt: boolean };

/**
 * Value candidates: cheap on trailing earnings, optionally with growing earnings and low debt, cheapest first.
 * "Growing" means earnings up over the last twelve months and expected to grow (a positive 5-year PEG), which
 * also leaves out closed-end funds and preferred shares; without the growth filter they can appear.
 */
export function valueScreen(m: Market, { maxPe, growth, lowDebt }: ValueFilters, size = 60): Screen {
  return {
    sortField: "peratio.lasttwelvemonths",
    sortType: "ASC",
    size,
    conditions: [
      ...liquid(m),
      gt("peratio.lasttwelvemonths", 0),
      lt("peratio.lasttwelvemonths", maxPe),
      ...(growth ? [gt("epsgrowth.lasttwelvemonths", 0), gt("pegratio_5y", 0)] : []),
      ...(lowDebt ? [lt("totaldebtequity.lasttwelvemonths", MAX_DEBT_TO_EQUITY)] : []),
    ],
  };
}

/**
 * The biggest 12-month losers; the radar computes the exact 6-month move from their charts. Yahoo can't
 * sort by the 6-month move, so a stock that fell hard only recently after a strong run can be missed.
 */
export function radarScreen(m: Market, size = 100): Screen {
  return { sortField: "fiftytwowkpercentchange", sortType: "ASC", size, conditions: liquid(m, RADAR_CAP_FACTOR) };
}

/** The JSON Yahoo's screener endpoint expects. */
export function screenBody(s: Screen) {
  return {
    size: s.size,
    offset: 0,
    sortField: s.sortField,
    sortType: s.sortType,
    quoteType: "EQUITY",
    query: { operator: "AND", operands: s.conditions },
    userId: "",
    userIdType: "guid",
  };
}

export type ScreenerQuote = ReturnType<typeof slimQuote>;

/** The fields the Cockpit shows from a screener quote; prices in pence become pounds. */
export function slimQuote(q: Record<string, unknown>) {
  const n = (k: string) => (typeof q[k] === "number" && Number.isFinite(q[k]) ? (q[k] as number) : null);
  const s = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : null);
  const { currency, divisor } = normaliseCurrency(s("currency") ?? undefined);
  const price = n("regularMarketPrice");
  return {
    symbol: s("symbol") ?? "",
    name: s("shortName") || s("longName") || s("displayName") || s("symbol") || "",
    currency,
    exchange: s("fullExchangeName"),
    price: price != null ? price / divisor : null,
    chgPct: n("regularMarketChangePercent"),
    marketCap: n("marketCap"),
    pe: n("trailingPE"),
    forwardPe: n("forwardPE"),
    eps: n("epsTrailingTwelveMonths"),
    epsForward: n("epsForward"),
    priceToBook: n("priceToBook"),
    chg52w: n("fiftyTwoWeekChangePercent"),
    fromHigh52: n("fiftyTwoWeekHighChangePercent") != null ? n("fiftyTwoWeekHighChangePercent")! * 100 : null,
    dividendYield: n("trailingAnnualDividendYield") != null ? n("trailingAnnualDividendYield")! * 100 : null,
    earnings: n("earningsTimestamp") != null ? n("earningsTimestamp")! * 1000 : null,
    rating: s("averageAnalystRating"),
  };
}

/** Whether a quote belongs to the market: quoted in its currency, with a price. */
export function inMarket(q: ScreenerQuote, m: Market): boolean {
  return q.currency === m.currency && q.price != null && q.price > 0;
}
