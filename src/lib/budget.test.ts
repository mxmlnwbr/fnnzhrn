import { describe, expect, it } from "vitest";
import { amounts, EMPTY_BUDGET, normalizeBudget, summarizeBudget } from "./budget";
import { BUDGET_SEEDS } from "./budget-seeds";

describe("amounts", () => {
  it("leaves the 13th payment out of the month but counts it in the year", () => {
    expect(amounts({ amount: 5000, interval: "month13" })).toEqual({ month: 5000, year: 65000 });
    expect(amounts({ amount: 100, interval: "month" })).toEqual({ month: 100, year: 1200 });
    expect(amounts({ amount: 1200, interval: "year" })).toEqual({ month: 100, year: 1200 });
  });
});

describe("summarizeBudget", () => {
  it("splits income into fixed costs, investments and what is left", () => {
    const s = summarizeBudget({
      ...EMPTY_BUDGET,
      income: [{ id: "a", name: "Lohn", amount: 5000, interval: "month13" }],
      fixed: [{ id: "b", name: "Miete", amount: 1500, interval: "month" }],
      invest: [{ id: "c", name: "3a", amount: 7200, interval: "year" }],
    });
    expect(s.income).toEqual({ month: 5000, year: 65000 });
    expect(s.available).toEqual({ month: 3500, year: 47000 });
    expect(s.free).toEqual({ month: 2900, year: 39800 });
  });

  it("matches the totals of the spreadsheet the seed was made from", () => {
    const seed = BUDGET_SEEDS["maximilian.weber@bluewin.ch"];
    expect(normalizeBudget(seed)).toEqual(seed);
    const s = summarizeBudget(seed);
    // Übersicht: Einnahmen TOTAL, Ausgaben TOTAL and Überschuss (Einkommen - Fixkosten).
    expect(s.income.month).toBeCloseTo(5123.15, 2);
    expect(s.income.year).toBeCloseTo(66700.95, 2);
    expect(s.fixed.month + s.invest.month).toBeCloseTo(3468.7475, 3);
    expect(s.fixed.year + s.invest.year).toBeCloseTo(41624.97, 2);
    expect(s.free.month).toBeCloseTo(1654.4025, 3);
    expect(s.free.year).toBeCloseTo(25075.98, 2);
  });
});

describe("normalizeBudget", () => {
  it("drops malformed data", () => {
    expect(normalizeBudget(null)).toEqual(EMPTY_BUDGET);
    const b = normalizeBudget({ currency: "chf", income: [{ name: "x", amount: "12.5", interval: "weekly" }, 3], note: 7 });
    expect(b.currency).toBe("CHF");
    expect(b.income).toEqual([{ id: "income-0", name: "x", amount: 12.5, interval: "month" }]);
    expect(b.note).toBe("");
  });
});
