import { authClient } from "./auth-client";
import { API_URL } from "./config";

/** An API error with its HTTP status, so screens can tell "not authorized" from "offline". */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** GETs a path of the web app's API (e.g. `/api/portfolio`) with the session cookie and returns its JSON. */
export function getJson<T>(path: string): Promise<T> {
  return request<T>(path);
}

/** PUTs `body` as JSON to a path of the web app's API, e.g. `{ data: budget }` to `/api/budget`. */
export function putJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

async function request<T>(path: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}): Promise<T> {
  const cookie = await authClient.getCookie();
  let res: Response;
  try {
    // The cookie goes in by hand; `credentials: "omit"` keeps the native cookie jar out of it.
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { ...init.headers, ...(cookie ? { Cookie: cookie } : {}) },
      credentials: "omit",
    });
  } catch {
    throw new ApiError("Keine Verbindung zu fnnzhrn. Prüfe dein Internet.", 0);
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 403) throw new ApiError("Dein Konto ist noch nicht freigeschaltet.", 403);
  if (res.status === 401) throw new ApiError("Du bist nicht mehr angemeldet.", 401);
  if (!res.ok) throw new ApiError(body.error ?? `Anfrage fehlgeschlagen: ${res.status}`, res.status);
  return body as T;
}
