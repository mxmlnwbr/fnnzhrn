"use client";

import { useState } from "react";
import { BASE_CURRENCIES, formatMoney } from "@/lib/currency";
import type { CashAccount } from "@/lib/types";
import { Card, inputClass, primaryButtonClass } from "./ui";

const isCurrency = (c: string) => /^[A-Z]{3}$/.test(c);

function BalanceInput({ account, onChange }: { account: CashAccount; onChange: (balance: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft.trim() !== "" && Number.isFinite(Number(draft))) onChange(Number(draft));
    setDraft(null);
  };
  return (
    <input
      type="number"
      step="any"
      className={`${inputClass} text-right tabular-nums`}
      value={draft ?? String(account.balance)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      aria-label={`Balance of ${account.name}`}
    />
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
  onChange: (accounts: CashAccount[]) => void;
}) {
  const [name, setName] = useState("");
  const [accountCurrency, setAccountCurrency] = useState(currency);
  const [balance, setBalance] = useState("");
  const code = accountCurrency.trim().toUpperCase();
  const valid = name.trim() && isCurrency(code) && balance.trim() !== "" && Number.isFinite(Number(balance));
  const total = accounts.reduce((s, a) => s + a.balance * (fx[a.currency] ?? 1), 0);

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    onChange([...accounts, { id: crypto.randomUUID(), name: name.trim(), currency: code, balance: Number(balance) }]);
    setName("");
    setBalance("");
  }

  const update = (id: string, patch: Partial<CashAccount>) =>
    onChange(accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  return (
    <Card title="Cash" action={accounts.length > 0 && <span className="text-sm font-semibold tabular-nums">{formatMoney(total, currency)}</span>}>
      {accounts.length === 0 ? (
        <p className="mb-3 text-sm text-zinc-500">
          Add your bank and broker cash balances. Importing a Swissquote CSV fills them in automatically.
        </p>
      ) : (
        <ul className="mb-3 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{a.name}</div>
                {a.currency !== currency && (
                  <div className="text-xs text-zinc-500 tabular-nums">≈ {formatMoney(a.balance * (fx[a.currency] ?? 1), currency)}</div>
                )}
              </div>
              <span className="shrink-0 text-xs text-zinc-500">{a.currency}</span>
              <div className="w-32 shrink-0">
                <BalanceInput account={a} onChange={(b) => update(a.id, { balance: b })} />
              </div>
              <button
                className="text-xs text-zinc-400 hover:text-red-600"
                onClick={() => confirm(`Delete the cash account "${a.name}"?`) && onChange(accounts.filter((x) => x.id !== a.id))}
                aria-label={`Delete ${a.name}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="grid grid-cols-[1fr_5rem_7rem] gap-2">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Account name" aria-label="Account name" />
        <input
          className={`${inputClass} uppercase`}
          value={accountCurrency}
          onChange={(e) => setAccountCurrency(e.target.value)}
          list="cash-currencies"
          maxLength={3}
          aria-label="Currency"
        />
        <datalist id="cash-currencies">
          {BASE_CURRENCIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <input
          type="number"
          step="any"
          className={`${inputClass} text-right`}
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          placeholder="Balance"
          aria-label="Balance"
        />
        <button type="submit" disabled={!valid} className={`${primaryButtonClass} col-span-3`}>
          Add cash account
        </button>
      </form>
      {accounts.length > 0 && <p className="mt-2 text-xs text-zinc-500">Edit a balance to update it.</p>}
    </Card>
  );
}
