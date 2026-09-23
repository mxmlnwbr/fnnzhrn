"use client";

import { useState } from "react";
import { retrySync, sendLoginCode, signOut, useSyncState, verifyLoginCode } from "@/lib/storage";
import { buttonClass, inputClass, primaryButtonClass } from "./ui";

export function AccountMenu() {
  const sync = useSyncState();
  const [open, setOpen] = useState(false);

  if (sync.status === "disabled") return null;

  let label = "Sign in to sync";
  if (sync.status === "loading") label = "…";
  if (sync.status === "signed-in") label = sync.error ? "Sync failed" : sync.syncing ? "Syncing…" : "Synced";

  return (
    <div className="relative">
      <button
        className={`${buttonClass} ${sync.status === "signed-in" && sync.error ? "text-red-600 dark:text-red-400" : ""}`}
        onClick={() => setOpen((o) => !o)}
        disabled={sync.status === "loading"}
        aria-expanded={open}
      >
        {label}
      </button>
      {open && (
        <div className="absolute left-0 z-10 sm:right-0 sm:left-auto mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-zinc-200 bg-white p-4 text-sm shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          {sync.status === "signed-in" ? (
            <div className="space-y-3">
              <p>
                Signed in as <span className="font-medium break-all">{sync.email}</span>. Your portfolio syncs to every
                device you sign in on.
              </p>
              {sync.error && <p className="text-red-600 dark:text-red-400">Last sync failed: {sync.error}</p>}
              <div className="flex gap-2">
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
          ) : (
            <SignInForm onDone={() => setOpen(false)} />
          )}
        </div>
      )}
    </div>
  );
}

function SignInForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!sent) {
    return (
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await sendLoginCode(email.trim());
            setSent(true);
          });
        }}
      >
        <p>Sign in with your email to keep your portfolio in sync across devices. No password needed.</p>
        <input
          className={inputClass}
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
        <button className={`${primaryButtonClass} w-full`} disabled={busy}>
          {busy ? "Sending…" : "Email me a sign-in code"}
        </button>
      </form>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run(async () => {
          await verifyLoginCode(email.trim(), code.trim());
          onDone();
        });
      }}
    >
      <p>
        We sent a code to <span className="font-medium break-all">{email}</span>. Enter it here, or open the link in the
        email on this device.
      </p>
      <input
        className={`${inputClass} font-mono tracking-widest`}
        inputMode="numeric"
        autoComplete="one-time-code"
        required
        maxLength={10}
        placeholder="123456"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
      />
      {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className={buttonClass} onClick={() => setSent(false)} disabled={busy}>
          Back
        </button>
        <button className={`${primaryButtonClass} flex-1`} disabled={busy}>
          {busy ? "Checking…" : "Sign in"}
        </button>
      </div>
    </form>
  );
}
