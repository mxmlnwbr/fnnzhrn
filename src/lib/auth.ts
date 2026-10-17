import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { Resend } from "resend";
import { getPool } from "./db";
import { cleanEnv, syncConfigured } from "./env";

function createAuth() {
  const resend = new Resend(cleanEnv(process.env.RESEND_API_KEY));
  // Resend's test sender only delivers to the Resend account's own address; set EMAIL_FROM to a verified domain for others.
  const from = cleanEnv(process.env.EMAIL_FROM) ?? "fnnzhrn <onboarding@resend.dev>";
  async function send(to: string, subject: string, text: string) {
    const { error } = await resend.emails.send({ from, to, subject, text });
    if (error) throw new Error(`Couldn't send the email: ${error.message}`);
  }
  return betterAuth({
    database: getPool()!,
    secret: cleanEnv(process.env.BETTER_AUTH_SECRET),
    baseURL: cleanEnv(process.env.BETTER_AUTH_URL),
    // Sign-in requests are accepted from these sites besides BETTER_AUTH_URL, so a www. address or a
    // leftover BETTER_AUTH_URL from the old depot.fnnzhrn.ch project doesn't block signing in.
    trustedOrigins: ["https://fnnzhrn.ch", "https://www.fnnzhrn.ch"],
    session: {
      // Stay signed in like before: a year, renewed daily while the app is used.
      expiresIn: 60 * 60 * 24 * 365,
      updateAge: 60 * 60 * 24,
    },
    emailAndPassword: {
      enabled: true,
      // New accounts confirm their address first, so nobody can sign up with someone else's email.
      requireEmailVerification: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      // Also how members from the email-link days get a password: resetting creates it.
      async sendResetPassword({ user, url }) {
        await send(
          user.email,
          "Passwort zurücksetzen bei fnnzhrn",
          `Öffne diesen Link, um ein neues Passwort für fnnzhrn festzulegen:\n\n${url}\n\nEr läuft nach einer Stunde ab. Falls du das nicht angefordert hast, ignoriere diese E-Mail.`,
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      async sendVerificationEmail({ user, url }) {
        await send(
          user.email,
          "E-Mail bestätigen bei fnnzhrn",
          `Öffne diesen Link, um deine E-Mail-Adresse zu bestätigen und dich bei fnnzhrn anzumelden:\n\n${url}\n\nFalls du dich nicht registriert hast, ignoriere diese E-Mail.`,
        );
      },
    },
    plugins: [
      nextCookies(),
    ],
  });
}

let instance: ReturnType<typeof createAuth> | null | undefined;

/** Better Auth, or null when sign-in isn't configured (the app then stays locked). */
export function getAuth() {
  instance ??= syncConfigured() ? createAuth() : null;
  return instance;
}

/** The signed-in user's id, or the response to send instead: 503 without sign-in configured, 401 when signed out. */
export async function requireUser(request: Request): Promise<string | Response> {
  const auth = getAuth();
  if (!auth) return Response.json({ error: "Sign-in isn't configured" }, { status: 503 });
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user.id ?? Response.json({ error: "Not signed in" }, { status: 401 });
}
