import "server-only";
import { requireUser } from "@/lib/auth";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

export type FetchOptions = {
  headers?: Record<string, string>;
  timeout?: number;
  /** Seconds Next.js keeps the upstream response in its data cache. */
  revalidate?: number;
};

export async function fetchText(url: string, { headers = {}, timeout = 12000, revalidate = 0 }: FetchOptions = {}) {
  const host = new URL(url).host;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, ...headers },
      signal: AbortSignal.timeout(timeout),
      next: { revalidate },
    });
  } catch (e) {
    // The tiles show these messages as they are.
    const name = (e as Error).name;
    throw new Error(name === "TimeoutError" || name === "AbortError" ? `Quelle antwortet nicht (${host})` : `Quelle nicht erreichbar (${host})`);
  }
  if (!res.ok) throw new Error(`Quelle antwortet mit ${res.status} (${host})`);
  return res.text();
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<T> {
  return JSON.parse(await fetchText(url, { ...opts, headers: { Accept: "application/json, text/plain, */*", ...opts.headers } }));
}

export type Failed = { error: string };

/** Runs fn over items with limited concurrency; a failure becomes { error } instead of failing the batch. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<(R | Failed)[]> {
  const out: (R | Failed)[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], i);
      } catch (e) {
        out[i] = { error: String((e as Error).message || e) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export function failed(x: unknown): x is Failed {
  return typeof x === "object" && x !== null && "error" in x;
}

export class BadRequest extends Error {}

/**
 * GET handler for a cockpit endpoint: signed-in users only, errors as JSON.
 * Responses are cached in the browser only; upstream data is cached server-side via `revalidate`.
 */
export function cockpitRoute(fn: (params: URLSearchParams) => Promise<unknown>, browserMaxAge = 60) {
  return async function GET(request: Request) {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    try {
      const body = await fn(new URL(request.url).searchParams);
      return Response.json(body, { headers: { "Cache-Control": `private, max-age=${browserMaxAge}` } });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: e instanceof BadRequest ? 400 : 502 });
    }
  };
}
