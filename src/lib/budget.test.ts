import { describe, expect, it } from "vitest";
import {
  amounts,
  budgetDate,
  budgetMonth,
  categoryTotals,
  DEFAULT_CATEGORIES,
  EMPTY_BUDGET,
  monthCategoryTotals,
  normalizeBudget,
  planMonth,
  snapshotBudget,
  snapshotFree,
  summarizeBudget,
  summarizeMonth,
  withCurrentMonth,
  withSnapshot,
  withSnapshots,
  withYearSnapshot,
} from "./budget";
import { BUDGET_SEEDS } from "./budget-seeds";

describe("amounts", () => {
  it("spreads the 13th payment over the months", () => {
    expect(amounts({ amount: 6000, interval: "month13" })).toEqual({ month: 6500, year: 78000 });
    expect(amounts({ amount: 100, interval: "month" })).toEqual({ month: 100, year: 1200 });
    expect(amounts({ amount: 1200, interval: "year" })).toEqual({ month: 100, year: 1200 });
  });
});

describe("summarizeBudget", () => {
  it("splits income into fixed costs, investments and what is left", () => {
    const s = summarizeBudget({
      ...EMPTY_BUDGET,
      income: [{ id: "a", name: "Lohn", amount: 6000, interval: "month13" }],
      fixed: [{ id: "b", name: "Miete", amount: 1500, interval: "month" }],
      invest: [{ id: "c", name: "3a", amount: 7200, interval: "year" }],
    });
    expect(s.income).toEqual({ month: 6500, year: 78000 });
    expect(s.available).toEqual({ month: 5000, year: 60000 });
    expect(s.free).toEqual({ month: 4400, year: 52800 });
  });

  it("takes flexible expenses off what is free", () => {
    const s = summarizeBudget({
      ...EMPTY_BUDGET,
      income: [{ id: "a", name: "Lohn", amount: 6000, interval: "month" }],
      fixed: [{ id: "b", name: "Miete", amount: 1500, interval: "month" }],
      variable: [{ id: "c", name: "Lebensmittel", amount: 600, interval: "month" }],
    });
    expect(s.expenses).toEqual({ month: 2100, year: 25200 });
    expect(s.available).toEqual({ month: 4500, year: 54000 });
    expect(s.free).toEqual({ month: 3900, year: 46800 });
  });

  it("matches the totals of the spreadsheet the seed was made from", () => {
    const seed = BUDGET_SEEDS["maximilian.weber@bluewin.ch"];
    expect(normalizeBudget(seed)).toEqual(seed);
    const s = summarizeBudget(seed);
    // Übersicht: Einnahmen TOTAL, Ausgaben TOTAL and Überschuss (Einkommen - Fixkosten). The sheet's
    // monthly figures leave out the 13th salary; here it is spread over the months (+5223.15 / 12).
    expect(s.income.month).toBeCloseTo(5123.15 + 5223.15 / 12, 2);
    expect(s.income.year).toBeCloseTo(66700.95, 2);
    expect(s.fixed.month + s.invest.month).toBeCloseTo(3468.7475, 3);
    expect(s.fixed.year + s.invest.year).toBeCloseTo(41624.97, 2);
    expect(s.free.month).toBeCloseTo(1654.4025 + 5223.15 / 12, 3);
    expect(s.free.year).toBeCloseTo(25075.98, 2);
  });
});

describe("categoryTotals", () => {
  it("adds up fixed and flexible expenses per category, uncategorized last", () => {
    const rows = categoryTotals({
      ...EMPTY_BUDGET,
      categories: [
        { id: "w", name: "Wohnen" },
        { id: "m", name: "Mobilität" },
      ],
      fixed: [
        { id: "a", name: "Miete", amount: 1500, interval: "month", category: "w" },
        { id: "b", name: "Militär", amount: 400, interval: "year" },
      ],
      variable: [{ id: "c", name: "Möbel", amount: 1200, interval: "year", category: "w" }],
    });
    expect(rows.map((r) => r.category?.name)).toEqual(["Wohnen", "Mobilität", undefined]);
    expect(rows[0].fixed.month).toBe(1500);
    expect(rows[0].variable.month).toBe(100);
    expect(rows[0].total.month).toBe(1600);
    expect(rows[1].total.month).toBe(0);
    expect(rows[2].total.year).toBe(400);
  });

  it("leaves out the uncategorized row when every expense has a category", () => {
    expect(categoryTotals(EMPTY_BUDGET)).toHaveLength(DEFAULT_CATEGORIES.length);
  });
});

describe("normalizeBudget", () => {
  it("gives budgets saved before categories the defaults", () => {
    const b = normalizeBudget({ fixed: [{ id: "a", name: "Miete", amount: 1500, interval: "month" }] });
    expect(b.categories).toEqual(DEFAULT_CATEGORIES);
    expect(b.variable).toEqual([]);
  });

  it("keeps an emptied category list and drops categories that don't exist", () => {
    const b = normalizeBudget({
      categories: [{ id: "w", name: "Wohnen" }, { id: "w", name: "Doppelt" }],
      income: [{ id: "i", name: "Lohn", amount: 1, interval: "month", category: "w" }],
      fixed: [
        { id: "a", name: "Miete", amount: 1, interval: "month", category: "w" },
        { id: "b", name: "Alt", amount: 1, interval: "month", category: "gone" },
      ],
    });
    expect(b.categories).toEqual([{ id: "w", name: "Wohnen" }]);
    expect(b.income[0].category).toBeUndefined();
    expect(b.fixed.map((i) => i.category)).toEqual(["w", undefined]);
    expect(normalizeBudget({ categories: [] }).categories).toEqual([]);
  });

  it("drops malformed data", () => {
    expect(normalizeBudget(null)).toEqual(EMPTY_BUDGET);
    const b = normalizeBudget({ currency: "chf", income: [{ name: "x", amount: "12.5", interval: "weekly" }, 3], note: 7 });
    expect(b.currency).toBe("CHF");
    expect(b.income).toEqual([{ id: "income-0", name: "x", amount: 12.5, interval: "month" }]);
    expect(b.note).toBe("");
  });
});

describe("snapshotBudget", () => {
  const budget = {
    ...EMPTY_BUDGET,
    categories: [{ id: "w", name: "Wohnen" }],
    income: [{ id: "a", name: "Lohn", amount: 6000, interval: "month13" as const }],
    fixed: [
      { id: "b", name: "Miete", amount: 1500, interval: "month" as const, category: "w" },
      { id: "c", name: "Steuern", amount: 6000, interval: "year" as const },
    ],
    invest: [{ id: "d", name: "3a", amount: 7200, interval: "year" as const }],
  };

  it("keeps the yearly totals and the expenses per category", () => {
    const s = snapshotBudget(budget, 2026, "2026-12-31");
    expect(s).toEqual({
      year: 2026,
      savedAt: "2026-12-31",
      income: 78000,
      fixed: 24000,
      variable: 0,
      invest: 7200,
      categories: [
        { id: "w", name: "Wohnen", total: 18000 },
        { name: "Ohne Kategorie", total: 6000 },
      ],
    });
    expect(snapshotFree(s)).toBe(46800);
  });

  it("keeps one snapshot per year, sorted by year", () => {
    const a = snapshotBudget(budget, 2026, "2026-01-05");
    const b = snapshotBudget(EMPTY_BUDGET, 2025, "2025-12-31");
    const c = snapshotBudget(EMPTY_BUDGET, 2026, "2026-12-31");
    expect(withSnapshot(withSnapshot(withSnapshot([], a), b), c)).toEqual([b, c]);
  });

  it("survives saving and loading, and drops malformed snapshots", () => {
    const s = snapshotBudget(budget, 2026, "2026-12-31");
    expect(normalizeBudget({ ...budget, history: [s] }).history).toEqual([s]);
    expect(normalizeBudget({}).history).toEqual([]);
    expect(normalizeBudget({ history: [{ year: "x" }, 3, { year: 2024, income: "100", categories: [{ name: 5 }] }] }).history).toEqual([
      { year: 2024, savedAt: "2024-12-31", income: 100, fixed: 0, variable: 0, invest: 0, categories: [{ name: "", total: 0 }] },
    ]);
  });
});

describe("withYearSnapshot", () => {
  const lohn = (amount: number) => ({ ...EMPTY_BUDGET, income: [{ id: "a", name: "Lohn", amount, interval: "month" as const }] });

  it("turns the year at midnight in Switzerland", () => {
    expect(budgetDate(new Date("2026-12-31T22:59:00Z"))).toBe("2026-12-31");
    expect(budgetDate(new Date("2026-12-31T23:01:00Z"))).toBe("2027-01-01");
  });

  it("keeps updating this year and leaves last year as it was on its last day", () => {
    let b = withYearSnapshot(lohn(5000), new Date("2026-03-01T12:00:00Z"));
    b = withYearSnapshot({ ...lohn(5500), history: b.history }, new Date("2026-12-31T12:00:00Z"));
    expect(b.history.map((h) => [h.year, h.savedAt, h.income])).toEqual([[2026, "2026-12-31", 66000]]);
    b = withYearSnapshot({ ...lohn(6000), history: b.history }, new Date("2027-01-02T12:00:00Z"));
    expect(b.history.map((h) => [h.year, h.income])).toEqual([
      [2026, 66000],
      [2027, 72000],
    ]);
  });
});

describe("months", () => {
  const plan = {
    ...EMPTY_BUDGET,
    categories: [{ id: "w", name: "Wohnen" }],
    income: [{ id: "a", name: "Lohn", amount: 6000, interval: "month13" as const }],
    fixed: [
      { id: "b", name: "Miete", amount: 1500, interval: "month" as const, category: "w" },
      { id: "c", name: "Halbtax", amount: 1200, interval: "year" as const },
    ],
    variable: [{ id: "d", name: "Lebensmittel", amount: 600, interval: "month" as const }],
    invest: [{ id: "e", name: "Aktien", amount: 500, interval: "month" as const }],
  };

  it("takes the fixed costs over from the plan, per month", () => {
    const m = planMonth(plan, "2026-10");
    expect(m).toEqual({
      month: "2026-10",
      income: 6500,
      invest: 500,
      planned: 600,
      fixed: [
        { name: "Miete", amount: 1500, category: "w" },
        { name: "Halbtax", amount: 100 },
      ],
      expenses: [],
    });
  });

  it("follows the plan in the current month and keeps past months and their expenses", () => {
    const coop = { id: "x", name: "Coop", amount: 80, category: "w" };
    let b = withCurrentMonth(plan, new Date("2026-10-05T12:00:00Z"));
    b = { ...b, months: b.months.map((m) => ({ ...m, expenses: [coop] })) };
    b = withCurrentMonth({ ...b, fixed: [plan.fixed[0]] }, new Date("2026-10-31T12:00:00Z"));
    expect(b.months.map((m) => [m.month, m.fixed.length, m.expenses.length])).toEqual([["2026-10", 1, 1]]);
    b = withCurrentMonth({ ...b, fixed: [] }, new Date("2026-10-31T23:30:00Z"));
    expect(b.months.map((m) => [m.month, m.fixed.length, m.expenses.length])).toEqual([
      ["2026-10", 1, 1],
      ["2026-11", 0, 0],
    ]);
    expect(budgetMonth(new Date("2026-10-31T23:30:00Z"))).toBe("2026-11");
  });

  it("adds up what is left after the fixed costs and the expenses", () => {
    const m = { ...planMonth(plan, "2026-10"), expenses: [{ id: "x", name: "Coop", amount: 450, category: "w" }, { id: "y", name: "Kino", amount: 30 }] };
    expect(summarizeMonth(m)).toEqual({ income: 6500, fixed: 1600, invest: 500, spent: 480, left: 120, free: 3920 });
    expect(monthCategoryTotals(m, plan.categories)).toEqual([
      { category: { id: "w", name: "Wohnen" }, fixed: 1500, spent: 450 },
      { fixed: 100, spent: 30 },
    ]);
  });

  it("survives saving and loading, and drops malformed months", () => {
    const b = withSnapshots(plan, new Date("2026-10-05T12:00:00Z"));
    expect(normalizeBudget(b)).toEqual(b);
    expect(
      normalizeBudget({ months: [{ month: "2026-13" }, 4, { month: "2026-09", income: "100", expenses: [{ name: 3, amount: "12" }, null] }] }).months,
    ).toEqual([{ month: "2026-09", income: 100, invest: 0, planned: 0, fixed: [], expenses: [{ id: "2026-09-0", name: "", amount: 12 }] }]);
  });
});
