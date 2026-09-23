"use client";

import { useMemo, useRef, useState } from "react";
import { HoldingsTable } from "@/components/HoldingsTable";
import { PerformanceChart } from "@/components/PerformanceChart";
import { SummaryCards } from "@/components/SummaryCards";
import { TransactionForm } from "@/components/TransactionForm";
import { TransactionList } from "@/components/TransactionList";
import { buttonClass } from "@/components/ui";
import { BASE_CURRENCIES } from "@/lib/currency";
import { buildHistory, summarize } from "@/lib/portfolio";
import { parseImport, savePortfolio, usePortfolio } from "@/lib/storage";
import type { Transaction } from "@/lib/types";
import { useMarketData } from "@/lib/useMarketData";

export default function Home() {
  const portfolio = usePortfolio();
  const { transactions, settings } = portfolio;
  const base = settings.baseCurrency;
  const [refreshKey, setRefreshKey] = useState(0);
  const market = useMarketData(transactions, base, refreshKey);
  const fileInput = useRef<HTMLInputElement>(null);

  const summary = useMemo(() => summarize(transactions, market.quotes, market.fx), [transactions, market.quotes, market.fx]);
  const history = useMemo(() => {
    const currencies = Object.fromEntries(Object.values(market.quotes).map((q) => [q.symbol, q.currency]));
    return buildHistory(transactions, market.prices, currencies, market.fxHistory, base);
  }, [transactions, market.prices, market.quotes, market.fxHistory, base]);

  const setTransactions = (next: Transaction[]) => savePortfolio({ ...portfolio, transactions: next });

  function exportJson() {
    const blob = new Blob([JSON.stringify(portfolio, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `portfolio-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importJson(file: File) {
    try {
      const data = parseImport(await file.text());
      if (transactions.length && !confirm(`Replace your ${transactions.length} transactions with ${data.transactions.length} from the file?`)) return;
      savePortfolio(data);
    } catch (e) {
      alert(`Import failed: ${(e as Error).message}`);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Portfolio</h1>
          <p className="text-xs text-zinc-500">
            {market.loading
              ? "Updating prices…"
              : market.error
                ? `Price update failed: ${market.error}`
                : market.updatedAt
                  ? `Prices from Yahoo Finance · updated ${market.updatedAt.toLocaleTimeString("de-CH")}`
                  : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={buttonClass}
            value={base}
            onChange={(e) => savePortfolio({ ...portfolio, settings: { ...settings, baseCurrency: e.target.value } })}
            aria-label="Base currency"
          >
            {BASE_CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <button className={buttonClass} onClick={() => setRefreshKey((k) => k + 1)} disabled={market.loading}>
            Refresh
          </button>
          <button className={buttonClass} onClick={exportJson}>
            Export
          </button>
          <button className={buttonClass} onClick={() => fileInput.current?.click()}>
            Import
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      <SummaryCards summary={summary} currency={base} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <PerformanceChart history={history} currency={base} loading={market.loading} />
          <HoldingsTable holdings={summary.holdings} currency={base} />
        </div>
        <div className="min-w-0 space-y-4">
          <TransactionForm onAdd={(t) => setTransactions([...transactions, t])} />
          <TransactionList
            transactions={transactions}
            quotes={market.quotes}
            onDelete={(id) => setTransactions(transactions.filter((t) => t.id !== id))}
          />
        </div>
      </div>
    </main>
  );
}
