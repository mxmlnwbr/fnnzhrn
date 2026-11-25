/**
 * The web app whose API this app uses. Defaults to production at www.fnnzhrn.ch, where the site is served
 * (fnnzhrn.ch redirects there, which would cost every call a round trip). Point it at a local `npm run dev`
 * with EXPO_PUBLIC_API_URL in mobile/.env.local (e.g. http://localhost:3000 for the iOS simulator).
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "https://www.fnnzhrn.ch").replace(/\/$/, "");
