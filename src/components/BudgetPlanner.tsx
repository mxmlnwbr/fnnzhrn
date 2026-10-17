"use client";

import { useEffect, useRef, useState } from "react";
import { Pie, PieChart, ResponsiveContainer } from "recharts";
import {
  type Amounts,
  amounts,
  type Budget,
  type BudgetItem,
  type BudgetSnapshot,
  type Category,
  type CategoryTotal,
  categoryTotals,
  EXPENSE_SECTIONS,
  INTERVALS,
  type Interval,
  type Section,
  SECTIONS,
  snapshotBudget,
  snapshotFree,
  sum,
  summarizeBudget,
  withSnapshot,
} from "@/lib/budget";
import { formatMoney } from "@/lib/currency";
import { buttonClass, Card, inputClass, pnlClass } from "./ui";

type Period = keyof Amounts;
type SaveState = "saved" | "saving" | "error";

const SECTION_INFO: Record<Section, { title: string; hint: string; color: string; placeholder: string }> = {
  income: { title: "Einnahmen", hint: "Netto, was aufs Konto kommt", color: "var(--series-3)", placeholder: "z. B. Netto Lohn" },
  fixed: { title: "Fixkosten", hint: "Was jeden Monat oder jedes Jahr sicher anfällt", color: "var(--series-2)", placeholder: "z. B. Miete" },
  variable: {
    title: "Flexible Ausgaben",
    hint: "Was je nach Monat schwankt – trag ein, was du ungefähr ausgibst",
    color: "var(--series-4)",
    placeholder: "z. B. Lebensmittel",
  },
  invest: { title: "Investieren", hint: "Was du regelmässig anlegen willst", color: "var(--series-1)", placeholder: "z. B. Säule 3a" },
};

const percent = (v: number) => `${(v * 100).toFixed(1)}%`;
const whole = (v: number) => new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 }).format(v);

/** The palette has eight hues; categories past that and expenses without a category stay grey. */
const categoryColor = (index: number) => (index >= 0 && index < 8 ? `var(--series-${index + 1})` : "var(--series-other)");

/** Saves after a short pause in typing, and once more when the page is left with changes pending. */
function useAutosave(budget: Budget): SaveState {
  const [state, setState] = useState<SaveState>("saved");
  const loaded = useRef(budget);
  const pending = useRef<Budget | null>(null);

  useEffect(() => {
    if (budget === loaded.current) return;
    pending.current = budget;
    setState("saving");
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/budget", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: budget }),
        });
        if (!res.ok) throw new Error(String(res.status));
        if (pending.current === budget) {
          pending.current = null;
          setState("saved");
        }
      } catch {
        setState("error");
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [budget]);

  useEffect(() => {
    const flush = () => {
      if (!pending.current) return;
      void fetch("/api/budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: pending.current }),
        keepalive: true,
      });
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  return state;
}

export function BudgetPlanner({ initial }: { initial: Budget }) {
  const [budget, setBudget] = useState(initial);
  const [period, setPeriod] = useState<Period>("month");
  const save = useAutosave(budget);
  const summary = summarizeBudget(budget);
  const m = (v: number) => formatMoney(v, budget.currency);
  const income = summary.income[period];
  const share = (v: number) => (income > 0 ? percent(v / income) : "–");

  const updateSection = (section: Section, items: BudgetItem[]) => setBudget((b) => ({ ...b, [section]: items }));
  const updateCategories = (categories: Category[]) =>
    setBudget((b) => {
      // Expenses of a removed category are kept, just without one.
      const ids = new Set(categories.map((c) => c.id));
      const keep = (items: BudgetItem[]) =>
        items.map(({ category, ...item }) => (category && ids.has(category) ? { ...item, category } : item));
      return { ...b, categories, fixed: keep(b.fixed), variable: keep(b.variable) };
    });

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Finanzübersicht</h1>
          <p className="text-sm text-zinc-500">Was reinkommt, was du ausgibst und wie viel davon du investierst.</p>
        </div>
        <div className="flex items-center gap-3">
          <SaveStatus state={save} />
          <div role="group" aria-label="Zeitraum" className="flex rounded-md border border-zinc-300 p-0.5 text-sm dark:border-zinc-700">
            {(["month", "year"] as const).map((p) => (
              <button
                key={p}
                aria-pressed={period === p}
                onClick={() => setPeriod(p)}
                className={`rounded px-3 py-1 ${period === p ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"}`}
              >
                {p === "month" ? "Monat" : "Jahr"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Einkommen" value={m(summary.income[period])} sub={period === "month" ? "inkl. 13. Monatslohn (verteilt)" : "inkl. 13. Monatslohn"} />
        <Stat
          label="Ausgaben"
          value={m(summary.expenses[period])}
          sub={`fix ${m(summary.fixed[period])} · flexibel ${m(summary.variable[period])}`}
        />
        <Stat label="Investieren" value={m(summary.invest[period])} sub={`Sparquote ${share(summary.invest[period])}`} />
        <Stat
          label="Frei verfügbar"
          value={m(summary.free[period])}
          sub={`nach Fixkosten ${m(summary.available[period])}`}
          negative={summary.free[period] < 0}
        />
      </div>

      <Split summary={summary} period={period} format={m} />

      <CategoriesCard budget={budget} period={period} format={m} currency={budget.currency} onChange={updateCategories} />

      <HistoryCard
        budget={budget}
        period={period}
        format={m}
        onChange={(history) => setBudget((b) => ({ ...b, history }))}
      />

      {SECTIONS.map((section) => (
        <ItemsCard
          key={section}
          section={section}
          items={budget[section]}
          categories={(EXPENSE_SECTIONS as readonly Section[]).includes(section) ? budget.categories : undefined}
          period={period}
          format={m}
          onChange={(items) => updateSection(section, items)}
        />
      ))}
      <Card title="Notiz">
        <textarea
          className={`${inputClass} min-h-20`}
          value={budget.note}
          placeholder="z. B. Steuern & 13. Monatslohn sollten sich aufheben"
          onChange={(e) => setBudget((b) => ({ ...b, note: e.target.value }))}
        />
      </Card>
    </main>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  const text = { saved: "Gespeichert", saving: "Speichert…", error: "Speichern fehlgeschlagen" }[state];
  const dot = { saved: "bg-emerald-500", saving: "bg-sky-500 motion-safe:animate-pulse", error: "bg-red-500" }[state];
  return (
    <span className={`flex items-center gap-1.5 text-xs ${state === "error" ? "text-red-600 dark:text-red-400" : "text-zinc-500"}`} role="status">
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {text}
    </span>
  );
}

function Stat({ label, value, sub, negative }: { label: string; value: string; sub: string; negative?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${negative ? "text-red-600 dark:text-red-400" : ""}`}>{value}</div>
      <div className="text-xs text-zinc-500 tabular-nums">{sub}</div>
    </div>
  );
}

/** Where the income goes: one bar split into fixed costs, flexible expenses, investments and what's left. */
function Split({ summary, period, format }: { summary: ReturnType<typeof summarizeBudget>; period: Period; format: (v: number) => string }) {
  const income = summary.income[period];
  const parts = [
    { label: "Fixkosten", value: summary.fixed[period], color: SECTION_INFO.fixed.color },
    { label: "Flexibel", value: summary.variable[period], color: SECTION_INFO.variable.color },
    { label: "Investieren", value: summary.invest[period], color: SECTION_INFO.invest.color },
    { label: "Frei", value: Math.max(0, summary.free[period]), color: "var(--series-other)" },
  ];
  const total = Math.max(income, summary.expenses[period] + summary.invest[period]);
  return (
    <Card title="Wohin das Einkommen geht">
      {total > 0 ? (
        <>
          <div className="flex h-4 gap-0.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            {parts.map((p) =>
              p.value > 0 ? (
                <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${format(p.value)}`} />
              ) : null,
            )}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {parts.map((p) => (
              <li key={p.label} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />
                <span className="text-zinc-500">{p.label}</span>
                <span className="tabular-nums">{format(p.value)}</span>
                {income > 0 && <span className="text-zinc-500 tabular-nums">({percent(p.value / income)})</span>}
              </li>
            ))}
          </ul>
          {summary.free[period] < 0 && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">
              Ausgaben und Investitionen sind {format(-summary.free[period])} höher als das Einkommen.
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-zinc-500">Trage dein Einkommen ein, um die Aufteilung zu sehen.</p>
      )}
    </Card>
  );
}

function newItem(category?: string): BudgetItem {
  return { id: crypto.randomUUID(), name: "", amount: 0, interval: "month", ...(category ? { category } : {}) };
}

/** Donut of the expenses per category; hovering a slice (or its row) shows its share in the middle. */
function CategoryDonut({
  rows,
  period,
  active,
  onActive,
  center,
}: {
  rows: CategoryTotal[];
  period: Period;
  active: number | null;
  onActive: (i: number | null) => void;
  center: { label: string; value: string };
}) {
  const total = rows.reduce((s, r) => s + Math.max(0, r.total[period]), 0);
  const data = rows
    .map((r, i) => ({ index: i, key: r.category?.id ?? "none", value: r.total[period], fill: categoryColor(r.category ? i : -1) }))
    .filter((d) => d.value > 0);
  const current = active !== null ? rows[active] : null;
  return (
    <div className="relative mx-auto h-44 w-44 shrink-0" onMouseLeave={() => onActive(null)}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="key"
            innerRadius="62%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            stroke="var(--chart-surface)"
            strokeWidth={2}
            isAnimationActive={false}
            onMouseEnter={(_, i) => onActive(data[i].index)}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="max-w-24 truncate text-xs text-zinc-500">
          {current ? (current.category ? current.category.name || "Kategorie" : "Ohne Kategorie") : center.label}
        </span>
        <span className="text-lg font-semibold tabular-nums">
          {current ? (total > 0 ? percent(Math.max(0, current.total[period]) / total) : "–") : center.value}
        </span>
      </div>
    </div>
  );
}

/**
 * Expenses per category as a donut, with each category's fixed and flexible part in the list next to
 * it. Categories are renamed in place, removed with ×, and added at the bottom.
 */
function CategoriesCard({
  budget,
  period,
  format,
  currency,
  onChange,
}: {
  budget: Budget;
  period: Period;
  format: (v: number) => string;
  currency: string;
  onChange: (categories: Category[]) => void;
}) {
  const [name, setName] = useState("");
  const [active, setActive] = useState<number | null>(null);
  const rows = categoryTotals(budget);
  const expenses = rows.reduce((s, r) => s + Math.max(0, r.total[period]), 0);
  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onChange([...budget.categories, { id: crypto.randomUUID(), name: trimmed }]);
    setName("");
  };
  const rename = (id: string, value: string) => onChange(budget.categories.map((c) => (c.id === id ? { ...c, name: value } : c)));

  return (
    <Card title="Kategorien">
      <p className="-mt-2 mb-3 text-xs text-zinc-500">
        Fixe und flexible Ausgaben nach Kategorie. Namen kannst du direkt ändern; die Kategorie eines Eintrags wählst du unten.
      </p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {expenses > 0 && (
          <CategoryDonut
            rows={rows}
            period={period}
            active={active}
            onActive={setActive}
            center={{ label: `Ausgaben ${currency}`, value: whole(expenses) }}
          />
        )}
        <ul className="min-w-0 flex-1 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
          {rows.map((r, i) => (
            <li
              key={r.category?.id ?? "none"}
              className={`-mx-1.5 rounded px-1.5 py-1.5 ${active === i ? "bg-zinc-50 dark:bg-zinc-800/60" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryColor(r.category ? i : -1) }} aria-hidden />
                {r.category ? (
                  <input
                    className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-zinc-300 focus:border-zinc-400 dark:hover:border-zinc-700"
                    aria-label="Name der Kategorie"
                    placeholder="Kategorie"
                    value={r.category.name}
                    onChange={(e) => rename(r.category!.id, e.target.value)}
                  />
                ) : (
                  <span className="flex-1 px-1 py-0.5 text-zinc-500 italic">Ohne Kategorie</span>
                )}
                <span className="shrink-0 tabular-nums">{format(r.total[period])}</span>
                <span className="w-12 shrink-0 text-right text-xs text-zinc-500 tabular-nums">
                  {expenses > 0 ? percent(Math.max(0, r.total[period]) / expenses) : "–"}
                </span>
                {r.category ? (
                  <button
                    className="rounded-md px-2 py-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800"
                    aria-label={`Kategorie ${r.category.name || ""} entfernen`}
                    title="Entfernen – die Einträge bleiben, nur ohne Kategorie"
                    onClick={() => onChange(budget.categories.filter((c) => c.id !== r.category!.id))}
                  >
                    ×
                  </button>
                ) : (
                  <span className="w-[1.85rem] shrink-0" aria-hidden />
                )}
              </div>
              {r.fixed[period] !== 0 && r.variable[period] !== 0 && (
                <div className="pl-5.5 text-xs text-zinc-500 tabular-nums">
                  fix {format(r.fixed[period])} · flexibel {format(r.variable[period])}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
      <form
        className="mt-3 flex gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className={inputClass}
          aria-label="Neue Kategorie"
          placeholder="Neue Kategorie, z. B. Hypothek"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className={`${buttonClass} shrink-0`} disabled={!name.trim()}>
          + Kategorie
        </button>
      </form>
    </Card>
  );
}

const HISTORY_COLUMNS = [
  { key: "income", label: "Einkommen", value: (s: BudgetSnapshot) => s.income, more: "better" },
  { key: "expenses", label: "Ausgaben", value: (s: BudgetSnapshot) => s.fixed + s.variable, more: "worse" },
  { key: "invest", label: "Investieren", value: (s: BudgetSnapshot) => s.invest, more: "better" },
  { key: "free", label: "Frei", value: snapshotFree, more: "better" },
] as const;

/** A change against the year before, green when it is good for the budget and red when it is not. */
function Change({ value, worse, format }: { value: number; worse?: boolean; format: (v: number) => string }) {
  if (Math.abs(value) < 0.005) return <span className="text-zinc-500">±0</span>;
  return (
    <span className={pnlClass(worse ? -value : value)}>
      {value > 0 ? "+" : "−"}
      {format(Math.abs(value))}
    </span>
  );
}

/** Each category's total now next to the one in `previous`, matched by id so renamed categories still line up. */
function categoryChanges(current: BudgetSnapshot, previous: BudgetSnapshot) {
  const key = (c: BudgetSnapshot["categories"][number]) => c.id ?? `name:${c.name}`;
  const before = new Map(previous.categories.map((c) => [key(c), c]));
  const rows = current.categories.map((c) => ({ name: c.name, now: c.total, before: before.get(key(c))?.total ?? 0 }));
  const seen = new Set(current.categories.map(key));
  for (const c of previous.categories) if (!seen.has(key(c))) rows.push({ name: c.name, now: 0, before: c.total });
  return rows.filter((r) => r.now !== 0 || r.before !== 0);
}

/**
 * The budget's totals as saved at the end of earlier years, next to the current ones, so you can see
 * what has gone up or down. Saving again in the same year replaces that year's state.
 */
function HistoryCard({
  budget,
  period,
  format,
  onChange,
}: {
  budget: Budget;
  period: Period;
  format: (v: number) => string;
  onChange: (history: BudgetSnapshot[]) => void;
}) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const history = budget.history;
  const current = snapshotBudget(budget, thisYear, "");
  const per = (v: number) => (period === "month" ? v / 12 : v);
  const exists = history.some((h) => h.year === year);
  const save = () => {
    if (exists && !confirm(`Den gespeicherten Stand ${year} mit den aktuellen Zahlen ersetzen?`)) return;
    onChange(withSnapshot(history, snapshotBudget(budget, year, new Date().toISOString().slice(0, 10))));
  };
  const rows = [...history.map((h) => ({ label: String(h.year), snapshot: h })), { label: "Aktuell", snapshot: current }];
  const last = history.at(-1);
  const changes = last ? categoryChanges(current, last) : [];

  return (
    <Card title="Verlauf">
      <p className="-mt-2 mb-3 text-xs text-zinc-500">
        Speichere jedes Jahr den Stand, um zu sehen, wie sich Einkommen, Ausgaben und Kategorien verändern.
      </p>
      {history.length > 0 && (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-md text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-zinc-500">
                <th className="px-1 py-1 text-left font-normal">Jahr</th>
                {HISTORY_COLUMNS.map((c) => (
                  <th key={c.key} className="px-1 py-1 text-right font-normal">
                    {c.label}
                  </th>
                ))}
                <th className="w-8" aria-hidden />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((r, i) => {
                const prev = rows[i - 1]?.snapshot;
                const live = r.snapshot === current;
                return (
                  <tr key={r.label} className={live ? "font-medium" : ""}>
                    <td className="px-1 py-1.5 align-top" title={live ? undefined : `Gespeichert am ${r.snapshot.savedAt}`}>
                      {r.label}
                    </td>
                    {HISTORY_COLUMNS.map((c) => (
                      <td key={c.key} className="px-1 py-1.5 text-right align-top">
                        <div>{format(per(c.value(r.snapshot)))}</div>
                        {prev && (
                          <div className="text-xs font-normal">
                            <Change value={per(c.value(r.snapshot) - c.value(prev))} worse={c.more === "worse"} format={format} />
                          </div>
                        )}
                      </td>
                    ))}
                    <td className="px-1 py-1.5 text-right align-top">
                      {!live && (
                        <button
                          className="rounded-md px-2 py-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800"
                          aria-label={`Stand ${r.label} löschen`}
                          onClick={() =>
                            confirm(`Den gespeicherten Stand ${r.label} löschen?`) && onChange(history.filter((h) => h !== r.snapshot))
                          }
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {last && changes.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">Kategorien gegenüber {last.year}</h3>
          <ul className="divide-y divide-zinc-100 text-sm tabular-nums dark:divide-zinc-800">
            {changes.map((c, i) => (
              <li key={i} className="flex items-center gap-2 py-1">
                <span className="min-w-0 flex-1 truncate">{c.name || "Kategorie"}</span>
                <span className="hidden text-xs text-zinc-500 sm:inline">{format(per(c.before))} →</span>
                <span>{format(per(c.now))}</span>
                <span className="w-24 text-right text-xs">
                  <Change value={per(c.now - c.before)} worse format={format} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={`flex flex-wrap items-center gap-2 ${history.length > 0 ? "mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800" : ""}`}>
        <select className={`${inputClass} w-auto`} aria-label="Jahr" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[thisYear, thisYear - 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button className={buttonClass} onClick={save}>
          {exists ? `Stand ${year} aktualisieren` : `Stand ${year} speichern`}
        </button>
        {history.length === 0 && <span className="text-xs text-zinc-500">Noch kein Jahr gespeichert.</span>}
      </div>
    </Card>
  );
}

function parseAmount(text: string): number {
  const n = Number(text.replace(/['’\s]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** The items of an expense section in groups, one per category that has any, and those without a category last. */
function groupByCategory(items: BudgetItem[], categories: Category[]) {
  const known = new Set(categories.map((c) => c.id));
  const groups = categories.map((category) => ({ category, items: items.filter((i) => i.category === category.id) }));
  return [...groups, { category: undefined, items: items.filter((i) => !i.category || !known.has(i.category)) }].filter(
    (g) => g.items.length > 0,
  );
}

function ItemsCard({
  section,
  items,
  categories,
  period,
  format,
  onChange,
}: {
  section: Section;
  items: BudgetItem[];
  /** Given for expense sections: each item can then be put into one of these. */
  categories?: Category[];
  period: Period;
  format: (v: number) => string;
  onChange: (items: BudgetItem[]) => void;
}) {
  const info = SECTION_INFO[section];
  const total = sum(items)[period];
  const update = (id: string, patch: Partial<BudgetItem>) => onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const sortByAmount = () => onChange([...items].sort((a, b) => amounts(b).year - amounts(a).year));
  const grouped = categories !== undefined && categories.length > 0;
  const groups = grouped ? groupByCategory(items, categories) : [{ category: undefined, items }];
  const row = (item: BudgetItem) => (
    <ItemRow
      key={item.id}
      item={item}
      section={section}
      categories={grouped ? categories : undefined}
      period={period}
      format={format}
      onChange={(patch) => update(item.id, patch)}
      onRemove={() => onChange(items.filter((i) => i.id !== item.id))}
    />
  );

  return (
    <Card
      title={info.title}
      action={
        items.length > 1 ? (
          <button className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" onClick={sortByAmount}>
            Nach Betrag sortieren
          </button>
        ) : undefined
      }
    >
      <p className="-mt-2 mb-3 text-xs text-zinc-500">{info.hint}</p>
      {grouped ? (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.category?.id ?? "none"}>
              <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                <span className={`font-medium ${g.category ? "text-zinc-600 dark:text-zinc-400" : "text-zinc-500 italic"}`}>
                  {g.category ? g.category.name || "Unbenannte Kategorie" : "Ohne Kategorie"}
                </span>
                <span className="flex items-center gap-2 text-zinc-500 tabular-nums">
                  {format(sum(g.items)[period])}
                  {g.category && (
                    <button
                      className="rounded px-1.5 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                      aria-label={`Eintrag in ${g.category.name} hinzufügen`}
                      title="Eintrag in dieser Kategorie hinzufügen"
                      onClick={() => onChange([...items, newItem(g.category!.id)])}
                    >
                      +
                    </button>
                  )}
                </span>
              </div>
              <ul className="space-y-2">{g.items.map(row)}</ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="space-y-2">{items.map(row)}</ul>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <button className={buttonClass} onClick={() => onChange([...items, newItem()])}>
          + Hinzufügen
        </button>
        <span className="text-sm font-semibold tabular-nums">
          {format(total)} <span className="font-normal text-zinc-500">{period === "month" ? "/ Monat" : "/ Jahr"}</span>
        </span>
      </div>
    </Card>
  );
}

function ItemRow({
  item,
  section,
  categories,
  period,
  format,
  onChange,
  onRemove,
}: {
  item: BudgetItem;
  section: Section;
  categories?: Category[];
  period: Period;
  format: (v: number) => string;
  onChange: (patch: Partial<BudgetItem>) => void;
  onRemove: () => void;
}) {
  const info = SECTION_INFO[section];
  return (
    <li className={`grid grid-cols-[1fr_6.5rem_auto] items-center gap-1.5 ${categories ? "sm:grid-cols-[1fr_8rem_6.5rem_7rem_5.5rem_auto]" : "sm:grid-cols-[1fr_6.5rem_8rem_6rem_auto]"}`}>
      <input
        className={`${inputClass} ${categories ? "" : "col-span-3"} sm:col-span-1`}
        aria-label="Bezeichnung"
        placeholder={info.placeholder}
        value={item.name}
        onChange={(e) => onChange({ name: e.target.value })}
      />
      {categories && (
        <select
          className={`${inputClass} col-span-2 sm:col-span-1`}
          aria-label={`Kategorie ${item.name}`}
          value={item.category ?? ""}
          onChange={(e) => onChange({ category: e.target.value || undefined })}
        >
          <option value="">Ohne Kategorie</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name || "Unbenannte Kategorie"}
            </option>
          ))}
        </select>
      )}
      <input
        className={`${inputClass} text-right tabular-nums`}
        aria-label={`Betrag ${item.name}`}
        inputMode="decimal"
        defaultValue={item.amount || ""}
        placeholder="0"
        onChange={(e) => onChange({ amount: parseAmount(e.target.value) })}
      />
      <select
        className={inputClass}
        aria-label={`Intervall ${item.name}`}
        value={item.interval}
        onChange={(e) => onChange({ interval: e.target.value as Interval })}
      >
        {INTERVALS.filter((x) => section === "income" || x.value !== "month13").map((x) => (
          <option key={x.value} value={x.value}>
            {x.label}
          </option>
        ))}
      </select>
      <span
        className="hidden text-right text-xs text-zinc-500 tabular-nums sm:block"
        title={period === "month" ? "pro Monat" : "pro Jahr"}
      >
        {format(amounts(item)[period])}
      </span>
      <button
        className="rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800"
        aria-label={`${item.name || "Eintrag"} entfernen`}
        onClick={onRemove}
      >
        ×
      </button>
    </li>
  );
}
