"use client";

import { useMemo, useRef, useState } from "react";
import { AccountMenu } from "@/components/AccountMenu";
import { CashAccounts } from "@/components/CashAccounts";
import { HoldingsTable } from "@/components/HoldingsTable";
import { type ImportResult, ImportReport } from "@/components/ImportReport";
import { DividendCard, FeeCard } from "@/components/IncomeCards";
import { RefreshIcon, SplashLoader, TopProgress } from "@/components/Loading";
import { PerformanceChart } from "@/components/PerformanceChart";
import { SummaryCards } from "@/components/SummaryCards";
import { TransactionForm } from "@/components/TransactionForm";
import { TransactionList } from "@/components/TransactionList";
import { buttonClass } from "@/components/ui";
import { BASE_CURRENCIES } from "@/lib/currency";
import { setDiscreet, useDiscreet } from "@/lib/discreet";
import { buildHistory, incomeOverview, summarize } from "@/lib/portfolio";
import { parseImport, savePortfolio, usePortfolio } from "@/lib/storage";
import {
  decodeText,
  isImported,
  isImportedCash,
  isSwissquoteCsv,
  parseSwissquoteCsv,
  swissquoteListings,
  tickerCandidates,
} from "@/lib/swissquote";
import type { CashAccount, Transaction } from "@/lib/types";
import { useMarketData } from "@/lib/useMarketData";

/** Verified Yahoo tickers for imported securities; the import falls back to its own guess without them. */
async function resolveTickers(listings: ReturnType<typeof swissquoteListings>): Promise<Record<string, string> | null> {
  try {
    const res = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(listings),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const portfolio = usePortfolio();
  const { transactions, cash, settings } = portfolio;
  const base = settings.baseCurrency;
  const [refreshKey, setRefreshKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const market = useMarketData(transactions, cash, base, refreshKey);
  const fileInput = useRef<HTMLInputElement>(null);
  const discreet = useDiscreet();

  const summary = useMemo(
    () => summarize(transactions, market.quotes, market.fx, cash),
    [transactions, market.quotes, market.fx, cash],
  );
  const income = useMemo(
    () => incomeOverview(transactions, market.quotes, market.fx),
    [transactions, market.quotes, market.fx],
  );
  const history = useMemo(() => {
    const currencies = Object.fromEntries(Object.values(market.quotes).map((q) => [q.symbol, q.currency]));
    return buildHistory(transactions, market.prices, currencies, market.fxHistory, base);
  }, [transactions, market.prices, market.quotes, market.fxHistory, base]);

  const setTransactions = (next: Transaction[]) => savePortfolio({ ...portfolio, transactions: next });
  const setCash = (next: CashAccount[]) => savePortfolio({ ...portfolio, cash: next });

  function exportJson() {
    const blob = new Blob([JSON.stringify(portfolio, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `portfolio-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importFile(file: File) {
    try {
      const text = decodeText(await file.arrayBuffer());
      let data;
      let result: ImportResult;
      if (isSwissquoteCsv(text)) {
        const listings = swissquoteListings(text);
        const tickers = await resolveTickers(listings);
        const parsed = parseSwissquoteCsv(text, tickers ?? {});
        // The import's balances replace earlier imported ones; accounts added by hand stay.
        data = { ...portfolio, transactions: parsed.transactions, cash: [...cash.filter((a) => !isImportedCash(a)), ...parsed.cash] };
        result = {
          file: file.name,
          format: "Swissquote CSV",
          at: new Date(),
          transactions: parsed.transactions.length,
          cash: parsed.cash.length,
          skipped: Object.values(parsed.skipped).reduce((a, b) => a + b, 0),
          unknown: parsed.unknown,
          securities: listings.map((l) => {
            const key = l.isin || l.symbol;
            return { ...l, ticker: tickers?.[key] ?? tickerCandidates(l)[0], verified: Boolean(tickers?.[key]) };
          }),
          resolveFailed: tickers === null,
        };
      } else {
        data = parseImport(text);
        result = {
          file: file.name,
          format: "JSON",
          at: new Date(),
          transactions: data.transactions.length,
          cash: data.cash.length,
          skipped: 0,
          unknown: {},
          securities: [],
          resolveFailed: false,
        };
      }
      if (transactions.length && !confirm(`Replace your ${transactions.length} transactions with ${data.transactions.length} from the file?`)) return;
      savePortfolio(data);
      setImportResult(result);
    } catch (e) {
      alert(`Import failed: ${(e as Error).message}`);
    }
  }

  // Until the first prices arrive every figure would read 0, so show the splash instead.
  if (market.loading && !market.updatedAt) {
    return (
      <main className="flex flex-1">
        <SplashLoader />
      </main>
    );
  }

  const discreetButton = (
    <button
      className={`${buttonClass} px-2`}
      onClick={() => setDiscreet(!discreet)}
      aria-pressed={discreet}
      aria-label={discreet ? "Show amounts" : "Hide amounts"}
      title={discreet ? "Show amounts" : "Hide amounts, show percentages only"}
    >
      <EyeIcon off={discreet} />
    </button>
  );
  const currencySelect = (
    <select
      className={buttonClass}
      value={base}
      onChange={(e) => {
        savePortfolio({ ...portfolio, settings: { ...settings, baseCurrency: e.target.value } });
        setMenuOpen(false);
      }}
      aria-label="Base currency"
    >
      {BASE_CURRENCIES.map((c) => (
        <option key={c}>{c}</option>
      ))}
    </select>
  );
  const refreshButton = (
    <button
      className={`${buttonClass} inline-flex items-center gap-1.5`}
      onClick={() => {
        setRefreshKey((k) => k + 1);
        setMenuOpen(false);
      }}
      disabled={market.loading}
    >
      <RefreshIcon spinning={market.loading} />
      Refresh
    </button>
  );
  const exportButton = (
    <button
      className={`${buttonClass} inline-flex`}
      onClick={() => {
        exportJson();
        setMenuOpen(false);
      }}
    >
      Export
    </button>
  );
  const importButton = (
    <button
      className={`${buttonClass} inline-flex`}
      onClick={() => {
        fileInput.current?.click();
        setMenuOpen(false);
      }}
    >
      Import
    </button>
  );

  return (
    <main className="animate-fade-in mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 py-6">
      <TopProgress active={market.loading} />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">Depot</h1>
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
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          <AccountMenu />
          {discreetButton}
          {currencySelect}
          {refreshButton}
          {exportButton}
          {importButton}
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:hidden">
          {discreetButton}
          <button
            className={`${buttonClass} px-2`}
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            <MenuIcon open={menuOpen} />
          </button>
        </div>
        {menuOpen && (
          <nav
            id="mobile-menu"
            className="animate-fade-in basis-full space-y-3 rounded-xl border border-zinc-200 bg-white p-3 sm:hidden dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-zinc-500">Base currency</span>
              {currencySelect}
            </div>
            <div className="grid grid-cols-3 gap-2 [&>button]:justify-center">
              {refreshButton}
              {exportButton}
              {importButton}
            </div>
            {/* Its popover opens to the right, so keep it on the left edge. */}
            <div className="empty:hidden">
              <AccountMenu />
            </div>
          </nav>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json,text/csv,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importFile(f);
            e.target.value = "";
          }}
        />
      </header>

      {importResult && (
        <ImportReport
          result={importResult}
          transactions={transactions}
          quotes={market.quotes}
          loading={market.loading}
          error={market.error}
          onDismiss={() => setImportResult(null)}
        />
      )}

      <SummaryCards summary={summary} currency={base} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <PerformanceChart history={history} currency={base} loading={market.loading} />
          <HoldingsTable holdings={summary.holdings} currency={base} />
          <div className="grid gap-4 md:grid-cols-2">
            <DividendCard overview={income} quotes={market.quotes} currency={base} />
            <FeeCard overview={income} quotes={market.quotes} currency={base} />
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          <CashAccounts accounts={cash} fx={market.fx} currency={base} onChange={setCash} />
          <TransactionForm onAdd={(t) => setTransactions([...transactions, t])} />
          <TransactionList
            transactions={transactions}
            quotes={market.quotes}
            onDelete={(id) => setTransactions(transactions.filter((t) => t.id !== id))}
            onDeleteImported={() => setTransactions(transactions.filter((t) => !isImported(t)))}
          />
        </div>
      </div>
    </main>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden>
      {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  );
}
