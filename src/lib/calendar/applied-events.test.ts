import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAppliedCalendarEventAssignmentKey,
  getAppliedCalendarEventSourceUid,
  isSameAppliedCalendarEvent,
} from "@/lib/calendar/applied-events";

describe("applied calendar event helpers", () => {
  it("builds a stable assignment key for imported events", () => {
    assert.equal(
      getAppliedCalendarEventAssignmentKey({
        sourceId: "family-calendar",
        sourceUid: "therapy-uid",
        title: "Therapy",
        date: "2026-06-17",
        startTime: "13:00",
      }),
      "imported:family-calendar:therapy-uid:2026-06-17:13:00",
    );
  });

  it("falls back to event details when the source uid is missing", () => {
    assert.equal(
      getAppliedCalendarEventSourceUid({
        sourceId: "manual-household",
        title: "Boat to fish fry",
        date: "2026-06-17",
        startTime: "16:30",
        location: "Lake Minnetonka",
      }),
      "Boat to fish fry:2026-06-17:16:30:Lake Minnetonka",
    );
  });

  it("matches recurring events by source, uid, and occurrence time", () => {
    const therapyEvent = {
      sourceId: "family-calendar",
      sourceUid: "therapy-uid",
      title: "Therapy",
      date: "2026-06-17",
      startTime: "13:00",
      location: "Office",
    };

    assert.equal(
      isSameAppliedCalendarEvent(therapyEvent, {
        ...therapyEvent,
        title: "Therapy with Angela",
      }),
      true,
    );
    assert.equal(
      isSameAppliedCalendarEvent(therapyEvent, {
        ...therapyEvent,
        date: "2026-06-24",
      }),
      false,
    );
  });
});
