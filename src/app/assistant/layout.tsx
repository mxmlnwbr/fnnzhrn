import type { Metadata } from "next";
import { ToolNav } from "@/components/ToolNav";

export const metadata: Metadata = {
  title: "Assistent · fnnzhrn",
  description: "Fragen zu Depot, Finanzen und Märkten, beantwortet von Claude",
  alternates: { canonical: "/assistant" },
};

export default function AssistantLayout({ children }: LayoutProps<"/assistant">) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <ToolNav current="assistant" />
      {children}
    </div>
  );
}
