import type { ReactNode } from "react";

export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function pnlClass(value: number) {
  if (value > 0) return "text-emerald-600 dark:text-emerald-400";
  if (value < 0) return "text-red-600 dark:text-red-400";
  return "text-zinc-500";
}

export const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";

export const buttonClass =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800";

export const primaryButtonClass =
  "rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";
