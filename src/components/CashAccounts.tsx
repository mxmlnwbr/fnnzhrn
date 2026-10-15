"use client";

import { useState } from "react";
import { BASE_CURRENCIES, formatMoney } from "@/lib/currency";
import { useDiscreet } from "@/lib/discreet";
import { isImportedCash } from "@/lib/swissquote";
import type { CashAccount } from "@/lib/types";
import { buttonClass, Card, inputClass, primaryButtonClass } from "./ui";

const isCurrency = (c: string) => /^[A-Z]{3}$/.test(c);
const isAmount = (s: string) => s.trim() !== "" && Number.isFinite(Number(s));

/** Account colours, used for the dot next to each account and its slice of the split bar. */
const COLORS = ["bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-violet-500", "bg-rose-500", "bg-teal-500"];

function AddForm({ currency, onAdd, onCancel }: { currency: string; onAdd: (a: CashAccount) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [accountCurrency, setAccountCurrency] = useState(currency);
  const [balance, setBalance] = useState("");
  const code = accountCurrency.trim().toUpperCase();
  const valid = name.trim() && isCurrency(code) && isAmount(balance);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onAdd({ id: crypto.randomUUID(), name: name.trim(), currency: code, balance: Number(balance) });
  }

  return (
    <form onSubmit={submit} className="mt-3 grid grid-cols-[1fr_5rem] gap-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950/50">
      <label className="col-span-2 text-xs text-zinc-500">
        Account name
        <input className={`${inputClass} mt-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. UBS savings" autoFocus />
      </label>
      <label className="text-xs text-zinc-500">
        Balance
        <input type="number" step="any" className={`${inputClass} mt-1`} value={balance} onChange={(e) => setBalance(e.target.value)} />
      </label>
      <label className="text-xs text-zinc-500">
        Currency
        <input
          className={`${inputClass} mt-1 uppercase`}
          value={accountCurrency}
          onChange={(e) => setAccountCurrency(e.target.value)}
          list="cash-currencies"
          maxLength={3}
        />
        <datalist id="cash-currencies">
          {BASE_CURRENCIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <div className="col-span-2 flex justify-end gap-2">
        <button type="button" className={buttonClass} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={!valid} className={primaryButtonClass}>
          Add account
        </button>
      </div>
    </form>
  );
}

function AccountRow({
  account,
  color,
  value,
  share,
  currency,
  onUpdate,
  onDelete,
}: {
  account: CashAccount;
  color: string;
  /** Balance in the base currency. */
  value: number;
  share: number;
  currency: string;
  /** Absent when the account can't be edited here. */
  onUpdate?: (balance: number) => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const discreet = useDiscreet();
  const shareText = `${share < 0.001 ? "<0.1" : (share * 100).toFixed(1)}%`;
  const commit = () => {
    if (draft !== null && isAmount(draft)) onUpdate?.(Number(draft));
    setDraft(null);
  };
  const foreign = account.currency !== currency;
  const balance = (
    <>
      <div className={`text-sm font-medium ${account.balance < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
        {formatMoney(account.balance, account.currency)}
      </div>
      {foreign && <div className="text-xs text-zinc-500">≈ {formatMoney(value, currency)}</div>}
    </>
  );

  return (
    <li className="group flex items-center gap-3 py-2.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{account.name}</div>
        <div className="text-xs text-zinc-500">
          {isImportedCash(account) ? "Imported" : "Manual"}
          {!discreet && value > 0 && ` · ${shareText}`}
        </div>
      </div>
      {discreet ? (
        <div className="text-sm font-medium tabular-nums">{value > 0 ? shareText : "–"}</div>
      ) : draft !== null ? (
        <input
          type="number"
          step="any"
          className={`${inputClass} max-w-32 text-right tabular-nums`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setDraft(null);
          }}
          autoFocus
          aria-label={`Balance of ${account.name}`}
        />
      ) : onUpdate ? (
        <button
          className="-mr-1 rounded px-1 text-right tabular-nums hover:bg-zinc-100 dark:hover:bg-zinc-800"
          onClick={() => setDraft(String(account.balance))}
          title="Edit balance"
        >
          {balance}
        </button>
      ) : (
        <div className="text-right tabular-nums">{balance}</div>
      )}
      {onDelete && (
        <button
          className="shrink-0 rounded p-1 text-zinc-400 transition-opacity hover:text-red-600 focus:opacity-100 md:opacity-0 md:group-hover:opacity-100"
          onClick={() => confirm(`Delete the cash account "${account.name}"?`) && onDelete()}
          aria-label={`Delete ${account.name}`}
          title="Delete"
        >
          ✕
        </button>
      )}
    </li>
  );
}

export function CashAccounts({
  accounts,
  fx,
  currency,
  onChange,
}: {
  accounts: CashAccount[];
  /** Current rate, currency -> base. */
  fx: Record<string, number>;
  currency: string;
  /** Absent in the combined view, where accounts are shown but not edited. */
  onChange?: (accounts: CashAccount[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const discreet = useDiscreet();
  const rows = accounts
    .map((account, i) => ({ account, color: COLORS[i % COLORS.length], value: account.balance * (fx[account.currency] ?? 1) }))
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const positive = rows.reduce((s, r) => s + Math.max(0, r.value), 0);

  return (
    <Card
      title="Cash"
      action={
        !adding &&
        onChange && (
          <button className={`${buttonClass} text-xs`} onClick={() => setAdding(true)}>
            + Add account
          </button>
        )
      }
    >
      {accounts.length === 0 ? (
        !adding && (
          <p className="text-sm text-zinc-500">
            {onChange
              ? "No cash accounts yet. Add your bank and broker balances, or import a Swissquote CSV to fill them in."
              : "No cash accounts in any depot."}
          </p>
        )
      ) : (
        <>
          {!discreet && <div className="text-2xl font-semibold tabular-nums">{formatMoney(total, currency)}</div>}
          <div className="text-xs text-zinc-500">
            {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
            {discreet ? " · share of positive balances" : onChange ? " · click a balance to edit it" : ""}
          </div>
          {rows.length > 1 && positive > 0 && (
            <div className="mt-3 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
              {rows
                .filter((r) => r.value > 0)
                .map((r) => (
                  <div key={r.account.id} className={r.color} style={{ width: `${(r.value / positive) * 100}%` }} />
                ))}
            </div>
          )}
          <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((r) => (
              <AccountRow
                key={r.account.id}
                account={r.account}
                color={r.color}
                value={r.value}
                share={positive ? Math.max(0, r.value) / positive : 0}
                currency={currency}
                onUpdate={onChange && ((balance) => onChange(accounts.map((a) => (a.id === r.account.id ? { ...a, balance } : a))))}
                onDelete={onChange && (() => onChange(accounts.filter((a) => a.id !== r.account.id)))}
              />
            ))}
          </ul>
        </>
      )}
      {adding && onChange && (
        <AddForm
          currency={currency}
          onAdd={(a) => {
            onChange([...accounts, a]);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </Card>
  );
}
