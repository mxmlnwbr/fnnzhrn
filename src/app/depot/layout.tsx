import type { Metadata } from "next";
import { ToolNav } from "@/components/ToolNav";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = {
  title: "Depot · fnnzhrn",
  description: "Track your shares and cash in one place",
  applicationName: "Depot",
  alternates: { canonical: "/depot" },
};

export default async function DepotLayout({ children }: LayoutProps<"/depot">) {
  await requireMember("/depot");
  return (
    <div lang="en" className="flex min-h-dvh flex-1 flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <ToolNav current="depot" />
      {children}
    </div>
  );
}
