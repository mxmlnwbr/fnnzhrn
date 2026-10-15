import { redirect } from "next/navigation";
import { BudgetPlanner } from "@/components/BudgetPlanner";
import { loadBudget } from "@/lib/budget-store";
import { currentUser } from "@/lib/session";

/** The signed-in user's financial overview, loaded on the server so it opens without a loading step. */
export default async function BudgetPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/budget");
  return <BudgetPlanner initial={await loadBudget(user.id, user.email)} />;
}
