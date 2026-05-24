import { AdminCalendarSources } from "@/components/admin-calendar-sources";
import { plannerData } from "@/lib/planner/schedule";
import Link from "next/link";

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-[#eef2f6] text-[#17202a]">
      <section className="border-b border-[#cbd5df] bg-[#f8fafc]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 sm:px-8 lg:px-10">
          <Link className="text-sm font-semibold text-[#1f6f8b]" href="/">
            Back to dashboard
          </Link>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
              Household setup
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-normal sm:text-5xl">
              Admin
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[#4c5965]">
              Configure the sources and rules that will eventually power the shared iPad dashboard.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-5 sm:px-8 lg:px-10">
        <AdminCalendarSources members={plannerData.household.members} />
      </section>
    </main>
  );
}
