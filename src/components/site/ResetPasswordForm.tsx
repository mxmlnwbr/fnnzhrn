"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "./auth-errors";

/** Sets a new password from the emailed reset link, then sends the user to sign in with it. */
export function ResetPasswordForm({ token, next }: { token: string | null; next: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const login = `/login?next=${encodeURIComponent(next)}`;

  if (!token || done) {
    return (
      <div className="card">
        <h2>{done ? "Passwort gespeichert" : "Link ungültig"}</h2>
        <p>{done ? "Melde dich jetzt mit deinem neuen Passwort an." : "Der Link ist ungültig oder abgelaufen. Fordere unter «Passwort vergessen» einen neuen an."}</p>
        <Link className="pill-btn secondary" href={login}>
          Zur Anmeldung
        </Link>
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
        const { error } = await authClient
          .resetPassword({ newPassword: password, token })
          .catch((err: Error) => ({ error: { message: err.message } }));
        setBusy(false);
        if (error) setError(authErrorMessage(error));
        else setDone(true);
      }}
    >
      <h2>Neues Passwort</h2>
      <p>Mindestens 8 Zeichen. Danach meldest du dich damit an.</p>
      <label htmlFor="password">Passwort</label>
      <input id="password" type="password" required minLength={8} autoFocus autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy}>
        {busy ? "Wird gespeichert…" : "Passwort speichern"}
      </button>
    </form>
  );
}
