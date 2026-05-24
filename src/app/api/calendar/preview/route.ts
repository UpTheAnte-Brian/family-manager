import { plannerData } from "@/lib/planner/schedule";

type PreviewRequest = {
  sourceId?: string;
  url?: string;
};

export async function POST(request: Request) {
  const body = (await request.json()) as PreviewRequest;
  const sourceId = body.sourceId?.trim() || "calendar-preview";
  const url = body.url?.trim();

  if (!url || !isAllowedCalendarUrl(url)) {
    return Response.json(
      {
        error: "Enter an http, https, or webcal calendar URL.",
      },
      { status: 400 },
    );
  }

  const fetchUrl = url.replace(/^webcal:\/\//i, "https://");
  const response = await fetch(fetchUrl, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    return Response.json(
      {
        error: `Calendar fetch failed: ${response.status} ${response.statusText}`,
      },
      { status: 502 },
    );
  }

  const calendarText = await response.text();
  const { parseIcsEvents } = await import("@/lib/calendar/ics");
  const events = parseIcsEvents(calendarText, {
    sourceId,
    startsOn: plannerData.season.startsOn,
    endsOn: plannerData.season.endsOn,
    limit: 20,
  });

  return Response.json({
    sourceId,
    eventCount: events.length,
    events,
  });
}

function isAllowedCalendarUrl(value: string) {
  return /^(https?|webcal):\/\//i.test(value);
}
