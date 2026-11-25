import { formatMoney, formatPercent } from "@core/currency";

export { formatMoney, formatPercent };

/** A number of shares: whole shares without decimals, fractions with up to four. */
export function formatQuantity(value: number): string {
  return new Intl.NumberFormat("de-CH", { maximumFractionDigits: 4 }).format(value);
}

/** An amount with its sign, e.g. for today's change. */
export function formatSignedMoney(value: number, currency: string): string {
  return `${value > 0 ? "+" : ""}${formatMoney(value, currency)}`;
}
