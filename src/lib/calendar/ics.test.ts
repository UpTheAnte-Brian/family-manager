import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseIcsEvents } from "./ics";

describe("parseIcsEvents", () => {
  it("parses a normal one-off ICS event", () => {
    const events = parseIcsEvents(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:family-dinner",
        "DTSTART:20260604T230000Z",
        "DTEND:20260605T000000Z",
        "SUMMARY:Family dinner",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
      {
        sourceId: "family",
        startsOn: "2026-06-01",
        endsOn: "2026-06-30",
      },
    );

    assert.equal(events.length, 1);
    assert.equal(events[0].sourceId, "family");
    assert.equal(events[0].sourceUid, "family-dinner");
    assert.equal(events[0].title, "Family dinner");
  });

  it("caps recurring event expansion before returning events", () => {
    const events = parseIcsEvents(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:daily-camp",
        "DTSTART:20260601T140000Z",
        "DTEND:20260601T150000Z",
        "RRULE:FREQ=DAILY;COUNT=20",
        "SUMMARY:Summer camp",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
      {
        sourceId: "school",
        startsOn: "2026-06-01",
        endsOn: "2026-06-30",
        limit: 20,
        maxExpandedEvents: 3,
      },
    );

    assert.equal(events.length, 3);
    assert.deepEqual(
      events.map((event) => event.date),
      ["2026-06-01", "2026-06-02", "2026-06-03"],
    );
  });
});
