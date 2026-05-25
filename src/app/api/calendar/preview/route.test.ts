import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getAllowedCalendarFetchUrl, POST } from "./route";

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
});
