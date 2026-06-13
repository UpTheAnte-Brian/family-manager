import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PlannerData } from "@/lib/planner/types";
import { classifyDay, getTodayContext } from "./context";

const plannerData = {
  version: 1,
  timezone: "America/Chicago",
  season: {
    id: "summer-2026",
    label: "Summer 2026",
    startsOn: "2026-06-02",
    endsOn: "2026-09-07",
    schoolReturnsOn: "2026-09-08",
    notes: [],
  },
  household: {
    members: [],
  },
  chores: {
    weeklyTargetPerChild: 5,
    routineChores: [],
    weeklyChores: [],
    weeklyAssignmentTemplates: [],
    completions: [],
  },
  allowance: {
    entries: [],
  },
  calendarSources: [],
  dayTemplates: [
    {
      id: "summer-weekday",
      label: "Summer Weekday",
      appliesTo: {
        daysOfWeek: ["MO", "TU", "WE", "TH", "FR"],
        dateRange: {
          startsOn: "2026-06-02",
          endsOn: "2026-09-07",
        },
      },
      blocks: [
        {
          id: "wake",
          startTime: "07:30",
          endTime: "08:30",
          title: "Wake up",
          category: "routine",
          noiseLevel: "medium",
          location: "home",
          calendarBehavior: "draft",
        },
      ],
    },
  ],
  fixedEvents: [],
  futureModules: [],
} satisfies PlannerData;

describe("Today Engine", () => {
  it("does not treat a pre-summer weekend as the first configured summer day", () => {
    const today = getTodayContext(new Date("2026-05-23T17:00:00.000Z"), plannerData);

    assert.equal(today.date, "2026-05-23");
    assert.equal(today.dayType, "school-year-weekend");
    assert.equal(today.baseline.source, "missing");
    assert.equal(today.baseline.blocks.length, 0);
  });

  it("uses configured summer baseline when the real date is inside the summer range", () => {
    const today = getTodayContext(new Date("2026-06-02T17:00:00.000Z"), plannerData);

    assert.equal(today.date, "2026-06-02");
    assert.equal(today.dayType, "summer-weekday");
    assert.equal(today.baseline.source, "configured");
    assert.equal(today.baseline.blocks.length, 1);
  });

  it("lets explicit no-school calendar events override ordinary weekdays", () => {
    assert.equal(
      classifyDay(
        "2026-05-26",
        "TU",
        [{ title: "No school", category: "school" }],
        plannerData,
      ),
      "no-school",
    );
  });
});
