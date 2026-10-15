"use client";

import { type ReactNode, useState } from "react";
import { sendLoginLink } from "@/lib/storage";
import { buttonClass, inputClass, primaryButtonClass } from "./ui";

/** Full-page gate shown instead of the dashboard until the visitor signs in. */
export function SignInScreen({ configured }: { configured: boolean }) {
  return (
    <main className="animate-fade-in relative flex flex-1 items-center justify-center overflow-hidden px-4 py-12">
      {/* Soft glow behind the card, in the app icon's sky blue. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(14,165,233,0.18),transparent)] dark:bg-[radial-gradient(60%_60%_at_50%_0%,rgba(14,165,233,0.14),transparent)]"
        aria-hidden
      />
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <Logo />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Depot</h1>
            <p className="text-sm text-zinc-500">Your shares and cash, in one place.</p>
          </div>
        </div>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {configured ? (
            <SignInForm />
          ) : (
            <div className="space-y-2 text-sm">
              <h2 className="font-semibold">Sign-in isn&apos;t set up</h2>
              <p className="text-zinc-500">
                Depot needs an account to open. Set <code className="font-mono text-xs">DATABASE_URL</code>,{" "}
                <code className="font-mono text-xs">BETTER_AUTH_SECRET</code> and{" "}
                <code className="font-mono text-xs">RESEND_API_KEY</code> on the deployment, then redeploy.
              </p>
            </div>
          )}
        </section>

        <ul className="grid grid-cols-3 gap-3 text-center text-xs text-zinc-500">
          <Feature icon={<ChartIcon />} label="Live prices" />
          <Feature icon={<DevicesIcon />} label="Synced devices" />
          <Feature icon={<LockIcon />} label="Private to you" />
        </ul>
      </div>
    </main>
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
      <div className="animate-fade-in space-y-4 text-sm">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400">
          <MailIcon />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Check your email</h2>
          <p className="text-zinc-500">
            We sent a sign-in link to <span className="font-medium break-all text-zinc-900 dark:text-zinc-100">{email}</span>.
            Open it on this device; this page picks it up by itself.
          </p>
        </div>
        <button className={`${buttonClass} w-full`} onClick={() => setSent(false)}>
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <div className="space-y-1">
        <h2 className="text-base font-semibold">Sign in</h2>
        <p className="text-zinc-500">We&apos;ll email you a link. No password needed.</p>
      </div>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Email</span>
        <input
          className={`${inputClass} px-3 py-2`}
          type="email"
          required
          autoFocus
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
      <button className={`${primaryButtonClass} w-full py-2`} disabled={busy}>
        {busy ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}

function Feature({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <li className="flex flex-col items-center gap-1.5">
      <span className="text-zinc-400 dark:text-zinc-500">{icon}</span>
      {label}
    </li>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 64 64" className="h-14 w-14 drop-shadow-sm" aria-hidden>
      <defs>
        <linearGradient id="signInFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0ea5e9" stopOpacity={0.45} />
          <stop offset="1" stopColor="#0ea5e9" stopOpacity={0} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#18181b" />
      <path d="M10 46 L22 34 L31 40 L44 24 L54 16 L54 54 L10 54 Z" fill="url(#signInFill)" />
      <path
        d="M10 46 L22 34 L31 40 L44 24 L54 16"
        fill="none"
        stroke="#38bdf8"
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const iconProps = {
  viewBox: "0 0 24 24",
  className: "h-5 w-5",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function ChartIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 3v18h18" />
      <path d="M7 15l4-4 3 3 5-6" />
    </svg>
  );
}

function DevicesIcon() {
  return (
    <svg {...iconProps}>
      <rect x="2" y="4" width="14" height="10" rx="1.5" />
      <path d="M6 18h6" />
      <rect x="17" y="8" width="5" height="11" rx="1" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg {...iconProps}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}
