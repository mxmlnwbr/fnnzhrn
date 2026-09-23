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
}

export interface Settings {
  baseCurrency: string;
}

export interface PortfolioData {
  version: 1;
  settings: Settings;
  transactions: Transaction[];
}
