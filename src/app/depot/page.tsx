"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AccountMenu } from "@/components/AccountMenu";
import { CashAccounts } from "@/components/CashAccounts";
import { DepotMenu } from "@/components/DepotMenu";
import { AllocationCard } from "@/components/AllocationCard";
import { useChoice } from "@/components/ChoiceDialog";
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
import { parseImport, savePortfolio, useActiveDepot, useDepots, useSyncState } from "@/lib/storage";
import { ALL_DEPOTS_ID, depotIdOf } from "@/lib/sync";
import {
  decodeText,
  isImported,
  applyImport,
  isImportedCash,
  removeImported,
  isSwissquoteCsv,
  parseSwissquoteCsv,
  swissquoteListings,
  tickerCandidates,
} from "@/lib/swissquote";
import { isYuhCsv, parseYuhCsv, yuhListings } from "@/lib/yuh";
import type { CashAccount, Depot, Transaction } from "@/lib/types";
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
  const sync = useSyncState();
  const depot = useActiveDepot();
  if (sync.status === "loading") {
    return (
      <main className="flex flex-1">
        <SplashLoader />
      </main>
    );
  }
  // The tracker only opens for a signed-in account: everyone else goes to the fnnzhrn sign-in page.
  if (sync.status !== "signed-in") return <GoToLogin />;
  // Switching depots starts the dashboard afresh, so no prices or import report carry over.
  return <Dashboard key={depot.id} depot={depot} />;
}

function GoToLogin() {
  useEffect(() => {
    location.replace("/login?next=/depot");
  }, []);
  return (
    <main className="flex flex-1">
      <SplashLoader />
    </main>
  );
}

function Dashboard({ depot }: { depot: Depot }) {
  const portfolio = depot.data;
  /** All depots added up: shown, but transactions and cash are edited in their own depot. */
  const combined = depot.id === ALL_DEPOTS_ID;
  const depots = useDepots();
  const depotNames = useMemo(() => new Map(depots.map((d) => [d.id, d.name])), [depots]);
  const { transactions, cash, settings } = portfolio;
  const base = settings.baseCurrency;
  const [refreshKey, setRefreshKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** The transaction open in the form; gone once it's deleted (here or on another device). */
  const editing = transactions.find((t) => t.id === editingId);
  const [choiceDialog, ask] = useChoice();
  const importedCount = transactions.filter(isImported).length + cash.filter(isImportedCash).length;
  const manualCount = transactions.length + cash.length - importedCount;
  const describeEntries = (tx: Transaction[], accounts: CashAccount[]) =>
    `${tx.length} ${tx.length === 1 ? "Transaktion" : "Transaktionen"} und ${accounts.length} ${accounts.length === 1 ? "Konto" : "Konten"}`;
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
  const cashByCurrency = useMemo(() => {
    const out: Record<string, number> = {};
    for (const a of cash) out[a.currency] = (out[a.currency] ?? 0) + a.balance * (market.fx[a.currency] ?? 1);
    return out;
  }, [cash, market.fx]);
  const history = useMemo(() => {
    const currencies = Object.fromEntries(Object.values(market.quotes).map((q) => [q.symbol, q.currency]));
    return buildHistory(transactions, market.prices, currencies, market.fxHistory, base);
  }, [transactions, market.prices, market.quotes, market.fxHistory, base]);

  const setTransactions = (next: Transaction[]) => savePortfolio({ ...portfolio, transactions: next });
  const setCash = (next: CashAccount[]) => savePortfolio({ ...portfolio, cash: next });

  async function deleteMany() {
    const manual = removeImported(portfolio);
    const choice = await ask("Daten löschen", "Die Konten werden mitgelöscht. Das lässt sich nicht rückgängig machen, exportiere also am besten vorher.", [
      ...(importedCount && manualCount
        ? [
            {
              value: "imported" as const,
              label: "Nur Importiertes löschen",
              description: `Entfernt alles aus deinem letzten Import. Deine ${describeEntries(manual.transactions, manual.cash)} von Hand bleiben.`,
            },
          ]
        : []),
      {
        value: "all" as const,
        label: "Alles löschen",
        description: `Entfernt alle ${describeEntries(transactions, cash)}.`,
        tone: "danger" as const,
      },
    ]);
    if (!choice) return;
    savePortfolio(choice === "all" ? { ...portfolio, transactions: [], cash: [] } : manual);
    setImportResult(null);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(portfolio, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const slug = depot.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "portfolio";
    a.download = `${slug}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importFile(file: File) {
    try {
      const text = decodeText(await file.arrayBuffer());
      let data;
      let result: ImportResult;
      const bank = isSwissquoteCsv(text)
        ? { name: "Swissquote" as const, listings: swissquoteListings, parse: parseSwissquoteCsv }
        : isYuhCsv(text)
          ? { name: "Yuh" as const, listings: yuhListings, parse: parseYuhCsv }
          : null;
      if (bank) {
        const listings = bank.listings(text);
        const tickers = await resolveTickers(listings);
        const parsed = bank.parse(text, tickers ?? {});
        let mode: "keep" | "all" | null = "keep";
        if (transactions.length || cash.length) {
          const manual = removeImported(portfolio);
          mode = await ask(
            `${bank.name}-Datei importieren`,
            `Die Datei enthält ${describeEntries(parsed.transactions, parsed.cash)}. Was soll mit den bisherigen Daten passieren?`,
            [
              {
                value: "keep" as const,
                label: manualCount ? "Importiertes ersetzen, eigene Einträge behalten" : "Importierte Daten ersetzen",
                description: manualCount
                  ? `Ersetzt deinen letzten Import. Deine ${describeEntries(manual.transactions, manual.cash)} von Hand bleiben.`
                  : `Ersetzt deinen letzten Import (${importedCount} ${importedCount === 1 ? "Eintrag" : "Einträge"}).`,
                tone: "primary",
              },
              ...(manualCount
                ? [
                    {
                      value: "all" as const,
                      label: "Alles ersetzen",
                      description: `Entfernt auch deine ${describeEntries(manual.transactions, manual.cash)} von Hand.`,
                      tone: "danger" as const,
                    },
                  ]
                : []),
            ],
          );
          if (!mode) return;
        }
        data = applyImport(mode === "all" ? { ...portfolio, transactions: [], cash: [] } : portfolio, parsed);
        result = {
          file: file.name,
          format: `${bank.name} CSV`,
          at: new Date(),
          transactions: parsed.transactions.length,
          cash: parsed.cash.length,
          skipped: Object.values(parsed.skipped).reduce((a, b) => a + b, 0),
          unknown: parsed.unknown,
          warnings: parsed.warnings,
          securities: listings.map((l) => {
            const key = l.isin || l.symbol;
            return { ...l, ticker: tickers?.[key] ?? tickerCandidates(l)[0], verified: Boolean(tickers?.[key]) };
          }),
          resolveFailed: tickers === null,
        };
      } else {
        data = parseImport(text);
        // A JSON file is a full backup, so it replaces everything.
        if (
          (transactions.length || cash.length) &&
          !(await ask("Sicherung wiederherstellen", `Die Datei enthält ${describeEntries(data.transactions, data.cash)}.`, [
            {
              value: true,
              label: "Alles ersetzen",
              description: `Entfernt deine bisherigen ${describeEntries(transactions, cash)}, auch die von Hand erfassten.`,
              tone: "danger" as const,
            },
          ]))
        )
          return;
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
      savePortfolio(data);
      setImportResult(result);
    } catch (e) {
      alert(`Import fehlgeschlagen: ${(e as Error).message}`);
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
      aria-label={discreet ? "Beträge zeigen" : "Beträge verbergen"}
      title={discreet ? "Beträge zeigen" : "Beträge verbergen, nur Prozente zeigen"}
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
      aria-label="Basiswährung"
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
      Aktualisieren
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
      Exportieren
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
      Importieren
    </button>
  );

  return (
    <main className="animate-fade-in mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 py-6">
      {choiceDialog}
      <TopProgress active={market.loading} />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <DepotMenu />
          <p className="text-xs text-zinc-500">
            {market.loading
              ? "Kurse werden aktualisiert …"
              : market.error
                ? `Kurse konnten nicht aktualisiert werden: ${market.error}`
                : market.updatedAt
                  ? `Kurse von Yahoo Finance · Stand ${market.updatedAt.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
          </p>
        </div>
        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          {discreetButton}
          {currencySelect}
          {refreshButton}
          {exportButton}
          {!combined && importButton}
          <AccountMenu />
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:hidden">
          {discreetButton}
          <button
            className={`${buttonClass} px-2`}
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Menü schliessen" : "Menü öffnen"}
          >
            <MenuIcon open={menuOpen} />
          </button>
          <AccountMenu />
        </div>
        {menuOpen && (
          <nav
            id="mobile-menu"
            className="animate-fade-in basis-full space-y-3 rounded-xl border border-zinc-200 bg-white p-3 sm:hidden dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-zinc-500">Basiswährung</span>
              {currencySelect}
            </div>
            <div className={`grid ${combined ? "grid-cols-2" : "grid-cols-3"} gap-2 [&>button]:justify-center`}>
              {refreshButton}
              {exportButton}
              {!combined && importButton}
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
          <AllocationCard
            holdings={summary.holdings}
            quotes={market.quotes}
            cashByCurrency={cashByCurrency}
            currency={base}
            categories={settings.categories ?? {}}
            targets={settings.targets ?? {}}
            onCategoriesChange={(categories) => savePortfolio({ ...portfolio, settings: { ...settings, categories } })}
            onTargetsChange={(targets) => savePortfolio({ ...portfolio, settings: { ...settings, targets } })}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <DividendCard overview={income} quotes={market.quotes} currency={base} />
            <FeeCard overview={income} quotes={market.quotes} currency={base} />
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          <CashAccounts accounts={cash} fx={market.fx} currency={base} onChange={combined ? undefined : setCash} />
          {!combined && (
            <TransactionForm
              key={editing?.id ?? "new"}
              currency={base}
              editing={editing}
              onCancel={() => setEditingId(null)}
              onAdd={(t) => {
                setTransactions(editing ? transactions.map((x) => (x.id === t.id ? t : x)) : [...transactions, t]);
                setEditingId(null);
              }}
            />
          )}
          <TransactionList
            transactions={transactions}
            quotes={market.quotes}
            onDelete={combined ? undefined : (id) => setTransactions(transactions.filter((t) => t.id !== id))}
            onEdit={combined ? undefined : (t) => setEditingId(t.id)}
            editingId={editing?.id}
            canDelete={transactions.length + cash.length > 0}
            onDeleteMany={() => void deleteMany()}
            depotOf={combined ? (t) => depotNames.get(depotIdOf(t.id)) : undefined}
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
