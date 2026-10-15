/** Only same-site paths are allowed as the target after sign-in, so a link can't send anyone elsewhere. */
export function safeNext(next: string | string[] | undefined, fallback = "/") {
  const value = Array.isArray(next) ? next[0] : next;
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : fallback;
}
