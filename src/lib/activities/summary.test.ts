import assert from "node:assert/strict";
import test from "node:test";
import { buildActivitySummaries, getActivityWeekWindow, normalizeActivityTitleKey } from "@/lib/activities/summary";
import type { ActivityDefinition, ActivityEntry } from "@/lib/activities/types";

test("getActivityWeekWindow uses Monday as the week start", () => {
  assert.deepEqual(getActivityWeekWindow("2026-06-18"), {
    currentWeekEnd: "2026-06-21",
    currentWeekStart: "2026-06-15",
    previousWeekEnd: "2026-06-14",
    previousWeekStart: "2026-06-08",
  });

  assert.deepEqual(getActivityWeekWindow("2026-06-21"), {
    currentWeekEnd: "2026-06-21",
    currentWeekStart: "2026-06-15",
    previousWeekEnd: "2026-06-14",
    previousWeekStart: "2026-06-08",
  });
});

test("buildActivitySummaries reports selected day, current week, previous week, and sponsorship amounts", () => {
  const activities: ActivityDefinition[] = [
    {
      id: "shots",
      sponsorAmount: 0.1,
      status: "active",
      title: "Practice shots",
      titleKey: "practice shots",
      unitLabel: "shots",
    },
    {
      id: "reading",
      status: "active",
      title: "Minutes of reading",
      titleKey: "minutes of reading",
      unitLabel: "minutes",
    },
  ];
  const entries: ActivityEntry[] = [
    {
      activityId: "shots",
      date: "2026-06-18",
      id: "1",
      memberId: "mason",
      quantity: 75,
    },
    {
      activityId: "shots",
      date: "2026-06-16",
      id: "2",
      memberId: "mason",
      quantity: 50,
    },
    {
      activityId: "shots",
      date: "2026-06-10",
      id: "3",
      memberId: "mason",
      quantity: 120,
    },
    {
      activityId: "reading",
      date: "2026-06-18",
      id: "4",
      memberId: "mason",
      quantity: 20,
    },
  ];

  const [shots, reading] = buildActivitySummaries({
    activities,
    entries,
    referenceDate: "2026-06-18",
  });

  assert.equal(shots.activity.id, "shots");
  assert.equal(shots.selectedDateQuantity, 75);
  assert.equal(shots.currentWeekTotal, 125);
  assert.equal(shots.previousWeekTotal, 120);
  assert.equal(shots.currentWeekSponsoredAmount, 12.5);
  assert.equal(shots.previousWeekSponsoredAmount, 12);
  assert.equal(shots.isSponsored, true);

  assert.equal(reading.activity.id, "reading");
  assert.equal(reading.selectedDateQuantity, 20);
  assert.equal(reading.currentWeekTotal, 20);
  assert.equal(reading.previousWeekTotal, 0);
  assert.equal(reading.currentWeekSponsoredAmount, undefined);
  assert.equal(reading.isSponsored, false);
});

test("normalizeActivityTitleKey trims and collapses whitespace", () => {
  assert.equal(normalizeActivityTitleKey("  Practice   shots "), "practice shots");
});
