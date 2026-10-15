"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

/** Top-right account link of the public pages. */
export function SiteHeader({ email }: { email: string | null }) {
  const router = useRouter();
  return (
    <header className="site-header">
      {email ? (
        <>
          <span className="who" title={email}>
            {email}
          </span>
          <button
            type="button"
            className="pill-btn"
            onClick={async () => {
              await authClient.signOut().catch(() => undefined);
              router.refresh();
            }}
          >
            Abmelden
          </button>
        </>
      ) : (
        <a className="pill-btn" href="/login">
          Anmelden
        </a>
      )}
    </header>
  );
}
