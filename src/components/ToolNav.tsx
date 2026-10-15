import Link from "next/link";

/** Thin bar above a tool linking back to fnnzhrn and across to the other tools. */
export function ToolNav({ current }: { current: "depot" | "cockpit" }) {
  const link = (href: string, label: string, id: typeof current) => (
    <a
      href={href}
      aria-current={current === id ? "page" : undefined}
      className={`rounded-full px-2.5 py-0.5 ${current === id ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100" : "hover:text-zinc-900 dark:hover:text-zinc-100"}`}
    >
      {label}
    </a>
  );
  return (
    <nav aria-label="fnnzhrn" className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 text-sm text-zinc-500">
        <Link href="/" className="mr-2 font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
          fnnzhrn<span className="text-emerald-600 dark:text-emerald-400">.</span>
        </Link>
        {link("/depot", "Depot", "depot")}
        {link("/cockpit", "Cockpit", "cockpit")}
      </div>
    </nav>
  );
}
