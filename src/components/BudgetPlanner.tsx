"use client";

import { useEffect, useRef, useState } from "react";
import {
  type Amounts,
  amounts,
  type Budget,
  type BudgetItem,
  INTERVALS,
  type Interval,
  type Section,
  SECTIONS,
  sum,
  summarizeBudget,
} from "@/lib/budget";
import { formatMoney } from "@/lib/currency";
import { buttonClass, Card, inputClass } from "./ui";

type Period = keyof Amounts;
type SaveState = "saved" | "saving" | "error";

const SECTION_INFO: Record<Section, { title: string; hint: string; color: string; placeholder: string }> = {
  income: { title: "Einnahmen", hint: "Netto, was aufs Konto kommt", color: "var(--series-3)", placeholder: "z. B. Netto Lohn" },
  fixed: { title: "Fixkosten", hint: "Was jeden Monat oder jedes Jahr sicher anfällt", color: "var(--series-2)", placeholder: "z. B. Miete" },
  invest: { title: "Investieren", hint: "Was du regelmässig anlegen willst", color: "var(--series-1)", placeholder: "z. B. Säule 3a" },
};

const percent = (v: number) => `${(v * 100).toFixed(1)}%`;

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

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Finanzübersicht</h1>
          <p className="text-sm text-zinc-500">Was reinkommt, was fix weggeht und wie viel davon du investierst.</p>
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
        <Stat label="Einkommen" value={m(summary.income[period])} sub={period === "month" ? "ohne 13. Monatslohn" : "inkl. 13. Monatslohn"} />
        <Stat label="Fixkosten" value={m(summary.fixed[period])} sub={`${share(summary.fixed[period])} vom Einkommen`} />
        <Stat label="Investieren" value={m(summary.invest[period])} sub={`Sparquote ${share(summary.invest[period])}`} />
        <Stat
          label="Frei verfügbar"
          value={m(summary.free[period])}
          sub={`nach Fixkosten ${m(summary.available[period])}`}
          negative={summary.free[period] < 0}
        />
      </div>

      <Split summary={summary} period={period} format={m} />

      {SECTIONS.map((section) => (
        <ItemsCard
          key={section}
          section={section}
          items={budget[section]}
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

/** Where the income goes: one bar split into fixed costs, investments and what's left. */
function Split({ summary, period, format }: { summary: ReturnType<typeof summarizeBudget>; period: Period; format: (v: number) => string }) {
  const income = summary.income[period];
  const parts = [
    { label: "Fixkosten", value: summary.fixed[period], color: SECTION_INFO.fixed.color },
    { label: "Investieren", value: summary.invest[period], color: SECTION_INFO.invest.color },
    { label: "Frei", value: Math.max(0, summary.free[period]), color: "var(--series-other)" },
  ];
  const total = Math.max(income, parts[0].value + parts[1].value);
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
              Fixkosten und Investitionen sind {format(-summary.free[period])} höher als das Einkommen.
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-zinc-500">Trage dein Einkommen ein, um die Aufteilung zu sehen.</p>
      )}
    </Card>
  );
}

function newItem(): BudgetItem {
  return { id: crypto.randomUUID(), name: "", amount: 0, interval: "month" };
}

function parseAmount(text: string): number {
  const n = Number(text.replace(/['’\s]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function ItemsCard({
  section,
  items,
  period,
  format,
  onChange,
}: {
  section: Section;
  items: BudgetItem[];
  period: Period;
  format: (v: number) => string;
  onChange: (items: BudgetItem[]) => void;
}) {
  const info = SECTION_INFO[section];
  const total = sum(items)[period];
  const update = (id: string, patch: Partial<BudgetItem>) => onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const sortByAmount = () => onChange([...items].sort((a, b) => amounts(b).year - amounts(a).year));

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
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="grid grid-cols-[1fr_6.5rem_auto] items-center gap-1.5 sm:grid-cols-[1fr_6.5rem_8rem_6rem_auto]">
            <input
              className={`${inputClass} col-span-3 sm:col-span-1`}
              aria-label="Bezeichnung"
              placeholder={info.placeholder}
              value={item.name}
              onChange={(e) => update(item.id, { name: e.target.value })}
            />
            <input
              className={`${inputClass} text-right tabular-nums`}
              aria-label={`Betrag ${item.name}`}
              inputMode="decimal"
              defaultValue={item.amount || ""}
              placeholder="0"
              onChange={(e) => update(item.id, { amount: parseAmount(e.target.value) })}
            />
            <select
              className={inputClass}
              aria-label={`Intervall ${item.name}`}
              value={item.interval}
              onChange={(e) => update(item.id, { interval: e.target.value as Interval })}
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
              onClick={() => onChange(items.filter((i) => i.id !== item.id))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
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
