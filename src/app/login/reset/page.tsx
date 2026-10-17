import type { Metadata } from "next";
import Link from "next/link";
import { reveal } from "@/components/site/reveal";
import { ResetPasswordForm } from "@/components/site/ResetPasswordForm";
import { TickerBackground } from "@/components/site/TickerBackground";
import { safeNext } from "@/lib/next-path";
import "../../site.css";

export const metadata: Metadata = { title: "Passwort zurücksetzen · fnnzhrn" };

/** Where the reset email's link lands: Better Auth adds `token`, or `error` when the link is invalid or expired. */
export default async function ResetPassword({ searchParams }: PageProps<"/login/reset">) {
  const params = await searchParams;
  const token = typeof params.token === "string" && !params.error ? params.token : null;
  return (
    <div className="site">
      <TickerBackground />
      <main className="login">
        <Link className="brand-link site-reveal" href="/" style={reveal(0)}>
          fnnzhrn<span className="dot">.</span>
        </Link>
        <h1 className="site-reveal" style={reveal(0.1)}>
          Passwort
        </h1>
        <p className="lead site-reveal" style={reveal(0.2)}>
          Ein Login für alle Tools: Depot, Finanzen und Cockpit.
        </p>
        <div className="site-reveal" style={reveal(0.3)}>
          <ResetPasswordForm token={token} next={safeNext(params.next)} />
        </div>
      </main>
      <footer>© fnnzhrn · Keine Anlageberatung</footer>
    </div>
  );
}
