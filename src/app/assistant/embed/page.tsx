import type { Metadata } from "next";
import { AssistantDock } from "@/components/Assistant";
import { requireMember } from "@/lib/session";

export const metadata: Metadata = { title: "Assistent · fnnzhrn", robots: { index: false } };

/** The assistant chat on its own, for the iframe on pages that aren't React (the Cockpit). */
export default async function AssistantEmbed() {
  await requireMember("/cockpit");
  return <AssistantDock embedded />;
}
