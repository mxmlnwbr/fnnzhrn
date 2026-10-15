/**
 * Yahoo quotes some exchanges in minor units (e.g. LSE in GBp = pence).
 * Normalise to the major currency and return the divisor to apply to prices.
 */
const MINOR_UNITS: Record<string, [string, number]> = {
  GBp: ["GBP", 100],
  GBX: ["GBP", 100],
  ZAc: ["ZAR", 100],
  ILA: ["ILS", 100],
};

export function normaliseCurrency(currency: string | undefined): { currency: string; divisor: number } {
  if (!currency) return { currency: "USD", divisor: 1 };
  const minor = MINOR_UNITS[currency];
  if (minor) return { currency: minor[0], divisor: minor[1] };
  return { currency: currency.toUpperCase(), divisor: 1 };
}

export function fxSymbol(from: string, to: string): string {
  return `${from}${to}=X`;
}

export const BASE_CURRENCIES = ["CHF", "EUR", "USD", "GBP"];

export function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(2)}%`;
}
