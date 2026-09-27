"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { buttonClass } from "./ui";

export interface Choice<T> {
  value: T;
  label: string;
  description?: string;
  /** Danger marks choices that remove data the user entered by hand. */
  tone?: "primary" | "danger";
}

interface Request {
  title: string;
  message?: ReactNode;
  choices: Choice<unknown>[];
  resolve: (value: unknown) => void;
}

const TONE = {
  primary: "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-700 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300",
  danger: "border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40",
  default: "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800",
};

/**
 * A modal with several choices, for decisions a yes/no `confirm()` can't express.
 * `ask` resolves with the chosen value, or null when cancelled.
 */
export function useChoice() {
  const [request, setRequest] = useState<Request | null>(null);

  const ask = useCallback(
    <T,>(title: string, message: ReactNode, choices: Choice<T>[]) =>
      new Promise<T | null>((resolve) =>
        setRequest({ title, message, choices: choices as Choice<unknown>[], resolve: resolve as (v: unknown) => void }),
      ),
    [],
  );

  const close = useCallback(
    (value: unknown) => {
      request?.resolve(value);
      setRequest(null);
    },
    [request],
  );

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, close]);

  const dialog = request && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => close(null)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="choice-title"
        className="animate-fade-in w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 text-sm shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="choice-title" className="text-base font-semibold">
          {request.title}
        </h2>
        {request.message && <div className="mt-1 text-zinc-600 dark:text-zinc-400">{request.message}</div>}
        <div className="mt-4 space-y-2">
          {request.choices.map((c, i) => (
            <button
              key={c.label}
              autoFocus={i === 0}
              onClick={() => close(c.value)}
              className={`w-full rounded-lg border px-3 py-2 text-left ${TONE[c.tone ?? "default"]}`}
            >
              <div className="font-medium">{c.label}</div>
              {c.description && <div className="text-xs opacity-80">{c.description}</div>}
            </button>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <button className={buttonClass} onClick={() => close(null)}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  return [dialog, ask] as const;
}
