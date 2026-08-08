import assert from "node:assert/strict";
import test from "node:test";
import { getAvailableExtraChores } from "@/lib/chores/extra-chores";
import type { WeeklyChore } from "@/lib/planner/types";

const chores: WeeklyChore[] = [
  {
    allowanceAmount: 2,
    category: "yard",
    eligibleAssigneeIds: ["mason"],
    estimatedMinutes: 20,
    id: "yard-1",
    title: "Pull weeds",
  },
  {
    allowanceAmount: 3,
    category: "house-reset",
    eligibleAssigneeIds: [],
    estimatedMinutes: 15,
    id: "house-1",
    title: "Vacuum stairs",
  },
  {
    category: "yard",
    eligibleAssigneeIds: ["mason"],
    estimatedMinutes: 10,
    id: "yard-2",
    title: "Water plants",
  },
  {
    allowanceAmount: 1,
    category: "yard",
    eligibleAssigneeIds: ["emma"],
    estimatedMinutes: 10,
    id: "yard-3",
    title: "Rake leaves",
  },
];

test("returns only allowance chores available to the selected child", () => {
  const result = getAvailableExtraChores({
    chores,
    memberId: "mason",
    scheduledChoreIds: new Set(),
  });

  assert.deepEqual(
    result.map((chore) => chore.id),
    ["yard-1", "house-1"],
  );
});

test("keeps an extra chore available after it has already been requested", () => {
  const result = getAvailableExtraChores({
    chores,
    memberId: "mason",
    scheduledChoreIds: new Set(["yard-1"]),
  });

  assert.deepEqual(result.map((chore) => chore.id), ["house-1"]);
});
