import { ProfileDashboard } from "@/components/profile-dashboard";
import { getScheduleStats, plannerData } from "@/lib/planner/schedule";
import { getTodayContext } from "@/lib/today/context";
import { connection } from "next/server";

const stats = getScheduleStats();

export default async function Home() {
  await connection();
  const today = getTodayContext(new Date(), plannerData);

  return (
    <ProfileDashboard
      chores={plannerData.chores}
      members={plannerData.household.members}
      seasonLabel={plannerData.season.label}
      stats={{
        fixedEventCount: stats.fixedEventCount,
      }}
      today={today}
    />
  );
}
