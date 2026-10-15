import { redirect } from "next/navigation";
import { BudgetPlanner } from "@/components/BudgetPlanner";
import { normalizeBudget } from "@/lib/budget";
import { getPool } from "@/lib/db";
import { currentUser } from "@/lib/session";

/** The signed-in user's financial overview, loaded on the server so it opens without a loading step. */
export default async function BudgetPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/budget");
  const { rows } = await getPool()!.query("select data from budgets where user_id = $1", [user.id]);
  return <BudgetPlanner initial={normalizeBudget(rows[0]?.data)} />;
}
