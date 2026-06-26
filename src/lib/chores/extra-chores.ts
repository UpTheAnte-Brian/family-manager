import type { WeeklyChore } from "@/lib/planner/types";

export function getAvailableExtraChores({
  blockedChoreIds,
  chores,
  memberId,
  scheduledChoreIds,
}: {
  blockedChoreIds: Set<string>;
  chores: WeeklyChore[];
  memberId: string;
  scheduledChoreIds: Set<string>;
}) {
  return chores.filter((chore) => {
    const isEligible =
      chore.eligibleAssigneeIds.length === 0 || chore.eligibleAssigneeIds.includes(memberId);

    return (
      isEligible &&
      Boolean(chore.allowanceAmount) &&
      !scheduledChoreIds.has(chore.id) &&
      !blockedChoreIds.has(chore.id)
    );
  });
}
