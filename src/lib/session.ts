import "server-only";
import { headers } from "next/headers";
import { getAuth } from "./auth";

/** The signed-in user for a server component, or null (also when sign-in isn't configured). */
export async function currentUser() {
  // Read the headers first, so pages using this always render per request (even without sign-in configured).
  const requestHeaders = await headers();
  const session = await getAuth()?.api.getSession({ headers: requestHeaders });
  return session?.user ?? null;
}
