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
  /** Id of one of the budget's categories; only expenses (fixed and variable) have one. */
  category?: string;
}

export const SECTIONS = ["income", "fixed", "variable", "invest"] as const;
export type Section = (typeof SECTIONS)[number];

/** The sections whose items are expenses and can be sorted into categories. */
export const EXPENSE_SECTIONS = ["fixed", "variable"] as const satisfies readonly Section[];
export type ExpenseSection = (typeof EXPENSE_SECTIONS)[number];

export interface Category {
  id: string;
  name: string;
}

/** What a budget starts with; each person can rename, remove and add their own. */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: "cat-wohnen", name: "Wohnen" },
  { id: "cat-versicherungen", name: "Versicherungen" },
  { id: "cat-mobilitaet", name: "Mobilität" },
  { id: "cat-gesundheit", name: "Gesundheit & Pflege" },
  { id: "cat-abos", name: "Abos & Kommunikation" },
  { id: "cat-essen", name: "Essen & Haushalt" },
  { id: "cat-freizeit", name: "Freizeit" },
];

/**
 * One person's financial overview: what comes in, what is fixed, what is spent flexibly (groceries,
 * going out), and what goes into investments.
 */
export interface Budget {
  version: 1;
  currency: string;
  categories: Category[];
  income: BudgetItem[];
  fixed: BudgetItem[];
  variable: BudgetItem[];
  invest: BudgetItem[];
  note: string;
  /** Saved yearly states, oldest first, at most one per year. */
  history: BudgetSnapshot[];
  /** What was actually spent, month by month, oldest first. */
  months: BudgetMonth[];
}

/** A fixed cost as it was taken over into a month, per month. */
export interface MonthLine {
  name: string;
  amount: number;
  category?: string;
}

/** Something spent in a month, entered by hand. */
export interface MonthExpense {
  id: string;
  name: string;
  amount: number;
  category?: string;
}

/**
 * One month: income, fixed costs and investments come from the plan and follow it while the month is
 * current, so a month keeps the plan it had on its last day. The other expenses are entered by hand.
 */
export interface BudgetMonth {
  /** "YYYY-MM" */
  month: string;
  income: number;
  invest: number;
  /** What the plan sets aside for flexible expenses, to compare with what was spent. */
  planned: number;
  fixed: MonthLine[];
  expenses: MonthExpense[];
}

/** The yearly totals of a budget as they were when saved, to compare how they change from year to year. */
export interface BudgetSnapshot {
  year: number;
  /** ISO date of the day it was saved. */
  savedAt: string;
  income: number;
  fixed: number;
  variable: number;
  invest: number;
  /** Expenses per category; `id` is undefined for those without a category. */
  categories: { id?: string; name: string; total: number }[];
}

export const EMPTY_BUDGET: Budget = {
  version: 1,
  currency: "CHF",
  categories: DEFAULT_CATEGORIES,
  income: [],
  fixed: [],
  variable: [],
  invest: [],
  note: "",
  history: [],
  months: [],
};

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
  variable: Amounts;
  /** Fixed and variable expenses together. */
  expenses: Amounts;
  invest: Amounts;
  /** Income left after fixed costs. */
  available: Amounts;
  /** Left after all expenses and investments: what's there for everything else. */
  free: Amounts;
}

const plus = (a: Amounts, b: Amounts) => ({ month: a.month + b.month, year: a.year + b.year });
const minus = (a: Amounts, b: Amounts) => ({ month: a.month - b.month, year: a.year - b.year });

export function summarizeBudget(budget: Budget): BudgetSummary {
  const income = sum(budget.income);
  const fixed = sum(budget.fixed);
  const variable = sum(budget.variable);
  const expenses = plus(fixed, variable);
  const invest = sum(budget.invest);
  return {
    income,
    fixed,
    variable,
    expenses,
    invest,
    available: minus(income, fixed),
    free: minus(minus(income, expenses), invest),
  };
}

export interface CategoryTotal {
  /** Undefined for the expenses that have no category. */
  category?: Category;
  fixed: Amounts;
  variable: Amounts;
  total: Amounts;
}

/** Expenses per category, in the budget's category order; expenses without a category come last, if there are any. */
export function categoryTotals(budget: Budget): CategoryTotal[] {
  const known = new Set(budget.categories.map((c) => c.id));
  const total = (filter: (item: BudgetItem) => boolean) => {
    const fixed = sum(budget.fixed.filter(filter));
    const variable = sum(budget.variable.filter(filter));
    return { fixed, variable, total: plus(fixed, variable) };
  };
  const rows: CategoryTotal[] = budget.categories.map((category) => ({ category, ...total((i) => i.category === category.id) }));
  const uncategorized = (i: BudgetItem) => !i.category || !known.has(i.category);
  if ([...budget.fixed, ...budget.variable].some(uncategorized)) rows.push(total(uncategorized));
  return rows;
}

/** What is left of the income in a snapshot after all expenses and investments, per year. */
export const snapshotFree = (s: BudgetSnapshot) => s.income - s.fixed - s.variable - s.invest;

/** The budget's current yearly totals, to be kept as the state of `year`. */
export function snapshotBudget(budget: Budget, year: number, savedAt: string): BudgetSnapshot {
  const s = summarizeBudget(budget);
  return {
    year,
    savedAt,
    income: s.income.year,
    fixed: s.fixed.year,
    variable: s.variable.year,
    invest: s.invest.year,
    categories: categoryTotals(budget).map((r) => ({
      ...(r.category ? { id: r.category.id } : {}),
      name: r.category ? r.category.name : "Ohne Kategorie",
      total: r.total.year,
    })),
  };
}

/** The history with `snapshot` in it, replacing an earlier one of the same year, sorted by year. */
export function withSnapshot(history: BudgetSnapshot[], snapshot: BudgetSnapshot): BudgetSnapshot[] {
  return [...history.filter((h) => h.year !== snapshot.year), snapshot].sort((a, b) => a.year - b.year);
}

/** The day in Switzerland, as "YYYY-MM-DD", so the year turns at midnight there and not in UTC. */
export function budgetDate(now: Date): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" });
}

/**
 * The budget with this year's snapshot set to its current totals. Run on every change, so each year
 * keeps the state it had on its last day once the next one starts.
 */
export function withYearSnapshot(budget: Budget, now: Date): Budget {
  const date = budgetDate(now);
  return { ...budget, history: withSnapshot(budget.history, snapshotBudget(budget, Number(date.slice(0, 4)), date)) };
}

/** The month of `now` in Switzerland, as "YYYY-MM". */
export const budgetMonth = (now: Date) => budgetDate(now).slice(0, 7);

/** `month` with income, fixed costs and investments taken over from the plan; the expenses stay. */
export function planMonth(budget: Budget, month: string, expenses: MonthExpense[] = []): BudgetMonth {
  return {
    month,
    income: sum(budget.income).month,
    invest: sum(budget.invest).month,
    planned: sum(budget.variable).month,
    fixed: budget.fixed.map((item) => ({
      name: item.name,
      amount: amounts(item).month,
      ...(item.category ? { category: item.category } : {}),
    })),
    expenses,
  };
}

/** The budget with the current month taken over from the plan, created if it doesn't exist yet. */
export function withCurrentMonth(budget: Budget, now: Date): Budget {
  const month = budgetMonth(now);
  const current = planMonth(budget, month, budget.months.find((m) => m.month === month)?.expenses);
  const months = [...budget.months.filter((m) => m.month !== month), current].sort((a, b) => a.month.localeCompare(b.month));
  return { ...budget, months: months.slice(-MAX_MONTHS) };
}

/** Keeps this year's snapshot and this month in step with the plan; run on every change. */
export const withSnapshots = (budget: Budget, now: Date) => withCurrentMonth(withYearSnapshot(budget, now), now);

export interface MonthSummary {
  income: number;
  fixed: number;
  invest: number;
  /** Entered by hand. */
  spent: number;
  /** What's left of the flexible budget the plan sets aside; negative when more was spent. */
  left: number;
  /** Left after everything. */
  free: number;
}

export function summarizeMonth(m: BudgetMonth): MonthSummary {
  const fixed = m.fixed.reduce((s, l) => s + l.amount, 0);
  const spent = m.expenses.reduce((s, e) => s + e.amount, 0);
  return { income: m.income, fixed, invest: m.invest, spent, left: m.planned - spent, free: m.income - fixed - m.invest - spent };
}

export interface MonthCategoryTotal {
  /** Undefined for what has no category. */
  category?: Category;
  fixed: number;
  spent: number;
}

/** Fixed costs and expenses of a month per category, in the budget's order; those without one last, if any. */
export function monthCategoryTotals(m: BudgetMonth, categories: Category[]): MonthCategoryTotal[] {
  const known = new Set(categories.map((c) => c.id));
  const total = (filter: (x: { category?: string }) => boolean) => ({
    fixed: m.fixed.filter(filter).reduce((s, l) => s + l.amount, 0),
    spent: m.expenses.filter(filter).reduce((s, e) => s + e.amount, 0),
  });
  const rows: MonthCategoryTotal[] = categories.map((category) => ({ category, ...total((x) => x.category === category.id) }));
  const uncategorized = (x: { category?: string }) => !x.category || !known.has(x.category);
  if ([...m.fixed, ...m.expenses].some(uncategorized)) rows.push(total(uncategorized));
  return rows;
}

const MAX_ITEMS = 200;
const MAX_SNAPSHOTS = 100;
const MAX_CATEGORIES = 50;
const MAX_MONTHS = 240;

function normalizeCategories(value: unknown): Category[] {
  // Budgets saved before there were categories start with the defaults.
  if (value === undefined) return DEFAULT_CATEGORIES;
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, MAX_CATEGORIES).flatMap((raw, i): Category[] => {
    if (!raw || typeof raw !== "object") return [];
    const c = raw as Partial<Category>;
    const id = typeof c.id === "string" && c.id ? c.id.slice(0, 100) : `cat-${i}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ id, name: typeof c.name === "string" ? c.name.slice(0, 100) : "" }];
  });
}

function normalizeItems(value: unknown, section: Section, categories: Set<string>): BudgetItem[] {
  if (!Array.isArray(value)) return [];
  const expense = (EXPENSE_SECTIONS as readonly Section[]).includes(section);
  return value.slice(0, MAX_ITEMS).flatMap((raw, i): BudgetItem[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Partial<BudgetItem>;
    const amount = Number(item.amount);
    const normalized: BudgetItem = {
      id: typeof item.id === "string" && item.id ? item.id.slice(0, 100) : `${section}-${i}`,
      name: typeof item.name === "string" ? item.name.slice(0, 200) : "",
      amount: Number.isFinite(amount) ? amount : 0,
      interval: INTERVALS.some((x) => x.value === item.interval) ? (item.interval as Interval) : "month",
    };
    if (expense && typeof item.category === "string" && categories.has(item.category)) normalized.category = item.category;
    return [normalized];
  });
}

const finite = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function normalizeHistory(value: unknown): BudgetSnapshot[] {
  if (!Array.isArray(value)) return [];
  const byYear = new Map<number, BudgetSnapshot>();
  for (const raw of value.slice(0, MAX_SNAPSHOTS)) {
    if (!raw || typeof raw !== "object") continue;
    const h = raw as Partial<Record<keyof BudgetSnapshot, unknown>>;
    const year = Number(h.year);
    if (!Number.isInteger(year) || year < 1900 || year > 3000) continue;
    const categories = Array.isArray(h.categories)
      ? h.categories.slice(0, MAX_CATEGORIES + 1).flatMap((c): BudgetSnapshot["categories"] => {
          if (!c || typeof c !== "object") return [];
          const { id, name, total } = c as Record<string, unknown>;
          return [
            {
              ...(typeof id === "string" && id ? { id: id.slice(0, 100) } : {}),
              name: typeof name === "string" ? name.slice(0, 100) : "",
              total: finite(total),
            },
          ];
        })
      : [];
    byYear.set(year, {
      year,
      savedAt: typeof h.savedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(h.savedAt) ? h.savedAt : `${year}-12-31`,
      income: finite(h.income),
      fixed: finite(h.fixed),
      variable: finite(h.variable),
      invest: finite(h.invest),
      categories,
    });
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

function normalizeMonths(value: unknown): BudgetMonth[] {
  if (!Array.isArray(value)) return [];
  const byMonth = new Map<string, BudgetMonth>();
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const category = (v: unknown) => (typeof v === "string" && v ? { category: v.slice(0, 100) } : {});
  for (const raw of value.slice(-MAX_MONTHS)) {
    if (!raw || typeof raw !== "object") continue;
    const m = raw as Partial<Record<keyof BudgetMonth, unknown>>;
    if (typeof m.month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(m.month)) continue;
    const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, MAX_ITEMS).filter((x) => x && typeof x === "object") : []);
    byMonth.set(m.month, {
      month: m.month,
      income: finite(m.income),
      invest: finite(m.invest),
      planned: finite(m.planned),
      fixed: list(m.fixed).map((l) => ({ name: text(l.name, 200), amount: finite(l.amount), ...category(l.category) })),
      expenses: list(m.expenses).map((e, i) => ({
        id: typeof e.id === "string" && e.id ? e.id.slice(0, 100) : `${m.month}-${i}`,
        name: text(e.name, 200),
        amount: finite(e.amount),
        ...category(e.category),
      })),
    });
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** A valid budget from saved or uploaded JSON; anything missing or malformed falls back to empty. */
export function normalizeBudget(data: unknown): Budget {
  if (!data || typeof data !== "object") return EMPTY_BUDGET;
  const d = data as Partial<Record<keyof Budget, unknown>>;
  const categories = normalizeCategories(d.categories);
  const ids = new Set(categories.map((c) => c.id));
  return {
    version: 1,
    currency: typeof d.currency === "string" && /^[A-Z]{3}$/.test(d.currency) ? d.currency : "CHF",
    categories,
    income: normalizeItems(d.income, "income", ids),
    fixed: normalizeItems(d.fixed, "fixed", ids),
    variable: normalizeItems(d.variable, "variable", ids),
    invest: normalizeItems(d.invest, "invest", ids),
    note: typeof d.note === "string" ? d.note.slice(0, 5000) : "",
    history: normalizeHistory(d.history),
    months: normalizeMonths(d.months),
  };
}
