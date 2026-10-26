import { Assistant } from "@/components/Assistant";
import { assistantStatus } from "@/lib/assistant/store";
import { requireMember } from "@/lib/session";

/** The assistant, with the user's key status and spend loaded on the server. */
export default async function AssistantPage() {
  const user = await requireMember("/assistant");
  return <Assistant initial={await assistantStatus(user.id)} />;
}
