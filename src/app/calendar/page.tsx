import { CalendarOverview } from "@/components/calendar-overview";
import { plannerData } from "@/lib/planner/schedule";

export default function CalendarPage() {
  return (
    <CalendarOverview
      configuredEvents={plannerData.fixedEvents}
      members={plannerData.household.members}
      season={plannerData.season}
    />
  );
}
