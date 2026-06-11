import ical from "node-ical";
import { formatDateTimePartsInTimeZone } from "./date-time";
import type { ImportedCalendarEvent } from "./types";
import { getSportsEngineTeamId, inferSportsTeamLabel } from "./team-tags";

export type ParseIcsOptions = {
  sourceId: string;
  startsOn: string;
  endsOn: string;
  timeZone?: string;
  limit?: number;
  maxExpandedEvents?: number;
};

type IcsDate = Date & {
  dateOnly?: true;
  tz?: string;
};

export function parseIcsEvents(calendarText: string, options: ParseIcsOptions) {
  const startsOn = parseDateOnly(options.startsOn);
  const endsOn = endOfDay(parseDateOnly(options.endsOn));
  const maxExpandedEvents = options.maxExpandedEvents ?? Number.POSITIVE_INFINITY;
  const timeZone = options.timeZone ?? "America/Chicago";
  const calendar = ical.sync.parseICS(calendarText);
  const events: ImportedCalendarEvent[] = [];

  for (const event of Object.values(calendar).filter(isCalendarEvent)) {
    const remaining = maxExpandedEvents - events.length;

    if (remaining <= 0) {
      break;
    }

    for (const expandedEvent of expandEvent(event, startsOn, endsOn, remaining)) {
      const importedEvent = toImportedEvent(expandedEvent, options.sourceId, timeZone);

      if (importedEvent) {
        events.push(importedEvent);
      }
    }
  }

  events.sort(compareImportedEvents);

  return typeof options.limit === "number" ? events.slice(0, options.limit) : events;
}

function isCalendarEvent(entry: ical.CalendarComponent | undefined): entry is ical.VEvent {
  return entry?.type === "VEVENT";
}

function expandEvent(event: ical.VEvent, startsOn: Date, endsOn: Date, maxEvents: number): ical.VEvent[] {
  if (!event.start) {
    return [];
  }

  const durationMs = event.end && event.start ? event.end.getTime() - event.start.getTime() : 0;

  if (maxEvents <= 0) {
    return [];
  }

  if (!event.rrule) {
    return overlapsWindow(event.start, event.end, startsOn, endsOn) ? [event] : [];
  }

  const events: ical.VEvent[] = [];
  let cursor = startsOn;
  let includeCursor = true;

  while (events.length < maxEvents) {
    const start = event.rrule.after(cursor, includeCursor);

    if (!start || start > endsOn) {
      break;
    }

    const recurrenceStart = copyIcsDateMetadata(start, event.start);
    const recurrenceEnd = copyIcsDateMetadata(
      new Date(start.getTime() + durationMs),
      event.end ?? event.start,
    );

    events.push({
      ...event,
      start: recurrenceStart,
      end: recurrenceEnd,
      recurrenceid: recurrenceStart,
    });

    cursor = start;
    includeCursor = false;
  }

  return events;
}

function toImportedEvent(
  event: ical.VEvent,
  sourceId: string,
  timeZone: string,
): ImportedCalendarEvent | null {
  if (!event.start || !event.summary) {
    return null;
  }

  const start = event.start;
  const end = event.end ?? event.start;
  const allDay = isAllDay(event);
  const startParts = allDay
    ? { date: formatDate(start), time: "00:00" }
    : formatTimedParts(start, timeZone);
  const endParts = allDay
    ? { date: formatDate(end), time: "23:59" }
    : formatTimedParts(end, timeZone);
  const title = String(event.summary).trim();
  const teamId = getSportsEngineTeamId(event.description);
  const teamLabel = inferSportsTeamLabel({
    description: event.description ? String(event.description) : undefined,
    sourceId,
    teamId,
    title,
  });

  return {
    sourceId,
    sourceUid: event.uid,
    ...(teamId ? { teamId } : {}),
    ...(teamLabel ? { teamLabel } : {}),
    title,
    date: startParts.date,
    startTime: startParts.time,
    endTime: endParts.time,
    ...(event.location ? { location: String(event.location) } : {}),
    category: inferCategory(title, sourceId),
  };
}

function overlapsWindow(start: Date | undefined, end: Date | undefined, windowStart: Date, windowEnd: Date) {
  if (!start) {
    return false;
  }

  const effectiveEnd = end ?? start;
  return start <= windowEnd && effectiveEnd >= windowStart;
}

function isAllDay(event: ical.VEvent) {
  if (event.datetype === "date") {
    return true;
  }

  const start = event.start;
  const end = event.end;

  return (
    start instanceof Date &&
    end instanceof Date &&
    start.getHours() === 0 &&
    start.getMinutes() === 0 &&
    end.getHours() === 0 &&
    end.getMinutes() === 0 &&
    end.getTime() - start.getTime() >= 24 * 60 * 60 * 1000
  );
}

function inferCategory(title: string, sourceId: string) {
  const normalized = title.toLowerCase();
  const normalizedSourceId = sourceId.toLowerCase();

  if (normalizedSourceId.includes("sports")) return "sports";

  if (normalized.includes("birthday")) return "birthday";
  if (normalized.includes("doctor") || normalized.includes("dentist")) return "appointment";
  if (normalized.includes("soccer") || normalized.includes("select") || normalized.includes("u9")) return "sports";
  if (normalized.includes("school") || normalized.includes("camp")) return "school-camp";
  if (normalized.includes("bill")) return "admin";

  return "family-calendar";
}

function compareImportedEvents(a: ImportedCalendarEvent, b: ImportedCalendarEvent) {
  return `${a.date} ${a.startTime} ${a.title}`.localeCompare(`${b.date} ${b.startTime} ${b.title}`);
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatTimedParts(date: Date, timeZone: string) {
  if (getIcsTimeZone(date)) {
    return formatDateTimePartsInTimeZone(date, timeZone);
  }

  return {
    date: formatDate(date),
    time: formatTime(date),
  };
}

function getIcsTimeZone(date: Date) {
  return (date as IcsDate).tz;
}

function copyIcsDateMetadata(date: Date, source: Date) {
  const nextDate = date as IcsDate;
  const sourceDate = source as IcsDate;

  if (sourceDate.tz) {
    nextDate.tz = sourceDate.tz;
  }

  if (sourceDate.dateOnly) {
    nextDate.dateOnly = sourceDate.dateOnly;
  }

  return nextDate;
}
