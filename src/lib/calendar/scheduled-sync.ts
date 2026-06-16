import type { SupabaseClient } from "@supabase/supabase-js";
import { plannerData } from "@/lib/planner/schedule";
import { formatDateTimePartsInTimeZone, toCalendarEventIsoRange } from "./date-time";
import { parseIcsEvents } from "./ics";
import {
  compactIcsCalendarForImport,
  fetchCalendarText,
  getAllowedCalendarFetchUrl,
  getCalendarImportStartsOn,
  looksLikeIcsCalendar,
} from "./preview";
import type { AppliedCalendarEvent, CalendarSourceSchedule } from "./types";

const defaultScheduleTime = "05:00";

export type ScheduledCalendarSourceRow = {
  id: string;
  household_id: string;
  external_key: string;
  label: string;
  url: string | null;
  enabled: boolean;
  sync_mode: string;
  last_synced_at: string | null;
  last_applied_at: string | null;
  last_sync_status: string | null;
  last_sync_message: string | null;
  metadata: Record<string, unknown>;
  households?: {
    timezone: string;
  } | null;
};

export type ScheduledCalendarSyncResult = {
  eventCount: number;
  message: string;
  sourceId: string;
  status: "error" | "skipped" | "success";
};

export function getCalendarSourceSchedule(value: unknown): CalendarSourceSchedule | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const input = value as {
    lastAttemptedOn?: unknown;
    time?: unknown;
  };

  const time = typeof input.time === "string" && /^\d{2}:\d{2}$/.test(input.time) ? input.time : null;

  if (!time) {
    return undefined;
  }

  return {
    lastAttemptedOn:
      typeof input.lastAttemptedOn === "string" && input.lastAttemptedOn
        ? input.lastAttemptedOn
        : undefined,
    time,
  };
}

export function isScheduledCalendarSourceDue(source: ScheduledCalendarSourceRow, now = new Date()) {
  if (!source.enabled || source.sync_mode !== "scheduled" || !source.url) {
    return false;
  }

  const schedule = getCalendarSourceSchedule(source.metadata.scheduledSync);

  if (!schedule) {
    return false;
  }

  const timeZone = source.households?.timezone ?? plannerData.timezone;
  const localNow = formatDateTimePartsInTimeZone(now, timeZone);

  return (
    parseClockMinutes(localNow.time) >= parseClockMinutes(schedule.time) &&
    schedule.lastAttemptedOn !== localNow.date
  );
}

export async function syncScheduledCalendarSource(
  supabase: SupabaseClient,
  source: ScheduledCalendarSourceRow,
): Promise<ScheduledCalendarSyncResult> {
  const timeZone = source.households?.timezone ?? plannerData.timezone;
  const appliedAt = new Date().toISOString();
  const attemptDate = formatDateTimePartsInTimeZone(appliedAt, timeZone).date;

  try {
    if (!source.url) {
      throw new Error("Scheduled source is missing a shared calendar URL.");
    }

    const fetchUrl = await getAllowedCalendarFetchUrl(source.url);

    if (!fetchUrl) {
      throw new Error("Scheduled source URL must be a public http, https, or webcal calendar URL.");
    }

    const calendarText = await fetchCalendarText(fetchUrl);

    if (!looksLikeIcsCalendar(calendarText)) {
      throw new Error("Calendar response was not a valid ICS calendar.");
    }

    const startsOn = getCalendarImportStartsOn(plannerData.season.startsOn);
    const compactedCalendarText = compactIcsCalendarForImport(calendarText, {
      startsOn,
      endsOn: plannerData.season.endsOn,
    });
    const parsedEvents = parseIcsEvents(compactedCalendarText, {
      sourceId: source.external_key,
      startsOn,
      endsOn: plannerData.season.endsOn,
      timeZone,
    });
    const appliedEvents = parsedEvents.map<AppliedCalendarEvent>((event) => ({
      ...event,
      appliedAt,
      assignedMemberIds: getStringArray(source.metadata.defaultMemberIds),
      sourceLabel: source.label,
    }));

    const { error: deleteError } = await supabase
      .from("calendar_events")
      .delete()
      .eq("household_id", source.household_id)
      .eq("calendar_source_id", source.id);

    if (deleteError) {
      throw deleteError;
    }

    if (appliedEvents.length > 0) {
      const { error: insertError } = await supabase.from("calendar_events").insert(
        appliedEvents.map((event) =>
          mapAppliedEventToInsert(source.household_id, source.id, event, timeZone),
        ),
      );

      if (insertError) {
        throw insertError;
      }
    }

    const message = `Scheduled refresh applied ${appliedEvents.length} event${appliedEvents.length === 1 ? "" : "s"}.`;

    await updateScheduledSourceRun(supabase, source, {
      attemptDate,
      attemptedAt: appliedAt,
      message,
      status: "success",
    });

    return {
      eventCount: appliedEvents.length,
      message,
      sourceId: source.external_key,
      status: "success",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scheduled calendar refresh failed.";

    await updateScheduledSourceRun(supabase, source, {
      attemptDate,
      attemptedAt: appliedAt,
      message,
      status: "error",
    });

    return {
      eventCount: 0,
      message,
      sourceId: source.external_key,
      status: "error",
    };
  }
}

function mapAppliedEventToInsert(
  householdId: string,
  sourceRowId: string,
  event: AppliedCalendarEvent,
  timeZone: string,
) {
  const range = toCalendarEventIsoRange(event.date, event.startTime, event.endTime, timeZone);

  return {
    household_id: householdId,
    calendar_source_id: sourceRowId,
    source_event_uid: event.sourceUid ?? `${event.title}:${event.date}:${event.startTime}:${event.location ?? ""}`,
    title: event.title,
    category: event.category,
    starts_at: range.startsAt,
    ends_at: range.endsAt,
    all_day: event.startTime === "00:00" && event.endTime === "23:59",
    location: event.location ?? null,
    status: "active",
    metadata: {
      appliedAt: event.appliedAt,
      assignedMemberIds: event.assignedMemberIds,
      sourceId: event.sourceId,
      sourceLabel: event.sourceLabel,
      teamId: event.teamId,
      teamLabel: event.teamLabel,
      endDayOffset: range.endDayOffset,
    },
  };
}

async function updateScheduledSourceRun(
  supabase: SupabaseClient,
  source: ScheduledCalendarSourceRow,
  input: {
    attemptDate: string;
    attemptedAt: string;
    message: string;
    status: "error" | "success";
  },
) {
  const nextSchedule = {
    ...getCalendarSourceSchedule(source.metadata.scheduledSync),
    lastAttemptedOn: input.attemptDate,
    time: getCalendarSourceSchedule(source.metadata.scheduledSync)?.time ?? defaultScheduleTime,
  };
  const { error } = await supabase
    .from("calendar_sources")
    .update({
      last_applied_at: input.status === "success" ? input.attemptedAt : source.last_applied_at,
      last_synced_at: input.attemptedAt,
      last_sync_message: input.message,
      last_sync_status: input.status,
      metadata: {
        ...source.metadata,
        scheduledSync: nextSchedule,
      },
    })
    .eq("id", source.id)
    .eq("household_id", source.household_id);

  if (error) {
    throw error;
  }
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseClockMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);

  return hour * 60 + minute;
}
