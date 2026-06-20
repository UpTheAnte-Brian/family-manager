import { ProfileDashboard } from "@/components/profile-dashboard";
import { plannerData } from "@/lib/planner/schedule";
import { getTodayContext } from "@/lib/today/context";
import { connection } from "next/server";

export default async function Home() {
  await connection();
  const today = getTodayContext(new Date(), plannerData);

  return (
    <ProfileDashboard
      allowance={plannerData.allowance}
      chores={plannerData.chores}
      dayTemplates={plannerData.dayTemplates}
      fixedEvents={plannerData.fixedEvents}
      season={plannerData.season}
      today={today}
    />
  );
}
