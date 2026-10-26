import type { Metadata } from "next";
import { AssistantDock } from "@/components/Assistant";
import { ToolNav } from "@/components/ToolNav";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = {
  title: "Finanzen · fnnzhrn",
  description: "Einkommen, Fixkosten und wie viel davon investiert wird",
  alternates: { canonical: "/budget" },
};

export default async function BudgetLayout({ children }: LayoutProps<"/budget">) {
  await requireMember("/budget");
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <ToolNav current="budget" />
      {children}
      <AssistantDock />
    </div>
  );
}
