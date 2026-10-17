"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

/** Shown to signed-in users whose account isn't authorized for the tools yet. */
export function PendingAccess({ email }: { email: string }) {
  const router = useRouter();
  return (
    <div className="card">
      <h2>Noch nicht freigeschaltet</h2>
      <p>
        Dein Konto <strong style={{ color: "var(--fg)", wordBreak: "break-all" }}>{email}</strong> ist erstellt, aber noch nicht für die Tools
        freigeschaltet. Melde dich bei uns; sobald es freigeschaltet ist, lade diese Seite neu.
      </p>
      <button
        type="button"
        className="pill-btn secondary"
        onClick={async () => {
          await authClient.signOut().catch(() => undefined);
          router.refresh();
        }}
      >
        Abmelden
      </button>
    </div>
  );
}
