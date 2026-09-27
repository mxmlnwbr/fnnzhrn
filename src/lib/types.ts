export type TransactionType = "buy" | "sell" | "dividend";

export interface Transaction {
  id: string;
  symbol: string;
  type: TransactionType;
  /** ISO date, YYYY-MM-DD */
  date: string;
  /** Number of shares (0 for dividends). */
  quantity: number;
  /** Price per share for buy/sell, total amount for dividends. In the instrument's currency. */
  price: number;
  fees: number;
  note?: string;
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
  fees: number;
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
  /** Target share of net worth per asset class, in percent. */
  targets?: Record<string, number>;
}

export interface PortfolioData {
  version: 1;
  settings: Settings;
  transactions: Transaction[];
  cash: CashAccount[];
}
