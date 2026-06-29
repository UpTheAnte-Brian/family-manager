"use client";

import { getTripPackingChecklistItems, getTripPackingProgress } from "@/lib/trip-packing/plans";
import type { TripPackingPlan } from "@/lib/trip-packing/types";
import type { HouseholdMember } from "@/lib/planner/types";

type DashboardTripPackingProps = {
  displayedDate: string;
  member: HouseholdMember;
  onToggleItem: (actionItemIds: string[], completed: boolean) => void | Promise<void>;
  plans: TripPackingPlan[];
};

export function DashboardTripPacking({
  displayedDate,
  member,
  onToggleItem,
  plans,
}: DashboardTripPackingProps) {
  if (plans.length === 0) {
    return null;
  }

  return (
    <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Trip Packing</h2>
          <p className="mt-1 text-sm text-[#4c5965]">
            {member.preferredName}&apos;s travel checklist, merged from the family base list and any personal add-ons.
          </p>
        </div>
      </div>

      <div className="grid gap-4">
        {plans.map((plan) => {
          const checklistItems = getTripPackingChecklistItems(plan, member.id);
          const progress = getTripPackingProgress(plan, member.id);

          return (
            <section className="grid gap-2" key={plan.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
                    {plan.tripName}
                  </h3>
                  <p className="mt-1 text-sm text-[#4c5965]">
                    Checklist starts {formatLongDate(plan.checklistStartsOn)}. Trip {formatLongDate(plan.tripStartsOn)} to {formatLongDate(plan.tripEndsOn)}.
                  </p>
                </div>
                <span className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#657381]">
                  {progress.completedCount}/{progress.totalCount} packed
                </span>
              </div>

              <ul className="grid gap-2">
                {checklistItems.map((item) => (
                  <li key={item.id}>
                    <div
                      className={`grid grid-cols-[1fr_auto] gap-2 border px-3 py-3 text-sm ${
                        item.checked ? "border-[#b7d8c3] bg-[#f1faf3]" : "border-[#d7e0e7] bg-[#f8fafc]"
                      }`}
                    >
                      <label className="grid cursor-pointer grid-cols-[24px_1fr] gap-3">
                        <input
                          checked={item.checked}
                          className="mt-1 h-4 w-4"
                          onChange={() => onToggleItem(item.actionItemIds, !item.checked)}
                          type="checkbox"
                        />
                        <span>
                          <span
                            className={
                              item.checked ? "block font-semibold text-[#657381] line-through" : "block font-semibold"
                            }
                          >
                            {item.title}
                          </span>
                          <span className="mt-1 block text-xs text-[#657381]">
                            Qty {item.quantity} · {sourceKindLabel(item.sourceKinds)}
                          </span>
                          {item.checked && item.completedAt && item.completedAt.slice(0, 10) !== displayedDate ? (
                            <span className="mt-2 block text-xs text-[#4c5965]">
                              Completed {formatLongDate(item.completedAt.slice(0, 10))}.
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function sourceKindLabel(sourceKinds: Array<"base" | "member">) {
  if (sourceKinds.includes("base") && sourceKinds.includes("member")) {
    return "Shared list + personal add-on";
  }

  if (sourceKinds.includes("member")) {
    return "Personal add-on";
  }

  return "Shared family list";
}

function formatLongDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
  });
}
