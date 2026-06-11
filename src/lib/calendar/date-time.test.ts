import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toCalendarEventIsoRange } from "@/lib/calendar/date-time";

describe("calendar date-time conversion", () => {
  it("keeps same-day events on the selected date", () => {
    const range = toCalendarEventIsoRange("2026-05-03", "20:45", "21:45", "America/Chicago");

    assert.equal(range.endDayOffset, 0);
    assert.equal(range.startsAt, "2026-05-04T01:45:00.000Z");
    assert.equal(range.endsAt, "2026-05-04T02:45:00.000Z");
    assert.ok(new Date(range.endsAt).getTime() > new Date(range.startsAt).getTime());
  });

  it("moves overnight event ends to the following date", () => {
    const range = toCalendarEventIsoRange("2026-05-03", "23:30", "00:30", "America/Chicago");

    assert.equal(range.endDayOffset, 1);
    assert.equal(range.startsAt, "2026-05-04T04:30:00.000Z");
    assert.equal(range.endsAt, "2026-05-04T05:30:00.000Z");
    assert.ok(new Date(range.endsAt).getTime() > new Date(range.startsAt).getTime());
  });

  it("does not treat all-day display ranges as overnight", () => {
    const range = toCalendarEventIsoRange("2026-05-03", "00:00", "23:59", "America/Chicago");

    assert.equal(range.endDayOffset, 0);
    assert.ok(new Date(range.endsAt).getTime() > new Date(range.startsAt).getTime());
  });
});
