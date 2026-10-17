import { describe, expect, it } from "vitest";
import { amounts, categoryTotals, DEFAULT_CATEGORIES, EMPTY_BUDGET, normalizeBudget, summarizeBudget } from "./budget";
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
