import type { AppliedCalendarEvent } from "@/lib/calendar/types";

type AppliedCalendarEventIdentity = Pick<
  AppliedCalendarEvent,
  "sourceId" | "sourceUid" | "title" | "date" | "startTime" | "location"
>;

export function getAppliedCalendarEventAssignmentKey(
  event: Pick<AppliedCalendarEvent, "sourceId" | "sourceUid" | "title" | "date" | "startTime">,
) {
  return `imported:${event.sourceId}:${event.sourceUid ?? event.title}:${event.date}:${event.startTime}`;
}

export function getAppliedCalendarEventSourceUid(event: AppliedCalendarEventIdentity) {
  return event.sourceUid ?? `${event.title}:${event.date}:${event.startTime}:${event.location ?? ""}`;
}

export function isSameAppliedCalendarEvent(
  first: AppliedCalendarEventIdentity,
  second: AppliedCalendarEventIdentity,
) {
  return (
    first.sourceId === second.sourceId &&
    first.date === second.date &&
    first.startTime === second.startTime &&
    getAppliedCalendarEventSourceUid(first) === getAppliedCalendarEventSourceUid(second)
  );
}
