const messages: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-Mail oder Passwort stimmt nicht.",
  INVALID_EMAIL: "Diese E-Mail-Adresse ist ungültig.",
  PASSWORD_TOO_SHORT: "Das Passwort braucht mindestens 8 Zeichen.",
  PASSWORD_TOO_LONG: "Das Passwort ist zu lang.",
  INVALID_TOKEN: "Der Link ist ungültig oder abgelaufen. Fordere einen neuen an.",
  USER_ALREADY_EXISTS: "Zu dieser E-Mail gibt es schon ein Konto.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Zu dieser E-Mail gibt es schon ein Konto.",
};

/** Better Auth's error in German, falling back to its own message. */
export function authErrorMessage(error: { code?: string; message?: string; status?: number }): string {
  if (error.status === 429) return "Zu viele Versuche. Warte kurz und versuch es nochmals.";
  return (error.code && messages[error.code]) || error.message || "Das hat nicht geklappt. Versuch es nochmals.";
}
