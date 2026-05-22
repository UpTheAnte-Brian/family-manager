import { ProfileDashboard } from "@/components/profile-dashboard";
import {
  buildPlannedDays,
  getScheduleStats,
  plannerData,
} from "@/lib/planner/schedule";

const plannedDays = buildPlannedDays();
const stats = getScheduleStats();

export default function Home() {
  return (
    <ProfileDashboard
      chores={plannerData.chores}
      day={getDashboardDay()}
      members={plannerData.household.members}
      seasonLabel={plannerData.season.label}
      stats={{
        dayCount: stats.dayCount,
        fixedEventCount: stats.fixedEventCount,
      }}
    />
  );
}

function getDashboardDay() {
  const today = toDateKey(new Date());
  const inSeedRange = plannedDays.find((day) => day.date === today);

  return inSeedRange ?? plannedDays[0];
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
