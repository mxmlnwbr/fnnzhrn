import { formatMoney, formatPercent } from "@/lib/currency";
import { useDiscreet } from "@/lib/discreet";
import type { PortfolioSummary } from "@/lib/types";
import { pnlClass } from "./ui";

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone !== undefined ? pnlClass(tone) : ""}`}>{value}</div>
      {sub && <div className={`text-xs tabular-nums ${tone !== undefined ? pnlClass(tone) : "text-zinc-500"}`}>{sub}</div>}
    </div>
  );
}

export function SummaryCards({ summary, currency }: { summary: PortfolioSummary; currency: string }) {
  const m = (v: number) => formatMoney(v, currency);
  const discreet = useDiscreet();
  const unrealizedPercent = summary.costBasis ? summary.unrealizedPL / summary.costBasis : undefined;

  if (discreet) {
    const share = (v: number) => `${summary.netWorth ? ((v / summary.netWorth) * 100).toFixed(1) : "0.0"}%`;
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Allocation" value={`${share(summary.marketValue)} shares`} sub={`${share(summary.cash)} cash`} />
        <Stat label="Today" value={formatPercent(summary.dayChangePercent)} tone={summary.dayChange} />
        <Stat
          label="Unrealized P/L"
          value={unrealizedPercent !== undefined ? formatPercent(unrealizedPercent) : "–"}
          tone={summary.unrealizedPL}
        />
        <Stat label="Total return" value={formatPercent(summary.totalReturnPercent)} tone={summary.totalReturn} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        label="Net worth"
        value={m(summary.netWorth)}
        sub={`Shares ${m(summary.marketValue)} · Cash ${m(summary.cash)}`}
      />
      <Stat
        label="Today"
        value={m(summary.dayChange)}
        sub={formatPercent(summary.dayChangePercent)}
        tone={summary.dayChange}
      />
      <Stat
        label="Unrealized P/L"
        value={m(summary.unrealizedPL)}
        sub={unrealizedPercent !== undefined ? formatPercent(unrealizedPercent) : undefined}
        tone={summary.unrealizedPL}
      />
      <Stat
        label="Total return"
        value={m(summary.totalReturn)}
        sub={`${formatPercent(summary.totalReturnPercent)} · realized ${m(summary.realizedPL)} · dividends ${m(summary.dividends)}`}
        tone={summary.totalReturn}
      />
    </div>
  );
}
