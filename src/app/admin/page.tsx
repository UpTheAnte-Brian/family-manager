import { HouseholdSetup } from "@/components/household-setup";
import { plannerData } from "@/lib/planner/schedule";

export default function AdminPage() {
  return (
    <HouseholdSetup
      defaultDayTemplates={plannerData.dayTemplates}
      plannerMembers={plannerData.household.members}
    />
  );
}
