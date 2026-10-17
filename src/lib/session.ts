import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";

/** The signed-in user for a server component, or null (also when sign-in isn't configured). */
export async function currentUser() {
  // Read the headers first, so pages using this always render per request (even without sign-in configured).
  const requestHeaders = await headers();
  const session = await getAuth()?.api.getSession({ headers: requestHeaders });
  return session?.user ?? null;
}

/** The signed-in user for a tool page; anyone signed out or not authorized goes to the sign-in page instead. */
export async function requireMember(next: string) {
  const user = await currentUser();
  if (!user?.authorized) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}
