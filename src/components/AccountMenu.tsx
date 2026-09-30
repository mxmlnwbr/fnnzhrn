"use client";

import { useState } from "react";
import { retrySync, sendLoginLink, signOut, useSyncState } from "@/lib/storage";
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
                Signed in as <span className="font-medium break-all">{sync.email}</span>. Your depots sync to every device
                you sign in on.
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
            <SignInForm />
          )}
        </div>
      )}
    </div>
  );
}

function SignInForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await sendLoginLink(email.trim());
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-3">
        <p>
          We sent a sign-in link to <span className="font-medium break-all">{email}</span>. Open it on this device and
          you&apos;re signed in; this page picks it up by itself.
        </p>
        <button className={buttonClass} onClick={() => setSent(false)}>
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
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
        {busy ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
