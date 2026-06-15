import { HouseholdSetup } from "@/components/household-setup";
import { plannerData } from "@/lib/planner/schedule";

export default function SetupPage() {
  return (
    <HouseholdSetup
      defaultDayTemplates={plannerData.dayTemplates}
      plannerMembers={plannerData.household.members}
    />
  );
}
