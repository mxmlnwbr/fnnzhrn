/** A fee is a custody fee (Depotgebühr): charged for the account, not for a position. */
export type TransactionType = "buy" | "sell" | "dividend" | "fee";

export interface Transaction {
  id: string;
  symbol: string;
  type: TransactionType;
  /** ISO date, YYYY-MM-DD */
  date: string;
  /** Number of shares (0 for dividends). */
  quantity: number;
  /** Price per share for buy/sell, total amount for dividends and custody fees. In the instrument's currency. */
  price: number;
  fees: number;
  note?: string;
  /** Currency of a custody fee, which has no instrument (its symbol is empty). */
  currency?: string;
}

export interface Quote {
  symbol: string;
  name: string;
  currency: string;
  price: number;
  previousClose: number;
  changePercent: number;
  /** Yahoo's quote type, e.g. EQUITY, ETF, MUTUALFUND, CRYPTOCURRENCY. */
  type?: string;
}

/** What a company does, from Yahoo; funds, ETFs and crypto have neither. */
export interface Profile {
  sector?: string;
  industry?: string;
}

export interface PricePoint {
  date: string;
  close: number;
}

export interface Holding {
  symbol: string;
  name: string;
  currency: string;
  quantity: number;
  avgCost: number;
  price: number;
  /** Values below are in the base currency. */
  costBasis: number;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  realizedPL: number;
  dividends: number;
  dayChange: number;
  dayChangePercent: number;
  weight: number;
}

export interface PortfolioSummary {
  holdings: Holding[];
  marketValue: number;
  costBasis: number;
  unrealizedPL: number;
  realizedPL: number;
  dividends: number;
  /** Trading fees. */
  fees: number;
  custodyFees: number;
  totalReturn: number;
  totalReturnPercent: number;
  dayChange: number;
  dayChangePercent: number;
  /** Cash balances in the base currency. */
  cash: number;
  /** Market value plus cash. */
  netWorth: number;
}

/** A money account (e.g. the cash side of a broker account), tracked by its current balance. */
export interface CashAccount {
  id: string;
  name: string;
  currency: string;
  balance: number;
}

export interface Settings {
  baseCurrency: string;
  /** Asset class per symbol, where the user overrode the automatic one. */
  categories?: Record<string, string>;
  /** Target share of the stocks per symbol, in percent. */
  targets?: Record<string, number>;
}

export interface PortfolioData {
  version: 1;
  settings: Settings;
  transactions: Transaction[];
  cash: CashAccount[];
}

/** One portfolio, e.g. an account at one broker. */
export interface Depot {
  id: string;
  name: string;
  data: PortfolioData;
}

/** Everything a user keeps: one or more depots. This is what's stored locally and synced. */
export interface DepotStore {
  version: 2;
  depots: Depot[];
  /** Settings of the view that adds up all depots; asset classes come from the depots instead. */
  combined?: Omit<Settings, "categories">;
  /** Ids of deleted depots, so a device still holding one doesn't upload it again. */
  deletedDepots?: string[];
}
