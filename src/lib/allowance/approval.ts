import type { HouseholdMember } from "@/lib/planner/types";

export function canApproveAllowanceRequests({
  householdRole,
  selectedMemberRole,
}: {
  householdRole?: string | null;
  selectedMemberRole?: HouseholdMember["role"] | null;
}) {
  const isHouseholdAdmin = householdRole === "owner" || householdRole === "parent";

  return isHouseholdAdmin && selectedMemberRole === "parent";
}
