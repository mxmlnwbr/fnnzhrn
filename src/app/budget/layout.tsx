import type { Metadata } from "next";
import { ToolNav } from "@/components/ToolNav";

export const metadata: Metadata = {
  title: "Finanzen · fnnzhrn",
  description: "Einkommen, Fixkosten und wie viel davon investiert wird",
  alternates: { canonical: "/budget" },
};

export default function BudgetLayout({ children }: LayoutProps<"/budget">) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <ToolNav current="budget" />
      {children}
    </div>
  );
}
