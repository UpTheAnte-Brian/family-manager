import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getConfiguredEventsAfterAppliedSourceReplacements } from "@/lib/calendar/applied-source-replacements";
import type { CalendarSource } from "@/lib/calendar/types";
import type { FixedEvent } from "@/lib/planner/types";

describe("applied source replacements", () => {
  it("keeps configured SportsEngine events before a live source has been applied", () => {
    const events = getConfiguredEventsAfterAppliedSourceReplacements(
      [fixedEvent("sportsengine-calendar"), fixedEvent("family-calendar")],
      [sportsEngineSource({ lastAppliedAt: undefined })],
    );

    assert.deepEqual(
      events.map((event) => event.source),
      ["sportsengine-calendar", "family-calendar"],
    );
  });

  it("replaces baked SportsEngine events after a live SportsEngine source has been applied", () => {
    const events = getConfiguredEventsAfterAppliedSourceReplacements(
      [fixedEvent("sportsengine-calendar"), fixedEvent("family-calendar")],
      [sportsEngineSource({ lastAppliedAt: "2026-06-02T17:00:00.000Z" })],
    );

    assert.deepEqual(
      events.map((event) => event.source),
      ["family-calendar"],
    );
  });

  it("still replaces configured SportsEngine events when the applied source is hidden", () => {
    const events = getConfiguredEventsAfterAppliedSourceReplacements(
      [fixedEvent("sportsengine-calendar"), fixedEvent("family-calendar")],
      [sportsEngineSource({ enabled: false, lastAppliedAt: "2026-06-02T17:00:00.000Z" })],
    );

    assert.deepEqual(
      events.map((event) => event.source),
      ["family-calendar"],
    );
  });
});

function fixedEvent(source: string): FixedEvent {
  return {
    id: `${source}-event`,
    source,
    date: "2026-06-02",
    startTime: "19:00",
    endTime: "20:00",
    title: `${source} event`,
    category: "sports",
    calendarBehavior: "fixed",
  };
}

function sportsEngineSource(
  overrides: Partial<CalendarSource> = {},
): CalendarSource {
  return {
    id: "my-sportsengine-events",
    label: "My SportsEngine Events",
    kind: "sportsengine",
    enabled: true,
    syncMode: "manual",
    defaultVisibility: "assigned-members",
    defaultMemberIds: ["mason"],
    ...overrides,
  };
}
