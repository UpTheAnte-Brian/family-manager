import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { compactIcsCalendarForImport, getAllowedCalendarFetchUrl, POST } from "./route";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Calendar preview route", () => {
  it("returns 400 for malformed JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/calendar/preview", {
        body: "{",
        method: "POST",
      }),
    );

    assert.equal(response.status, 400);
  });

  it("rejects private and local calendar hosts", async () => {
    const blockedUrls = [
      "http://127.0.0.1/calendar.ics",
      "http://localhost/calendar.ics",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.1/calendar.ics",
      "http://172.16.0.1/calendar.ics",
      "http://192.168.1.1/calendar.ics",
      "http://[::1]/calendar.ics",
      "http://[fc00::1]/calendar.ics",
      "http://[fe80::1]/calendar.ics",
      "http://printer.local/calendar.ics",
    ];

    for (const url of blockedUrls) {
      assert.equal(await getAllowedCalendarFetchUrl(url), null, url);
    }
  });

  it("rejects DNS names that resolve to private addresses", async () => {
    const url = await getAllowedCalendarFetchUrl(
      "https://calendar.example.com/family.ics",
      undefined,
      async () => ["192.168.1.10"],
    );

    assert.equal(url, null);
  });

  it("accepts a normal public HTTPS calendar URL", async () => {
    const url = await getAllowedCalendarFetchUrl(
      "https://calendar.example.com/family.ics",
      undefined,
      async () => ["93.184.216.34"],
    );

    assert.equal(url, "https://calendar.example.com/family.ics");
  });

  it("rejects redirects to private hosts", async () => {
    globalThis.fetch = async () =>
      new Response(null, {
        headers: {
          location: "http://127.0.0.1/calendar.ics",
        },
        status: 302,
      });

    const response = await POST(
      new Request("http://localhost/api/calendar/preview", {
        body: JSON.stringify({
          url: "https://93.184.216.34/calendar.ics",
        }),
        method: "POST",
      }),
    );

    assert.equal(response.status, 502);
  });

  it("previews a public calendar URL", async () => {
    globalThis.fetch = async () =>
      new Response(
        [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "BEGIN:VEVENT",
          "UID:test-event",
          "DTSTART:20260603T140000Z",
          "DTEND:20260603T150000Z",
          "SUMMARY:Soccer practice",
          "END:VEVENT",
          "END:VCALENDAR",
        ].join("\r\n"),
      );

    const response = await POST(
      new Request("http://localhost/api/calendar/preview", {
        body: JSON.stringify({
          sourceId: "sports",
          url: "https://93.184.216.34/calendar.ics",
        }),
        method: "POST",
      }),
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.eventCount, 1);
    assert.equal(body.events[0].title, "Soccer practice");
  });

  it("previews a SportsEngine-style calendar URL", async () => {
    globalThis.fetch = async () =>
      new Response(
        [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//sportsengine.com//ical-feed-v2//EN",
          "NAME:My SportsEngine Events",
          "X-WR-CALNAME:My SportsEngine Events",
          "BEGIN:VEVENT",
          "UID:08f63bb3-b957-4f3c-a2ad-155a342cf891@sportsengine.com",
          "SEQUENCE:1747251567",
          "DTSTAMP:20250514T193927Z",
          "DTSTART;TZID=America/Chicago:20260603T184500",
          "DTEND;TZID=America/Chicago:20260603T194500",
          "SUMMARY:FURY U8@Orono",
          "LOCATION:ORONO",
          "DESCRIPTION:https://sportsengine.app.link/?al=sportsengine%3A%2F%2Fevent%2",
          " F08f63bb3-b957-4f3c-a2ad-155a342cf891",
          "END:VEVENT",
          "END:VCALENDAR",
        ].join("\r\n"),
      );

    const response = await POST(
      new Request("http://localhost/api/calendar/preview", {
        body: JSON.stringify({
          sourceId: "sports-calendar",
          url: "https://ical.sportsengine.com/v3/calendar/ical?uuid=test",
        }),
        method: "POST",
      }),
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.eventCount, 1);
    assert.equal(body.events[0].title, "FURY U8@Orono");
    assert.equal(body.events[0].category, "sports");
  });

  it("returns every event in the planner window instead of only the first preview rows", async () => {
    const eventBlocks = Array.from({ length: 21 }, (_, index) => {
      const day = String(index + 1).padStart(2, "0");

      return [
        "BEGIN:VEVENT",
        `UID:test-event-${index}`,
        `DTSTART:202607${day}T140000Z`,
        `DTEND:202607${day}T150000Z`,
        `SUMMARY:Soccer practice ${index + 1}`,
        "END:VEVENT",
      ].join("\r\n");
    });

    globalThis.fetch = async () =>
      new Response(["BEGIN:VCALENDAR", "VERSION:2.0", ...eventBlocks, "END:VCALENDAR"].join("\r\n"));

    const response = await POST(
      new Request("http://localhost/api/calendar/preview", {
        body: JSON.stringify({
          sourceId: "sports",
          url: "https://93.184.216.34/calendar.ics",
        }),
        method: "POST",
      }),
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.eventCount, 21);
    assert.equal(body.events.length, 21);
  });

  it("compacts old one-off calendar events before parsing", () => {
    const calendarText = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:old-event",
      "DTSTART:20240101T140000Z",
      "DTEND:20240101T150000Z",
      "SUMMARY:Old appointment",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:current-event",
      "DTSTART:20260603T140000Z",
      "DTEND:20260603T150000Z",
      "SUMMARY:Current appointment",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:recurring-event",
      "DTSTART:20240101T140000Z",
      "DTEND:20240101T150000Z",
      "RRULE:FREQ=YEARLY",
      "SUMMARY:Recurring appointment",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const compacted = compactIcsCalendarForImport(calendarText, {
      startsOn: "2026-05-01",
      endsOn: "2026-08-31",
    });

    assert.doesNotMatch(compacted, /Old appointment/);
    assert.match(compacted, /Current appointment/);
    assert.match(compacted, /Recurring appointment/);
  });

  it("includes the month before the configured season starts", async () => {
    globalThis.fetch = async () =>
      new Response(
        [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "BEGIN:VEVENT",
          "UID:may-event",
          "DTSTART:20260528T140000Z",
          "DTEND:20260528T150000Z",
          "SUMMARY:May soccer practice",
          "END:VEVENT",
          "END:VCALENDAR",
        ].join("\r\n"),
      );

    const response = await POST(
      new Request("http://localhost/api/calendar/preview", {
        body: JSON.stringify({
          sourceId: "sports",
          url: "https://93.184.216.34/calendar.ics",
        }),
        method: "POST",
      }),
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.eventCount, 1);
    assert.equal(body.events[0].date, "2026-05-28");
  });

  it("returns JSON when a calendar cannot be parsed", async () => {
    globalThis.fetch = async () => new Response("not an ics calendar");

    const response = await POST(
      new Request("http://localhost/api/calendar/preview", {
        body: JSON.stringify({
          sourceId: "sports",
          url: "https://93.184.216.34/calendar.ics",
        }),
        method: "POST",
      }),
    );
    const body = await response.json();

    assert.equal(response.status, 422);
    assert.equal(typeof body.error, "string");
  });
});
