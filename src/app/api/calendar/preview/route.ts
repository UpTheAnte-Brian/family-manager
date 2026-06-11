import {
  compactIcsCalendarForImport,
  fetchCalendarText,
  getAllowedCalendarFetchUrl,
  getCalendarImportStartsOn,
  looksLikeIcsCalendar,
} from "@/lib/calendar/preview";
import { plannerData } from "@/lib/planner/schedule";

type PreviewRequest = {
  sourceId?: string;
  timeZone?: string;
  url?: string;
};

const previewExpansionLimit = 1000;

export async function POST(request: Request) {
  const body = await readPreviewRequest(request);

  if (!body) {
    return Response.json(
      {
        error: "Enter a valid calendar preview request.",
      },
      { status: 400 },
    );
  }

  const sourceId = body.sourceId?.trim() || "calendar-preview";
  const timeZone = body.timeZone?.trim() || plannerData.timezone;
  const url = body.url?.trim();
  const fetchUrl = await getAllowedCalendarFetchUrl(url);

  if (!fetchUrl) {
    return Response.json(
      {
        error: "Enter a public http, https, or webcal calendar URL.",
      },
      { status: 400 },
    );
  }

  let calendarText: string;

  try {
    calendarText = await fetchCalendarText(fetchUrl);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Calendar fetch failed.",
      },
      { status: 502 },
    );
  }

  if (!looksLikeIcsCalendar(calendarText)) {
    return Response.json(
      {
        error: "Calendar response was not a valid ICS calendar.",
      },
      { status: 422 },
    );
  }

  const startsOn = getCalendarImportStartsOn(plannerData.season.startsOn);
  const calendarImportText = compactIcsCalendarForImport(calendarText, {
    startsOn,
    endsOn: plannerData.season.endsOn,
  });
  let events;

  try {
    const { parseIcsEvents } = await import("@/lib/calendar/ics");
    events = parseIcsEvents(calendarImportText, {
      sourceId,
      startsOn,
      endsOn: plannerData.season.endsOn,
      timeZone,
      maxExpandedEvents: previewExpansionLimit,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Calendar parse failed.",
      },
      { status: 422 },
    );
  }

  return Response.json({
    sourceId,
    eventCount: events.length,
    events,
  });
}

async function readPreviewRequest(request: Request): Promise<PreviewRequest | null> {
  try {
    const body = await request.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return null;
    }

    return body as PreviewRequest;
  } catch {
    return null;
  }
}
