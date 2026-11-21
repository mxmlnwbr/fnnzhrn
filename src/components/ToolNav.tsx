import Link from "next/link";

/**
 * Bar above a tool linking back to fnnzhrn and across to the other tools. It matches the Cockpit's header
 * (src/app/cockpit/cockpit.html), so moving between the tools doesn't change the frame around them.
 */
export function ToolNav({ current }: { current: "depot" | "cockpit" | "budget" }) {
  const link = (href: string, label: string, id: typeof current) => (
    <a
      href={href}
      aria-current={current === id ? "page" : undefined}
      className={`rounded-full px-2.5 py-1 transition-colors ${
        current === id ? "bg-accent-soft text-zinc-900 dark:text-zinc-100" : "hover:text-zinc-900 dark:hover:text-zinc-100"
      }`}
    >
      {label}
    </a>
  );
  return (
    <nav
      aria-label="fnnzhrn"
      className="sticky top-[env(safe-area-inset-top,0px)] z-40 border-b border-zinc-200 bg-white/85 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/85"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-1 px-[max(1rem,env(safe-area-inset-left))] py-3 text-sm text-zinc-500">
        <Link href="/" className="mr-3 text-xl leading-none font-extrabold tracking-[-0.03em] text-zinc-900 dark:text-zinc-100">
          fnnzhrn<span className="text-accent">.</span>
        </Link>
        {link("/depot", "Depot", "depot")}
        {link("/budget", "Finanzen", "budget")}
        {link("/cockpit", "Cockpit", "cockpit")}
      </div>
    </nav>
  );
}
