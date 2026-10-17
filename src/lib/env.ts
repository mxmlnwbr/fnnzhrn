/** Trims whitespace and stray quotes that secret managers sometimes keep around values. */
export function cleanEnv(value: string | undefined): string | undefined {
  return value?.trim().replace(/^(["'])(.*)\1$/, "$2").trim() || undefined;
}

/** Sign-in and sync need the database, a secret for sessions and a way to send confirmation and password-reset emails. */
export function syncConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(cleanEnv(env.DATABASE_URL) && cleanEnv(env.BETTER_AUTH_SECRET) && cleanEnv(env.RESEND_API_KEY));
}
