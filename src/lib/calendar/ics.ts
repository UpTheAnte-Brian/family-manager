import ical from "node-ical";
import type { ImportedCalendarEvent } from "./types";

export type ParseIcsOptions = {
  sourceId: string;
  startsOn: string;
  endsOn: string;
  limit?: number;
};

export function parseIcsEvents(calendarText: string, options: ParseIcsOptions) {
  const startsOn = parseDateOnly(options.startsOn);
  const endsOn = endOfDay(parseDateOnly(options.endsOn));
  const calendar = ical.sync.parseICS(calendarText);
  const events = Object.values(calendar)
    .filter(isCalendarEvent)
    .flatMap((event) => expandEvent(event, startsOn, endsOn))
    .map((event) => toImportedEvent(event, options.sourceId))
    .filter((event): event is ImportedCalendarEvent => Boolean(event))
    .sort(compareImportedEvents);

  return typeof options.limit === "number" ? events.slice(0, options.limit) : events;
}

function isCalendarEvent(entry: ical.CalendarComponent | undefined): entry is ical.VEvent {
  return entry?.type === "VEVENT";
}

function expandEvent(event: ical.VEvent, startsOn: Date, endsOn: Date): ical.VEvent[] {
  const durationMs = event.end && event.start ? event.end.getTime() - event.start.getTime() : 0;

  if (!event.rrule) {
    return overlapsWindow(event.start, event.end, startsOn, endsOn) ? [event] : [];
  }

  return event.rrule.between(startsOn, endsOn, true).map((start) => ({
    ...event,
    start,
    end: new Date(start.getTime() + durationMs),
    recurrenceid: start,
  }));
}

function toImportedEvent(event: ical.VEvent, sourceId: string): ImportedCalendarEvent | null {
  if (!event.start || !event.summary) {
    return null;
  }

  const start = event.start;
  const end = event.end ?? event.start;
  const allDay = isAllDay(event);
  const title = String(event.summary).trim();

  return {
    sourceId,
    sourceUid: event.uid,
    title,
    date: formatDate(start),
    startTime: allDay ? "00:00" : formatTime(start),
    endTime: allDay ? "23:59" : formatTime(end),
    ...(event.location ? { location: String(event.location) } : {}),
    category: inferCategory(title),
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

function inferCategory(title: string) {
  const normalized = title.toLowerCase();

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
