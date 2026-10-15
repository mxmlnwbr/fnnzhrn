import { readFile } from "node:fs/promises";
import path from "node:path";
import { getAuth } from "@/lib/auth";

// The Cockpit is a self-contained HTML page (its data comes from /api/cockpit/*), served only to signed-in users.
const FILE = path.join(process.cwd(), "src/app/cockpit/cockpit.html");
let html: Promise<string> | undefined;

// Not ready yet: the landing page shows it as "Coming soon", so send everyone home until it launches.
const COMING_SOON = true;

export async function GET(request: Request) {
  if (COMING_SOON) return Response.redirect(new URL("/", request.url), 307);
  const session = await getAuth()?.api.getSession({ headers: request.headers });
  if (!session) return Response.redirect(new URL("/login?next=/cockpit", request.url), 307);
  html ??= readFile(FILE, "utf8");
  return new Response(await html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
