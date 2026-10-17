"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "./auth-errors";

type Mode = "signin" | "signup" | "forgot";

/** Sign-in with email and password, plus sign-up and "forgot password". Continues to `next` once signed in. */
export function LoginForm({ next, configured, linkError }: { next: string; configured: boolean; linkError?: boolean }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState<"verify" | "reset" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(linkError ? "Der Link ist ungültig oder abgelaufen." : null);

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

  const switchTo = (to: Mode) => {
    setMode(to);
    setError(null);
  };

  if (sent) {
    return (
      <div className="card">
        <h2>Schau in dein Postfach</h2>
        <p>
          Wir haben {sent === "verify" ? "einen Bestätigungslink" : "einen Link zum Zurücksetzen"} an{" "}
          <strong style={{ color: "var(--fg)", wordBreak: "break-all" }}>{email}</strong> geschickt
          {sent === "verify" ? ". Öffne ihn, um dein Konto zu aktivieren." : ", falls es dazu ein Konto gibt. Der Link gilt eine Stunde."}
        </p>
        <button
          type="button"
          className="pill-btn secondary"
          onClick={() => {
            setSent(null);
            switchTo("signin");
          }}
        >
          Zurück zur Anmeldung
        </button>
      </div>
    );
  }

  // After a confirmation or reset link, come back to /login, which forwards signed-in users to `next`.
  const back = `/login?next=${encodeURIComponent(next)}`;

  async function submit() {
    const trimmed = email.trim();
    if (mode === "forgot") {
      const { error } = await authClient.requestPasswordReset({ email: trimmed, redirectTo: `/login/reset?next=${encodeURIComponent(next)}` });
      if (error) return setError(authErrorMessage(error));
      return setSent("reset");
    }
    if (mode === "signup") {
      const { error } = await authClient.signUp.email({ name: "", email: trimmed, password, callbackURL: back });
      if (error) return setError(authErrorMessage(error));
      return setSent("verify");
    }
    const { error } = await authClient.signIn.email({ email: trimmed, password, callbackURL: back });
    if (error?.code === "EMAIL_NOT_VERIFIED") return setSent("verify");
    if (error) return setError(authErrorMessage(error));
    location.replace(next);
  }

  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        await submit().catch((err: Error) => setError(err.message || "Das hat nicht geklappt. Versuch es nochmals."));
        setBusy(false);
      }}
    >
      <h2>{mode === "signin" ? "Mit E-Mail anmelden" : mode === "signup" ? "Konto erstellen" : "Passwort vergessen"}</h2>
      <p>
        {mode === "signin"
          ? "Noch kein Passwort, weil du dich bisher per Link angemeldet hast? Wähle «Passwort vergessen» und setze eines."
          : mode === "signup"
            ? "Wir schicken dir einen Link, um deine E-Mail zu bestätigen."
            : "Wir schicken dir einen Link, mit dem du ein neues Passwort festlegst."}
      </p>
      <label htmlFor="email">E-Mail</label>
      <input id="email" type="email" required autoFocus autoComplete="email" placeholder="du@beispiel.ch" value={email} onChange={(e) => setEmail(e.target.value)} />
      {mode !== "forgot" && (
        <>
          <label htmlFor="password">Passwort</label>
          <input
            id="password"
            type="password"
            required
            minLength={mode === "signup" ? 8 : undefined}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </>
      )}
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={busy}>
        {busy ? "Einen Moment…" : mode === "signin" ? "Anmelden" : mode === "signup" ? "Konto erstellen" : "Link senden"}
      </button>
      <p className="switch">
        {mode === "signin" ? (
          <>
            <button type="button" className="link-btn" onClick={() => switchTo("forgot")}>
              Passwort vergessen?
            </button>
            <button type="button" className="link-btn" onClick={() => switchTo("signup")}>
              Konto erstellen
            </button>
          </>
        ) : (
          <button type="button" className="link-btn" onClick={() => switchTo("signin")}>
            Zurück zur Anmeldung
          </button>
        )}
      </p>
    </form>
  );
}
