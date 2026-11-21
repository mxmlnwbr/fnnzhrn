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
  if (value > 0) return "text-up";
  if (value < 0) return "text-down";
  return "text-zinc-500";
}

/** A choice in a row of toggles (range, view, filter): the chosen one in the accent, like the Cockpit's chips. */
export function segmentClass(active: boolean) {
  return active
    ? "bg-accent-soft text-zinc-900 ring-1 ring-inset ring-accent dark:text-zinc-100"
    : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100";
}

// 16px on phones, as iOS zooms into any smaller field when it gets focus.
export const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-base transition-colors placeholder:text-zinc-400 focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:placeholder:text-zinc-600";

export const buttonClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm transition-colors hover:border-accent disabled:opacity-50 disabled:hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:disabled:hover:border-zinc-700";

export const primaryButtonClass =
  "rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-accent-fg transition-[filter] hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100";
