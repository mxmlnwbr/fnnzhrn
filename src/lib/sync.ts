import type { PortfolioData } from "./types";

export const EMPTY_PORTFOLIO: PortfolioData = { version: 1, settings: { baseCurrency: "CHF" }, transactions: [], cash: [] };

/** Fills in defaults and rejects data without a transactions array. */
export function normalizePortfolio(data: Partial<PortfolioData> | null | undefined): PortfolioData {
  if (!data || !Array.isArray(data.transactions)) throw new Error("File has no transactions array");
  return {
    version: 1,
    settings: { ...EMPTY_PORTFOLIO.settings, ...data.settings },
    transactions: data.transactions,
    cash: Array.isArray(data.cash) ? data.cash : [],
  };
}

function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const ids = new Set(remote.map((x) => x.id));
  return [...remote, ...local.filter((x) => !ids.has(x.id))];
}

/**
 * Combines data entered in this browser while signed out with the account's saved data.
 * Transactions and cash accounts are matched by id; the account's settings win.
 */
export function mergePortfolios(local: PortfolioData, remote: PortfolioData): PortfolioData {
  return {
    ...remote,
    transactions: mergeById(local.transactions, remote.transactions),
    cash: mergeById(local.cash, remote.cash),
  };
}
