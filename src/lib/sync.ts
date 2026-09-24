import type { PortfolioData } from "./types";

export const EMPTY_PORTFOLIO: PortfolioData = { version: 1, settings: { baseCurrency: "CHF" }, transactions: [] };

/** Fills in defaults and rejects data without a transactions array. */
export function normalizePortfolio(data: Partial<PortfolioData> | null | undefined): PortfolioData {
  if (!data || !Array.isArray(data.transactions)) throw new Error("File has no transactions array");
  return {
    version: 1,
    settings: { ...EMPTY_PORTFOLIO.settings, ...data.settings },
    transactions: data.transactions,
  };
}

/**
 * Combines data entered in this browser while signed out with the account's saved data.
 * Transactions are matched by id; the account's settings win.
 */
export function mergePortfolios(local: PortfolioData, remote: PortfolioData): PortfolioData {
  const ids = new Set(remote.transactions.map((t) => t.id));
  const added = local.transactions.filter((t) => !ids.has(t.id));
  return { ...remote, transactions: [...remote.transactions, ...added] };
}
