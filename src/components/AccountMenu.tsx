"use client";

import { useEffect, useRef, useState } from "react";
import { retrySync, signOut, useSyncState } from "@/lib/storage";
import { buttonClass } from "./ui";

/** The signed-in account: an avatar with the sync status, opening a popover to retry or sign out. */
export function AccountMenu() {
  const sync = useSyncState();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (sync.status !== "signed-in") return null;

  const status = sync.error ? "Sync failed" : sync.syncing ? "Syncing…" : "Synced";
  const dot = sync.error ? "bg-red-500" : sync.syncing ? "bg-sky-500 motion-safe:animate-pulse" : "bg-emerald-500";

  return (
    <div className="relative" ref={root}>
      <button
        className="relative flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white uppercase hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Account: ${sync.email || "signed in"}, ${status}`}
        title={status}
      >
        {sync.email.charAt(0) || "?"}
        <span
          className={`absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full ring-2 ring-zinc-50 dark:ring-zinc-950 ${dot}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="animate-fade-in absolute right-0 z-10 mt-2 w-72 max-w-[calc(100vw-2rem)] space-y-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <div>
            <p className="text-xs text-zinc-500">Signed in as</p>
            <p className="font-medium break-all">{sync.email}</p>
          </div>
          <p className="flex items-center gap-2 text-zinc-500">
            <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
            {sync.error ? (
              <span className="text-red-600 dark:text-red-400">Last sync failed: {sync.error}</span>
            ) : (
              `${status} across your devices`
            )}
          </p>
          <div className="flex gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            {sync.error && (
              <button className={buttonClass} onClick={() => void retrySync()}>
                Retry
              </button>
            )}
            <button
              className={buttonClass}
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
