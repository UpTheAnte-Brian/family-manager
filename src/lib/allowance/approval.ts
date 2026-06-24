import type { HouseholdMember } from "@/lib/planner/types";

export function canApproveAllowanceRequests({
  householdRole,
}: {
  householdRole?: string | null;
  selectedMemberRole?: HouseholdMember["role"] | null;
}) {
  return householdRole === "owner" || householdRole === "parent";
}
