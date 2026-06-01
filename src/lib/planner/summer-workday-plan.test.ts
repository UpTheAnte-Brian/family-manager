import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applySummerWorkdayPlan,
  summerWorkdayPlanSourceId,
  summerWorkdayPlanSourceLabel,
} from "./summer-workday-plan";
import type { FixedEvent, PlannerData } from "./types";

describe("Summer workday plan", () => {
  it("generates planned blocks for normal summer weekdays", () => {
    const planner = applySummerWorkdayPlan(createPlanner());
    const events = getPlanEventsForDate(planner, "2026-06-02");

    assert.deepEqual(
      events.map((event) => `${event.startTime}-${event.endTime} ${event.title}`),
      [
        "08:00-09:00 Quiet me time: reading or pickup",
        "09:00-11:00 Away activity: biking, soccer, park, or outing",
        "11:30-12:00 Lunch",
        "12:00-14:00 At-home outside time",
        "15:30-16:00 Toy pickup and house reset",
      ],
    );
  });

  it("does not generate weekend events", () => {
    const planner = applySummerWorkdayPlan(createPlanner());

    assert.equal(getPlanEventsForDate(planner, "2026-06-06").length, 0);
    assert.equal(getPlanEventsForDate(planner, "2026-06-07").length, 0);
  });

  it("skips morning plan and lunch when VBS overlaps those blocks", () => {
    const planner = applySummerWorkdayPlan(createPlanner());
    const events = getPlanEventsForDate(planner, "2026-06-10");

    assert.deepEqual(
      events.map((event) => event.title),
      ["At-home outside time", "Toy pickup and house reset"],
    );
  });

  it("does not skip the morning plan for reminder-like sports events", () => {
    const planner = applySummerWorkdayPlan(createPlanner());
    const events = getPlanEventsForDate(planner, "2026-06-12");

    assert.ok(events.some((event) => event.title === "Quiet me time: reading or pickup"));
    assert.ok(events.some((event) => event.title === "Away activity: biking, soccer, park, or outing"));
  });

  it("does not skip child plans for parent-only appointments", () => {
    const planner = applySummerWorkdayPlan(createPlanner());
    const events = getPlanEventsForDate(planner, "2026-06-11");

    assert.ok(events.some((event) => event.title === "Quiet me time: reading or pickup"));
    assert.ok(events.some((event) => event.title === "Away activity: biking, soccer, park, or outing"));
  });

  it("assigns generated events to all child members", () => {
    const planner = applySummerWorkdayPlan(createPlanner());
    const events = getPlanEventsForDate(planner, "2026-06-02");

    for (const event of events) {
      assert.deepEqual(event.assignedMemberIds, ["mason", "reagan", "kenzley"]);
    }
  });

  it("is idempotent and upserts the generated source", () => {
    const firstRun = applySummerWorkdayPlan(createPlanner());
    const secondRun = applySummerWorkdayPlan(firstRun);
    const plannedEvents = secondRun.fixedEvents.filter((event) => event.source === summerWorkdayPlanSourceId);
    const plannedEventIds = new Set(plannedEvents.map((event) => event.id));
    const matchingSources = secondRun.calendarSources.filter((source) => source.id === summerWorkdayPlanSourceId);

    assert.equal(plannedEvents.length, firstRun.fixedEvents.filter((event) => event.source === summerWorkdayPlanSourceId).length);
    assert.equal(plannedEventIds.size, plannedEvents.length);
    assert.equal(matchingSources.length, 1);
    assert.equal(matchingSources[0].label, summerWorkdayPlanSourceLabel);
  });
});

function getPlanEventsForDate(planner: PlannerData, date: string) {
  return planner.fixedEvents.filter(
    (event) => event.source === summerWorkdayPlanSourceId && event.date === date,
  );
}

function createPlanner(): PlannerData {
  return {
    version: 1,
    timezone: "America/Chicago",
    season: {
      id: "summer-2026",
      label: "Summer 2026",
      startsOn: "2026-06-02",
      endsOn: "2026-06-15",
      schoolReturnsOn: "2026-09-08",
      notes: [],
    },
    household: {
      members: [
        {
          id: "brian",
          preferredName: "Brian",
          displayName: "Me",
          role: "parent",
          relationship: "dad",
        },
        {
          id: "angela",
          preferredName: "Angela",
          displayName: "Mom",
          role: "parent",
          relationship: "mom",
        },
        child("mason", "Mason", "son"),
        child("reagan", "Reagan", "daughter"),
        child("kenzley", "Kenzley", "daughter"),
      ],
    },
    chores: {
      weeklyTargetPerChild: 5,
      routineChores: [],
      weeklyChores: [],
      weeklyAssignmentTemplates: [],
      completions: [],
    },
    calendarSources: [
      {
        id: "family-calendar",
        label: "Family Calendar",
        status: "active",
      },
    ],
    dayTemplates: [],
    fixedEvents: [
      event({
        id: "snack-reminder",
        date: "2026-06-10",
        startTime: "09:00",
        endTime: "10:00",
        title: "Bring Soccer Snacks tonight",
        category: "sports",
      }),
      event({
        id: "good-shepherd-vbs",
        date: "2026-06-10",
        startTime: "09:00",
        endTime: "12:00",
        title: "Good Shepherd VBS",
        category: "family-calendar",
      }),
      event({
        id: "angela-dentist",
        date: "2026-06-11",
        startTime: "09:00",
        endTime: "10:00",
        title: "Angela Dentist",
        category: "appointment",
        assignedMemberIds: ["angela"],
      }),
      event({
        id: "soccer-snacks-only",
        date: "2026-06-12",
        startTime: "09:00",
        endTime: "10:00",
        title: "Bring Soccer Snacks tonight",
        category: "sports",
      }),
    ],
    futureModules: [],
  };
}

function child(id: string, preferredName: string, relationship: "son" | "daughter") {
  return {
    id,
    preferredName,
    displayName: preferredName,
    role: "child" as const,
    relationship,
  };
}

function event(input: {
  assignedMemberIds?: string[];
  category: string;
  date: string;
  endTime: string;
  id: string;
  startTime: string;
  title: string;
}): FixedEvent {
  return {
    calendarBehavior: "fixed",
    source: "family-calendar",
    sourceUid: input.id,
    ...input,
  };
}
