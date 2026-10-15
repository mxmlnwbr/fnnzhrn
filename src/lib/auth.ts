import "server-only";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { Resend } from "resend";
import { getPool } from "./db";
import { cleanEnv, syncConfigured } from "./env";

function createAuth() {
  const resend = new Resend(cleanEnv(process.env.RESEND_API_KEY));
  // Resend's test sender only delivers to the Resend account's own address; set EMAIL_FROM to a verified domain for others.
  const from = cleanEnv(process.env.EMAIL_FROM) ?? "Depot <onboarding@resend.dev>";
  return betterAuth({
    database: getPool()!,
    secret: cleanEnv(process.env.BETTER_AUTH_SECRET),
    baseURL: cleanEnv(process.env.BETTER_AUTH_URL),
    session: {
      // Stay signed in like before: a year, renewed daily while the app is used.
      expiresIn: 60 * 60 * 24 * 365,
      updateAge: 60 * 60 * 24,
    },
    plugins: [
      magicLink({
        expiresIn: 60 * 15,
        async sendMagicLink({ email, url }) {
          const { error } = await resend.emails.send({
            from,
            to: email,
            subject: "Sign in to Depot",
            text: `Open this link to sign in to Depot:\n\n${url}\n\nIt works once and expires in 15 minutes. If you didn't ask for it, ignore this email.`,
          });
          if (error) throw new Error(`Couldn't send the sign-in email: ${error.message}`);
        },
      }),
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
