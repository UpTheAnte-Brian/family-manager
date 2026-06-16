import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createMorningRoutineAllowanceEntry,
  getMorningRoutineAllowanceAmount,
  getMorningRoutineOccurredAt,
  hasMorningRoutineAllowanceEntry,
  removeMorningRoutineAllowanceEntries,
} from "@/lib/allowance/morning-routine";
import type { AllowanceEntry } from "@/lib/planner/types";

describe("morning routine allowance helpers", () => {
  it("normalizes a configured morning routine amount", () => {
    assert.equal(
      getMorningRoutineAllowanceAmount({
        morningRoutineAllowanceAmount: 0.255,
      }),
      0.26,
    );
  });

  it("creates a morning routine allowance entry", () => {
    assert.deepEqual(
      createMorningRoutineAllowanceEntry({
        amount: 0.25,
        childId: "mason",
        completionDate: "2026-06-15",
        id: "entry-1",
        occurredAt: "2026-06-15T09:00:00",
      }),
      {
        amount: 0.25,
        childId: "mason",
        choreTitle: "Morning routine complete",
        id: "entry-1",
        label: "Morning routine complete",
        occurredAt: "2026-06-15T09:00:00",
        routineCategory: "morning-routine",
        routineCompletionDate: "2026-06-15",
        source: "morning-routine-completion",
      },
    );
  });

  it("removes only the matching child and date entries", () => {
    const entries: AllowanceEntry[] = [
      {
        amount: 0.25,
        childId: "mason",
        id: "keep-other-day",
        occurredAt: "2026-06-14T09:00:00",
        routineCategory: "morning-routine",
        routineCompletionDate: "2026-06-14",
        source: "morning-routine-completion",
      },
      {
        amount: 0.25,
        childId: "mason",
        id: "remove-me",
        occurredAt: "2026-06-15T09:00:00",
        routineCategory: "morning-routine",
        routineCompletionDate: "2026-06-15",
        source: "morning-routine-completion",
      },
      {
        amount: 0.25,
        childId: "reagan",
        id: "keep-other-child",
        occurredAt: "2026-06-15T09:00:00",
        routineCategory: "morning-routine",
        routineCompletionDate: "2026-06-15",
        source: "morning-routine-completion",
      },
    ];

    assert.deepEqual(
      removeMorningRoutineAllowanceEntries(entries, "mason", "2026-06-15").map((entry) => entry.id),
      ["keep-other-day", "keep-other-child"],
    );
    assert.equal(hasMorningRoutineAllowanceEntry(entries, "mason", "2026-06-15"), true);
    assert.equal(hasMorningRoutineAllowanceEntry(entries, "mason", "2026-06-16"), false);
  });

  it("uses the latest valid end time for the credit timestamp", () => {
    assert.equal(
      getMorningRoutineOccurredAt("2026-06-15", [
        { endTime: "08:40" },
        { endTime: "09:05" },
        { endTime: "Today" },
      ]),
      "2026-06-15T09:05:00",
    );
  });
});
