import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toCalendarEventIsoRange } from "@/lib/calendar/date-time";

describe("calendar date-time conversion", () => {
  it("keeps same-day events on the selected date", () => {
    const range = toCalendarEventIsoRange("2026-05-03", "20:45", "21:45");

    assert.equal(range.endDayOffset, 0);
    assert.ok(new Date(range.endsAt).getTime() > new Date(range.startsAt).getTime());
  });

  it("moves overnight event ends to the following date", () => {
    const range = toCalendarEventIsoRange("2026-05-03", "23:30", "00:30");

    assert.equal(range.endDayOffset, 1);
    assert.ok(new Date(range.endsAt).getTime() > new Date(range.startsAt).getTime());
  });

  it("does not treat all-day display ranges as overnight", () => {
    const range = toCalendarEventIsoRange("2026-05-03", "00:00", "23:59");

    assert.equal(range.endDayOffset, 0);
    assert.ok(new Date(range.endsAt).getTime() > new Date(range.startsAt).getTime());
  });
});
