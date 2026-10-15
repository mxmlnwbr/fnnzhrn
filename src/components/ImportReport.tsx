"use client";

import { useState } from "react";
import { buildPositions } from "@/lib/portfolio";
import type { Quote, Transaction } from "@/lib/types";
import { buttonClass } from "./ui";

/** A security in the import, with the Yahoo ticker it was booked under. */
export interface ImportedSecurity {
  ticker: string;
  symbol: string;
  name?: string;
  isin: string;
  currency: string;
  /** Whether Yahoo confirmed the ticker during import, rather than it being a best guess. */
  verified: boolean;
}

export interface ImportResult {
  file: string;
  format: "Swissquote CSV" | "Yuh CSV" | "JSON";
  at: Date;
  transactions: number;
  cash: number;
  skipped: number;
  unknown: Record<string, { count: number; example: string }>;
  securities: ImportedSecurity[];
  /** Signs that the file doesn't cover everything. */
  warnings?: string[];
  /** The ticker check couldn't reach the server, so every ticker is a guess. */
  resolveFailed: boolean;
}

/** Build the report shows, so a report tells whether an import ran on the latest version. */
const VERSION = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";

function describe(s: ImportedSecurity | undefined, ticker: string) {
  if (!s) return ticker;
  return `${s.symbol}${s.name ? ` ${s.name}` : ""} (${[s.isin, s.currency].filter(Boolean).join(", ")}) – tried ${ticker}${s.verified ? "" : ", unverified"}`;
}

export function ImportReport({
  result,
  transactions,
  quotes,
  loading,
  error,
  onDismiss,
}: {
  result: ImportResult;
  transactions: Transaction[];
  quotes: Record<string, Quote>;
  loading: boolean;
  error: string | null;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const held = [...buildPositions(transactions)].filter(([, p]) => p.quantity > 1e-9).map(([s]) => s);
  const bySymbol = new Map(result.securities.map((s) => [s.ticker, s]));
  const unpriced = loading ? [] : held.filter((s) => !(quotes[s]?.price > 0));
  const unknown = Object.entries(result.unknown);

  const issues: string[] = [];
  issues.push(...(result.warnings ?? []));
  if (result.resolveFailed) issues.push("Couldn't verify tickers with Yahoo during import; tickers are best guesses.");
  if (!loading && error) issues.push(`Price update failed: ${error}`);
  for (const [type, u] of unknown) issues.push(`Row type "${type}" isn't supported yet (${u.count}×), so those rows were not imported.`);
  for (const s of unpriced) issues.push(`No price for ${describe(bySymbol.get(s), s)}; it counts as 0.`);

  const status = loading ? "checking" : issues.length ? "issues" : "ok";
  const tone = {
    checking: "border-zinc-200 dark:border-zinc-800",
    ok: "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40",
    issues: "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
  }[status];

  function report() {
    const lines = [
      "Depot import report",
      `App version: ${VERSION}`,
      `Imported: ${result.at.toISOString().slice(0, 16).replace("T", " ")} UTC`,
      `File: ${result.file} (${result.format})`,
      `Transactions: ${result.transactions}, cash accounts: ${result.cash}, rows skipped: ${result.skipped}`,
      `Open positions: ${held.length}, without price: ${unpriced.length}`,
      "",
      issues.length ? "Issues:" : "No issues.",
      ...issues.map((i) => `- ${i}`),
    ];
    if (unknown.length) {
      lines.push("", "Example rows of unsupported types:");
      for (const [type, u] of unknown) lines.push(`${type}: ${u.example}`);
    }
    return lines.join("\n");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(report());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Copy the report:", report());
    }
  }

  return (
    <section className={`animate-fade-in rounded-xl border bg-white p-4 text-sm dark:bg-zinc-900 ${tone}`} role="status">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">
            {status === "checking" && "Import done · checking prices…"}
            {status === "ok" && "✓ Import complete, everything checks out"}
            {status === "issues" && `⚠ Import finished with ${issues.length} ${issues.length === 1 ? "issue" : "issues"}`}
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {result.file} · {result.transactions} transactions · {result.cash} cash accounts · {held.length} open positions
            {!loading && `, ${held.length - unpriced.length} priced`}
          </p>
        </div>
        <div className="flex gap-2">
          <button className={`${buttonClass} text-xs`} onClick={() => void copy()} disabled={loading}>
            {copied ? "Copied" : "Copy report"}
          </button>
          <button className={`${buttonClass} text-xs`} onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
      {result.format === "Yuh CSV" && (
        <p className="mt-2 text-xs text-zinc-500">Yuh exports don&apos;t include balances, so add your Yuh cash under Cash by hand.</p>
      )}
      {status === "issues" && (
        <>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-zinc-700 dark:text-zinc-300">
            {issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-zinc-500">Copy the report and send it along to get these fixed.</p>
        </>
      )}
    </section>
  );
}
