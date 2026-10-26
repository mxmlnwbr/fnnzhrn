import { redirect } from "next/navigation";

/** The assistant is a chat on every tool now, so its old address opens the depot. */
export default function AssistantPage() {
  redirect("/depot");
}
