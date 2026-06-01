import { ProfileDashboard } from "@/components/profile-dashboard";
import { plannerData } from "@/lib/planner/schedule";
import { parentResponsibilities } from "@/lib/today/parent-responsibilities";
import { getTodayContext } from "@/lib/today/context";
import { connection } from "next/server";

export default async function Home() {
  await connection();
  const today = getTodayContext(new Date(), plannerData);

  return (
    <ProfileDashboard
      chores={plannerData.chores}
      configuredResponsibilities={parentResponsibilities}
      dayTemplates={plannerData.dayTemplates}
      fixedEvents={plannerData.fixedEvents}
      members={plannerData.household.members}
      season={plannerData.season}
      today={today}
    />
  );
}
