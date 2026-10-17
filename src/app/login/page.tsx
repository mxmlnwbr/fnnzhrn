import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { reveal } from "@/components/site/reveal";
import { LoginForm } from "@/components/site/LoginForm";
import { PendingAccess } from "@/components/site/PendingAccess";
import { TickerBackground } from "@/components/site/TickerBackground";
import { syncConfigured } from "@/lib/env";
import { safeNext } from "@/lib/next-path";
import { currentUser } from "@/lib/session";
import "../site.css";

export const metadata: Metadata = { title: "Anmelden · fnnzhrn" };

/** One sign-in for all fnnzhrn tools; `next` is where to go afterwards. */
export default async function Login({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const user = await currentUser();
  if (user?.authorized) redirect(next);
  return (
    <div className="site">
      <TickerBackground />
      <main className="login">
        <Link className="brand-link site-reveal" href="/" style={reveal(0)}>
          fnnzhrn<span className="dot">.</span>
        </Link>
        <h1 className="site-reveal" style={reveal(0.1)}>
          Anmelden
        </h1>
        <p className="lead site-reveal" style={reveal(0.2)}>
          Ein Login für alle Tools: Depot, Finanzen und Cockpit.
        </p>
        <div className="site-reveal" style={reveal(0.3)}>
          {user ? (
            <PendingAccess email={user.email} />
          ) : (
            <LoginForm next={next} configured={syncConfigured()} linkError={Boolean(params.error)} />
          )}
        </div>
      </main>
      <footer>© fnnzhrn · Keine Anlageberatung</footer>
    </div>
  );
}
