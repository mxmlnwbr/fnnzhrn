"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

/** Email sign-in link form. After sending, it waits for the link to be opened and then continues to `next`. */
export function LoginForm({ next, configured }: { next: string; configured: boolean }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sent) return;
    // The link opens in a new tab; this one notices the new session and moves on as well.
    const check = async () => {
      const { data } = await authClient.getSession().catch(() => ({ data: null }));
      if (data?.user) location.replace(next);
    };
    const timer = setInterval(check, 3000);
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sent, next]);

  if (!configured) {
    return (
      <div className="card">
        <h2>Anmeldung ist nicht eingerichtet</h2>
        <p>
          Setze <code>DATABASE_URL</code>, <code>BETTER_AUTH_SECRET</code> und <code>RESEND_API_KEY</code> im Deployment und deploye neu.
        </p>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="card">
        <h2>Schau in dein Postfach</h2>
        <p>
          Wir haben einen Anmeldelink an <strong style={{ color: "var(--fg)", wordBreak: "break-all" }}>{email}</strong> geschickt. Öffne ihn auf diesem
          Gerät, diese Seite merkt es von selbst. Der Link gilt 15 Minuten.
        </p>
        <button type="button" className="pill-btn secondary" onClick={() => setSent(false)}>
          Andere E-Mail verwenden
        </button>
      </div>
    );
  }

  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const { error } = await authClient.signIn
          .magicLink({ email: email.trim(), callbackURL: next })
          .catch((err: Error) => ({ error: { message: err.message } }));
        setBusy(false);
        if (error) setError(error.message || "Der Link konnte nicht gesendet werden.");
        else setSent(true);
      }}
    >
      <h2>Mit E-Mail anmelden</h2>
      <p>Du bekommst einen Link per Mail, kein Passwort nötig.</p>
      <label htmlFor="email">E-Mail</label>
      <input id="email" type="email" required autoFocus autoComplete="email" placeholder="du@beispiel.ch" value={email} onChange={(e) => setEmail(e.target.value)} />
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy}>
        {busy ? "Wird gesendet…" : "Anmeldelink senden"}
      </button>
    </form>
  );
}
