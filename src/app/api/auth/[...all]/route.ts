import { getAuth } from "@/lib/auth";

/** Better Auth's endpoints: magic-link sign-in, session and sign-out. */
async function handle(request: Request) {
  const auth = getAuth();
  return auth ? auth.handler(request) : Response.json({ error: "Sign-in isn't configured" }, { status: 503 });
}

export { handle as GET, handle as POST };
