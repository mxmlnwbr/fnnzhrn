"use client";

import { useMemo, useState } from "react";
import { allocation, ASSET_CLASSES, defaultClass, rebalance, type Slice } from "@/lib/allocation";
import { formatMoney } from "@/lib/currency";
import { useDiscreet } from "@/lib/discreet";
import type { Holding, Quote } from "@/lib/types";
import { buttonClass, Card, inputClass } from "./ui";

const CLASS_COLORS: Record<string, string> = {
  Stocks: "bg-sky-500",
  Bonds: "bg-emerald-500",
  "Real estate": "bg-amber-500",
  Commodities: "bg-violet-500",
  Crypto: "bg-rose-500",
  Cash: "bg-teal-400",
  Other: "bg-zinc-400",
};
const PALETTE = ["bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-violet-500", "bg-rose-500", "bg-teal-400", "bg-zinc-400"];

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function Tabs<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={v === value}
          className={`rounded px-2 py-0.5 text-xs ${
            v === value ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SplitBar({ slices, color }: { slices: Slice[]; color: (key: string, i: number) => string }) {
  return (
    <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
      {slices
        .filter((s) => s.value > 0)
        .map((s, i) => (
          <div key={s.key} className={color(s.key, i)} style={{ width: `${s.share * 100}%` }} title={`${s.key} ${pct(s.share)}`} />
        ))}
    </div>
  );
}

export function AllocationCard({
  holdings,
  quotes,
  cashByCurrency,
  currency,
  categories,
  targets,
  onCategoriesChange,
  onTargetsChange,
}: {
  holdings: Holding[];
  quotes: Record<string, Quote>;
  /** Cash in the base currency, per account currency. */
  cashByCurrency: Record<string, number>;
  currency: string;
  categories: Record<string, string>;
  targets: Record<string, number>;
  onCategoriesChange: (c: Record<string, string>) => void;
  onTargetsChange: (t: Record<string, number>) => void;
}) {
  const discreet = useDiscreet();
  const [tab, setTab] = useState<"allocation" | "rebalance">("allocation");
  const [by, setBy] = useState<"class" | "currency">("class");
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<"full" | "buy">("buy");
  const [newMoney, setNewMoney] = useState("");
  const m = (v: number) => formatMoney(v, currency);

  const classes = useMemo(
    () => allocation(holdings, quotes, cashByCurrency, categories, "class"),
    [holdings, quotes, cashByCurrency, categories],
  );
  const slices = useMemo(
    () => (by === "class" ? classes : allocation(holdings, quotes, cashByCurrency, categories, "currency")),
    [by, classes, holdings, quotes, cashByCurrency, categories],
  );
  const color = (key: string, i: number) => (by === "class" ? CLASS_COLORS[key] ?? "bg-zinc-400" : PALETTE[i % PALETTE.length]);
  const total = classes.reduce((s, c) => s + c.value, 0);

  const money = Number(newMoney) || 0;
  const plan = useMemo(
    () => rebalance(classes, targets, mode === "full" ? { kind: "full" } : { kind: "buy", newMoney: money }),
    [classes, targets, mode, money],
  );
  const targetSum = Object.values(targets).reduce((a, b) => a + b, 0);
  const hasTargets = targetSum > 0;
  const shown = ASSET_CLASSES.filter((c) => classes.some((s) => s.key === c) || (targets[c] ?? 0) > 0);

  function setTarget(cls: string, value: string) {
    const next = { ...targets };
    const n = Number(value);
    if (value.trim() === "" || !Number.isFinite(n) || n <= 0) delete next[cls];
    else next[cls] = Math.min(100, n);
    onTargetsChange(next);
  }

  function setCategory(symbol: string, value: string) {
    const next = { ...categories };
    if (!value) delete next[symbol];
    else next[symbol] = value;
    onCategoriesChange(next);
  }

  if (total <= 0) {
    return (
      <Card title="Allocation">
        <p className="text-sm text-zinc-500">Add positions or cash to see how your money is split.</p>
      </Card>
    );
  }

  return (
    <Card
      title="Allocation"
      action={
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            ["allocation", "Split"],
            ["rebalance", "Rebalance"],
          ]}
        />
      }
    >
      {tab === "allocation" ? (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <Tabs
              value={by}
              onChange={(v) => {
                setBy(v);
                setOpen(null);
              }}
              options={[
                ["class", "By asset class"],
                ["currency", "By currency"],
              ]}
            />
            {!discreet && <span className="text-xs text-zinc-500 tabular-nums">{m(total)}</span>}
          </div>
          <SplitBar slices={slices} color={color} />
          <ul className="mt-3 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
            {slices.map((s, i) => {
              const expandable = s.positions.length > 0;
              const isOpen = open === s.key;
              return (
                <li key={s.key} className="py-2">
                  <button
                    className="flex w-full items-center gap-3 text-left disabled:cursor-default"
                    onClick={() => setOpen(isOpen ? null : s.key)}
                    disabled={!expandable}
                    aria-expanded={expandable ? isOpen : undefined}
                  >
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color(s.key, i)}`} />
                    <span className="flex-1 font-medium">
                      {s.key}
                      {expandable && (
                        <span className="ml-1.5 text-xs font-normal text-zinc-500">
                          {s.positions.length} {s.positions.length === 1 ? "position" : "positions"} {isOpen ? "▴" : "▾"}
                        </span>
                      )}
                    </span>
                    {!discreet && <span className="text-xs text-zinc-500 tabular-nums">{m(s.value)}</span>}
                    <span className="w-14 text-right tabular-nums">{pct(s.share)}</span>
                  </button>
                  {isOpen && (
                    <ul className="mt-2 space-y-1.5 pl-5.5">
                      {s.positions.map((p) => (
                        <li key={p.symbol} className="flex items-center gap-2 text-xs">
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-medium">{p.symbol}</span> <span className="text-zinc-500">{p.name}</span>
                          </span>
                          <span className="tabular-nums text-zinc-500">{pct(total ? p.value / total : 0)}</span>
                          {by === "class" && (
                            <select
                              className="rounded border border-zinc-300 bg-white px-1 py-0.5 dark:border-zinc-700 dark:bg-zinc-950"
                              value={categories[p.symbol] ?? ""}
                              onChange={(e) => setCategory(p.symbol, e.target.value)}
                              aria-label={`Asset class of ${p.symbol}`}
                            >
                              <option value="">Auto ({defaultClass(quotes[p.symbol])})</option>
                              {ASSET_CLASSES.filter((c) => c !== "Cash").map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          {by === "class" && <p className="mt-2 text-xs text-zinc-500">Open a class to move a position to another one.</p>}
        </>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Tabs
              value={mode}
              onChange={setMode}
              options={[
                ["buy", "Only buy"],
                ["full", "Full rebalance"],
              ]}
            />
            {mode === "buy" && (
              <label className="flex items-center gap-1.5 text-xs whitespace-nowrap text-zinc-500">
                New money
                <input
                  type="number"
                  min={0}
                  step="any"
                  className={`${inputClass} w-28 py-0.5 text-right tabular-nums`}
                  value={newMoney}
                  onChange={(e) => setNewMoney(e.target.value)}
                  placeholder="0"
                />
                {currency}
              </label>
            )}
          </div>

          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-xs text-zinc-500">
              <tr>
                <th className="py-1.5 font-medium">Asset class</th>
                <th className="py-1.5 text-right font-medium">Now</th>
                <th className="py-1.5 pl-3 text-right font-medium">Target</th>
                <th className="py-1.5 pl-3 text-right font-medium">{mode === "full" ? "Buy / sell" : "Buy"}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((cls) => {
                const row = plan.rows.find((r) => r.key === cls);
                const now = classes.find((c) => c.key === cls)?.share ?? 0;
                const delta = hasTargets ? row?.delta ?? 0 : 0;
                return (
                  <tr key={cls} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1.5">
                      <span className={`mr-2 inline-block h-2 w-2 rounded-full ${CLASS_COLORS[cls]}`} />
                      {cls}
                    </td>
                    <td className="py-1.5 text-right">{pct(now)}</td>
                    <td className="py-1.5 pl-3 text-right">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        className="w-16 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-right dark:border-zinc-700 dark:bg-zinc-950"
                        value={targets[cls] ?? ""}
                        placeholder="–"
                        onChange={(e) => setTarget(cls, e.target.value)}
                        aria-label={`Target for ${cls} in percent`}
                      />
                      <span className="ml-0.5 text-xs text-zinc-500">%</span>
                    </td>
                    <td className={`py-1.5 pl-3 text-right ${delta > 0.5 ? "text-emerald-600 dark:text-emerald-400" : delta < -0.5 ? "text-red-600 dark:text-red-400" : "text-zinc-400"}`}>
                      {Math.abs(delta) < 0.5 ? "–" : discreet ? `${delta > 0 ? "+" : "−"}${pct(Math.abs(delta) / plan.total)}` : `${delta > 0 ? "+" : "−"}${m(Math.abs(delta))}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className={Math.abs(targetSum - 100) < 0.01 || !hasTargets ? "text-zinc-500" : "text-amber-600 dark:text-amber-400"}>
              Targets add up to {+targetSum.toFixed(2)}%{hasTargets && Math.abs(targetSum - 100) >= 0.01 && " (should be 100%)"}
            </span>
            <span className="flex gap-2">
              <button
                className={`${buttonClass} py-0.5 text-xs`}
                onClick={() =>
                  onTargetsChange(Object.fromEntries(classes.filter((c) => c.share > 0).map((c) => [c.key, Math.round(c.share * 1000) / 10])))
                }
              >
                Use current split
              </button>
              {hasTargets && (
                <button className={`${buttonClass} py-0.5 text-xs`} onClick={() => onTargetsChange({})}>
                  Clear
                </button>
              )}
            </span>
          </div>

          {hasTargets && (
            <div className="mt-4">
              <h3 className="mb-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">Suggested trades</h3>
              {mode === "buy" && money <= 0 ? (
                <p className="text-xs text-zinc-500">Enter how much new money you want to invest.</p>
              ) : plan.trades.filter((t) => Math.abs(t.amount) >= 1).length === 0 && plan.unplaced.length === 0 ? (
                <p className="text-xs text-zinc-500">You&apos;re on target. Nothing to do.</p>
              ) : (
                <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                  {plan.trades
                    .filter((t) => Math.abs(t.amount) >= 1)
                    .map((t) => (
                      <li key={t.symbol} className="flex items-center gap-2 py-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                            t.amount > 0
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                              : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                          }`}
                        >
                          {t.amount > 0 ? "Buy" : "Sell"}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium">{t.symbol}</span> <span className="text-xs text-zinc-500">{t.name}</span>
                        </span>
                        <span className="text-right text-xs tabular-nums">
                          {discreet ? (
                            pct(Math.abs(t.amount) / plan.total)
                          ) : (
                            <>
                              {t.shares !== 0 ? `${Math.abs(t.shares).toLocaleString("de-CH")} × ` : "< 1 share · "}
                              <span className="text-zinc-500">≈ {m(Math.abs(t.amount))}</span>
                            </>
                          )}
                        </span>
                      </li>
                    ))}
                  {plan.unplaced.map((u) => (
                    <li key={u.key} className="py-1.5 text-xs text-zinc-500">
                      {discreet ? `Add ${pct(u.amount / plan.total)}` : `Invest ${m(u.amount)}`} in {u.key}: you have no position there yet.
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-zinc-500">
                Money in a class is split over its positions by their current size. Share counts round down; fees and taxes aren&apos;t included.
              </p>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
