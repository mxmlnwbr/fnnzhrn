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
  return `${s.symbol}${s.name ? ` ${s.name}` : ""} (${[s.isin, s.currency].filter(Boolean).join(", ")}) – versucht: ${ticker}${s.verified ? "" : ", ungeprüft"}`;
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
  if (result.resolveFailed) issues.push("Die Ticker konnten beim Import nicht bei Yahoo geprüft werden; sie sind bestmöglich geraten.");
  if (!loading && error) issues.push(`Kurse konnten nicht aktualisiert werden: ${error}`);
  for (const [type, u] of unknown) issues.push(`Zeilenart «${type}» wird noch nicht unterstützt (${u.count}×), diese Zeilen wurden nicht importiert.`);
  for (const s of unpriced) issues.push(`Kein Kurs für ${describe(bySymbol.get(s), s)}; zählt als 0.`);

  const status = loading ? "checking" : issues.length ? "issues" : "ok";
  const tone = {
    checking: "border-zinc-200 dark:border-zinc-800",
    ok: "border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40",
    issues: "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
  }[status];

  function report() {
    const lines = [
      "Depot-Importbericht",
      `App-Version: ${VERSION}`,
      `Importiert: ${result.at.toISOString().slice(0, 16).replace("T", " ")} UTC`,
      `Datei: ${result.file} (${result.format})`,
      `Transaktionen: ${result.transactions}, Konten: ${result.cash}, übersprungene Zeilen: ${result.skipped}`,
      `Offene Positionen: ${held.length}, ohne Kurs: ${unpriced.length}`,
      "",
      issues.length ? "Probleme:" : "Keine Probleme.",
      ...issues.map((i) => `- ${i}`),
    ];
    if (unknown.length) {
      lines.push("", "Beispielzeilen nicht unterstützter Arten:");
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
      prompt("Bericht kopieren:", report());
    }
  }

  return (
    <section className={`animate-fade-in rounded-xl border bg-white p-4 text-sm dark:bg-zinc-900 ${tone}`} role="status">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">
            {status === "checking" && "Import fertig · Kurse werden geprüft …"}
            {status === "ok" && "✓ Import abgeschlossen, alles in Ordnung"}
            {status === "issues" && `⚠ Import abgeschlossen mit ${issues.length} ${issues.length === 1 ? "Problem" : "Problemen"}`}
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {result.file} · {result.transactions} Transaktionen · {result.cash} Konten · {held.length} offene Positionen
            {!loading && `, ${held.length - unpriced.length} mit Kurs`}
          </p>
        </div>
        <div className="flex gap-2">
          <button className={`${buttonClass} text-xs`} onClick={() => void copy()} disabled={loading}>
            {copied ? "Kopiert" : "Bericht kopieren"}
          </button>
          <button className={`${buttonClass} text-xs`} onClick={onDismiss}>
            Schliessen
          </button>
        </div>
      </div>
      {result.format === "Yuh CSV" && (
        <p className="mt-2 text-xs text-zinc-500">Yuh-Exporte enthalten keine Saldi. Erfasse dein Yuh-Guthaben deshalb unter Konten von Hand.</p>
      )}
      {status === "issues" && (
        <>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-zinc-700 dark:text-zinc-300">
            {issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-zinc-500">Kopiere den Bericht und schick ihn weiter, damit diese Probleme behoben werden.</p>
        </>
      )}
    </section>
  );
}
