/** How often an amount is paid: monthly, monthly with a 13th payment (salary), or once a year. */
export type Interval = "month" | "month13" | "year";

export const INTERVALS: { value: Interval; label: string }[] = [
  { value: "month", label: "monatlich" },
  { value: "month13", label: "monatl. 13×" },
  { value: "year", label: "jährlich" },
];

export interface BudgetItem {
  id: string;
  name: string;
  /** In the budget's currency, per interval. Negative for deductions, e.g. a lunch allowance taken off the salary. */
  amount: number;
  interval: Interval;
}

export const SECTIONS = ["income", "fixed", "invest"] as const;
export type Section = (typeof SECTIONS)[number];

/** One person's financial overview: what comes in, what is fixed, and what goes into investments. */
export interface Budget {
  version: 1;
  currency: string;
  income: BudgetItem[];
  fixed: BudgetItem[];
  invest: BudgetItem[];
  note: string;
}

export const EMPTY_BUDGET: Budget = { version: 1, currency: "CHF", income: [], fixed: [], invest: [], note: "" };

export interface Amounts {
  month: number;
  year: number;
}

/**
 * The amount per month and per year. Yearly amounts and the 13th payment are spread evenly over the
 * months, so a month is always a twelfth of the year.
 */
export function amounts(item: Pick<BudgetItem, "amount" | "interval">): Amounts {
  if (item.interval === "year") return { month: item.amount / 12, year: item.amount };
  const year = item.amount * (item.interval === "month13" ? 13 : 12);
  return { month: year / 12, year };
}

export function sum(items: BudgetItem[]): Amounts {
  return items.reduce(
    (acc, item) => {
      const a = amounts(item);
      return { month: acc.month + a.month, year: acc.year + a.year };
    },
    { month: 0, year: 0 },
  );
}

export interface BudgetSummary {
  income: Amounts;
  fixed: Amounts;
  invest: Amounts;
  /** Income left after fixed costs. */
  available: Amounts;
  /** Left after fixed costs and investments: what's there for everything else. */
  free: Amounts;
}

export function summarizeBudget(budget: Budget): BudgetSummary {
  const income = sum(budget.income);
  const fixed = sum(budget.fixed);
  const invest = sum(budget.invest);
  const minus = (a: Amounts, b: Amounts) => ({ month: a.month - b.month, year: a.year - b.year });
  const available = minus(income, fixed);
  return {
    income,
    fixed,
    invest,
    available,
    free: minus(available, invest),
  };
}

const MAX_ITEMS = 200;

function normalizeItems(value: unknown, section: Section): BudgetItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_ITEMS).flatMap((raw, i): BudgetItem[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<BudgetItem>;
    const amount = Number(item.amount);
    return [
      {
        id: typeof item.id === "string" && item.id ? item.id.slice(0, 100) : `${section}-${i}`,
        name: typeof item.name === "string" ? item.name.slice(0, 200) : "",
        amount: Number.isFinite(amount) ? amount : 0,
        interval: INTERVALS.some((x) => x.value === item.interval) ? (item.interval as Interval) : "month",
      },
    ];
  });
}

/** A valid budget from saved or uploaded JSON; anything missing or malformed falls back to empty. */
export function normalizeBudget(data: unknown): Budget {
  if (!data || typeof data !== "object") return EMPTY_BUDGET;
  const d = data as Partial<Record<keyof Budget, unknown>>;
  return {
    version: 1,
    currency: typeof d.currency === "string" && /^[A-Z]{3}$/.test(d.currency) ? d.currency : "CHF",
    income: normalizeItems(d.income, "income"),
    fixed: normalizeItems(d.fixed, "fixed"),
    invest: normalizeItems(d.invest, "invest"),
    note: typeof d.note === "string" ? d.note.slice(0, 5000) : "",
  };
}
