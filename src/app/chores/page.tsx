import { ChoreManager } from "@/components/chore-manager";
import { plannerData } from "@/lib/planner/schedule";

export default function ChoresPage() {
  return <ChoreManager chores={plannerData.chores} members={plannerData.household.members} />;
}
