import { formatMoney } from "@/lib/currency";
import { sortTransactions } from "@/lib/portfolio";
import type { Quote, Transaction } from "@/lib/types";
import { Card } from "./ui";

const TYPE_STYLE = {
  buy: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  sell: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  dividend: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
};

export function TransactionList({
  transactions,
  quotes,
  onDelete,
}: {
  transactions: Transaction[];
  quotes: Record<string, Quote>;
  onDelete: (id: string) => void;
}) {
  const rows = sortTransactions(transactions).reverse();
  return (
    <Card title={`Transactions (${transactions.length})`}>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No transactions yet.</p>
      ) : (
        <ul className="max-h-96 divide-y divide-zinc-100 overflow-auto text-sm dark:divide-zinc-800">
          {rows.map((t) => {
            const currency = quotes[t.symbol]?.currency ?? "USD";
            const total = t.type === "dividend" ? t.price : t.quantity * t.price;
            return (
              <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${TYPE_STYLE[t.type]}`}>{t.type}</span>
                    <span className="font-medium">{t.symbol}</span>
                  </div>
                  <div className="text-xs tabular-nums text-zinc-500">
                    {t.date}
                    {t.type !== "dividend" && ` · ${t.quantity} × ${formatMoney(t.price, currency)}`}
                    {t.fees > 0 && ` · ${t.type === "dividend" ? "tax" : "fees"} ${formatMoney(t.fees, currency)}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums">{formatMoney(total, currency)}</span>
                  <button
                    onClick={() => confirm(`Delete this ${t.type} of ${t.symbol}?`) && onDelete(t.id)}
                    className="rounded px-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800"
                    aria-label="Delete transaction"
                  >
                    ×
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
