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
    assert.equal(events[0].date, "2026-06-04");
    assert.equal(events[0].startTime, "18:00");
    assert.equal(events[0].endTime, "19:00");
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
    assert.deepEqual(
      events.map((event) => event.startTime),
      ["09:00", "09:00", "09:00"],
    );
  });

  it("extracts SportsEngine team identity from descriptions", () => {
    const events = parseIcsEvents(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:fury-event",
        "DTSTART;TZID=America/Chicago:20260504T130000",
        "DTEND;TZID=America/Chicago:20260504T140000",
        "SUMMARY:Pract@Orono",
        "DESCRIPTION:https://app.sportngin.com/teams/11ef80ea-d381-d21c-9316-4a0e92f31379/schedule/event/fury-event?team_id=11ef80ea-d381-d21c-9316-4a0e92f31379&type=event",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
      {
        sourceId: "sports-calendar",
        startsOn: "2026-05-01",
        endsOn: "2026-05-31",
        timeZone: "America/Chicago",
      },
    );

    assert.equal(events.length, 1);
    assert.equal(events[0].teamId, "11ef80ea-d381-d21c-9316-4a0e92f31379");
    assert.equal(events[0].teamLabel, "FURY U8");
    assert.equal(events[0].date, "2026-05-04");
    assert.equal(events[0].startTime, "13:00");
    assert.equal(events[0].endTime, "14:00");
  });

  it("keeps floating timed events as household-local wall times", () => {
    const events = parseIcsEvents(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:floating-event",
        "DTSTART:20260603T184500",
        "DTEND:20260603T194500",
        "SUMMARY:Floating practice",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
      {
        sourceId: "sports-calendar",
        startsOn: "2026-06-01",
        endsOn: "2026-06-30",
        timeZone: "America/Chicago",
      },
    );

    assert.equal(events.length, 1);
    assert.equal(events[0].date, "2026-06-03");
    assert.equal(events[0].startTime, "18:45");
    assert.equal(events[0].endTime, "19:45");
  });

  it("does not shift all-day event dates into the household timezone", () => {
    const events = parseIcsEvents(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:all-day-event",
        "DTSTART;VALUE=DATE:20260603",
        "DTEND;VALUE=DATE:20260604",
        "SUMMARY:No school",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
      {
        sourceId: "school-calendar",
        startsOn: "2026-06-01",
        endsOn: "2026-06-30",
        timeZone: "America/Chicago",
      },
    );

    assert.equal(events.length, 1);
    assert.equal(events[0].date, "2026-06-03");
    assert.equal(events[0].startTime, "00:00");
    assert.equal(events[0].endTime, "23:59");
  });
});
