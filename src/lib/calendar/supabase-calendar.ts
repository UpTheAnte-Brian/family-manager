"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  appliedCalendarEventsStorageKey,
  calendarSourcesStorageKey,
} from "@/lib/calendar/storage";
import { toCalendarEventIsoRange } from "@/lib/calendar/date-time";
import type {
  AppliedCalendarEvent,
  CalendarSource,
  CalendarSourceKind,
} from "@/lib/calendar/types";
import { useLocalStorageState } from "@/lib/storage/local";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useCurrentHousehold } from "@/lib/supabase/household";

type CalendarFeedStatus = "local" | "loading" | "supabase" | "error";

type StoredValueSetter<T> = T | ((current: T) => T);

type CalendarSourceRow = {
  id: string;
  household_id: string;
  external_key: string;
  label: string;
  source_kind: string;
  url: string | null;
  enabled: boolean;
  sync_mode: string;
  default_visibility: string;
  notes: string | null;
  last_synced_at: string | null;
  last_applied_at: string | null;
  last_sync_status: string | null;
  last_sync_message: string | null;
  metadata: Record<string, unknown>;
};

type CalendarEventRow = {
  calendar_source_id: string | null;
  source_event_uid: string | null;
  title: string;
  category: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  metadata: Record<string, unknown>;
  calendar_sources?: {
    external_key: string;
    label: string;
  } | null;
};

type RemoteCalendarFeedCache = {
  appliedEvents: AppliedCalendarEvent[];
  errorMessage: string;
  householdId?: string;
  sources: CalendarSource[];
  status: CalendarFeedStatus;
};

export type ManualCalendarEventInput = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location?: string;
  category: string;
  assignedMemberIds: string[];
};

const emptyCalendarSources: CalendarSource[] = [];
const emptyAppliedEvents: AppliedCalendarEvent[] = [];
let remoteCalendarFeedCache: RemoteCalendarFeedCache = {
  appliedEvents: emptyAppliedEvents,
  errorMessage: "",
  sources: emptyCalendarSources,
  status: "loading",
};
const manualCalendarSource: CalendarSource = {
  id: "manual-household",
  label: "Manual household events",
  kind: "manual-upload",
  enabled: true,
  syncMode: "manual",
  defaultVisibility: "family",
  defaultMemberIds: [],
  notes: "App-only events entered from Family Manager.",
};

export function useCalendarFeed() {
  const [localSources, setLocalSources] = useLocalStorageState<CalendarSource[]>(
    calendarSourcesStorageKey,
    emptyCalendarSources,
  );
  const [localAppliedEvents, setLocalAppliedEvents] = useLocalStorageState<AppliedCalendarEvent[]>(
    appliedCalendarEventsStorageKey,
    emptyAppliedEvents,
  );
  const { household, status: householdStatus } = useCurrentHousehold();
  const cachedRemoteFeed =
    household?.householdId && remoteCalendarFeedCache.householdId === household.householdId
      ? remoteCalendarFeedCache
      : null;
  const [remoteSources, setRemoteSources] = useState<CalendarSource[]>(
    cachedRemoteFeed?.sources ?? emptyCalendarSources,
  );
  const [remoteAppliedEvents, setRemoteAppliedEvents] = useState<AppliedCalendarEvent[]>(
    cachedRemoteFeed?.appliedEvents ?? emptyAppliedEvents,
  );
  const [status, setStatus] = useState<CalendarFeedStatus>(cachedRemoteFeed?.status ?? "loading");
  const [errorMessage, setErrorMessage] = useState(cachedRemoteFeed?.errorMessage ?? "");

  const householdId = household?.householdId;
  const usesSupabase = Boolean(householdId);
  const shouldUseRemoteFeed = usesSupabase || householdStatus === "loading";
  const sources = shouldUseRemoteFeed ? remoteSources : localSources;
  const appliedEvents = shouldUseRemoteFeed ? remoteAppliedEvents : localAppliedEvents;

  const cacheRemoteFeed = useCallback(
    (nextValue: {
      appliedEvents?: AppliedCalendarEvent[];
      errorMessage?: string;
      sources?: CalendarSource[];
      status?: CalendarFeedStatus;
    }) => {
      if (!householdId) {
        return;
      }

      const previous =
        remoteCalendarFeedCache.householdId === householdId
          ? remoteCalendarFeedCache
          : {
              appliedEvents: emptyAppliedEvents,
              errorMessage: "",
              sources: emptyCalendarSources,
              status: "loading" as const,
            };

      remoteCalendarFeedCache = {
        appliedEvents: nextValue.appliedEvents ?? previous.appliedEvents,
        errorMessage: nextValue.errorMessage ?? previous.errorMessage,
        householdId,
        sources: nextValue.sources ?? previous.sources,
        status: nextValue.status ?? previous.status,
      };
    },
    [householdId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!householdId) {
        setRemoteSources(emptyCalendarSources);
        setRemoteAppliedEvents(emptyAppliedEvents);
        return;
      }

      if (remoteCalendarFeedCache.householdId === householdId) {
        setRemoteSources(remoteCalendarFeedCache.sources);
        setRemoteAppliedEvents(remoteCalendarFeedCache.appliedEvents);
        setStatus(remoteCalendarFeedCache.status);
        setErrorMessage(remoteCalendarFeedCache.errorMessage);
        return;
      }

      setRemoteSources(emptyCalendarSources);
      setRemoteAppliedEvents(emptyAppliedEvents);
      setStatus("loading");
      setErrorMessage("");
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [householdId]);

  const refresh = useCallback(async () => {
    if (!householdId) {
      setStatus(householdStatus === "loading" ? "loading" : "local");
      setErrorMessage("");
      return;
    }

    try {
      setStatus(remoteAppliedEvents.length > 0 || remoteSources.length > 0 ? "supabase" : "loading");
      setErrorMessage("");
      cacheRemoteFeed({
        errorMessage: "",
        status: remoteAppliedEvents.length > 0 || remoteSources.length > 0 ? "supabase" : "loading",
      });

      const supabase = createBrowserSupabaseClient();
      const { data: sourceRows, error: sourceError } = await supabase
        .from("calendar_sources")
        .select(
          "id, household_id, external_key, label, source_kind, url, enabled, sync_mode, default_visibility, notes, last_synced_at, last_applied_at, last_sync_status, last_sync_message, metadata",
        )
        .eq("household_id", householdId)
        .order("label", { ascending: true })
        .returns<CalendarSourceRow[]>();

      if (sourceError) {
        throw sourceError;
      }

      const { data: eventRows, error: eventError } = await supabase
        .from("calendar_events")
        .select(
          "calendar_source_id, source_event_uid, title, category, starts_at, ends_at, all_day, location, metadata, calendar_sources(external_key, label)",
        )
        .eq("household_id", householdId)
        .eq("status", "active")
        .order("starts_at", { ascending: true })
        .returns<CalendarEventRow[]>();

      if (eventError) {
        throw eventError;
      }

      const nextSources = (sourceRows ?? []).map(mapSourceRow);
      const nextAppliedEvents = (eventRows ?? []).map(mapEventRow);

      setRemoteSources(nextSources);
      setRemoteAppliedEvents(nextAppliedEvents);
      setStatus("supabase");
      cacheRemoteFeed({
        appliedEvents: nextAppliedEvents,
        errorMessage: "",
        sources: nextSources,
        status: "supabase",
      });
    } catch (error) {
      setStatus("error");
      const nextErrorMessage = error instanceof Error ? error.message : "Could not load calendar data.";
      setErrorMessage(nextErrorMessage);
      cacheRemoteFeed({
        errorMessage: nextErrorMessage,
        status: "error",
      });
    }
  }, [
    cacheRemoteFeed,
    householdId,
    householdStatus,
    remoteAppliedEvents.length,
    remoteSources.length,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [refresh]);

  const setSources = useCallback(
    (nextValue: StoredValueSetter<CalendarSource[]>) => {
      if (!usesSupabase) {
        setLocalSources(nextValue);
        return;
      }

      setRemoteSources((current) => {
        const resolvedSources = resolveStoredValue(nextValue, current);
        cacheRemoteFeed({ sources: resolvedSources });
        return resolvedSources;
      });
    },
    [cacheRemoteFeed, setLocalSources, usesSupabase],
  );

  const setAppliedEvents = useCallback(
    (nextValue: StoredValueSetter<AppliedCalendarEvent[]>) => {
      if (!usesSupabase) {
        setLocalAppliedEvents(nextValue);
        return;
      }

      setRemoteAppliedEvents((current) => {
        const resolvedAppliedEvents = resolveStoredValue(nextValue, current);
        cacheRemoteFeed({ appliedEvents: resolvedAppliedEvents });
        return resolvedAppliedEvents;
      });
    },
    [cacheRemoteFeed, setLocalAppliedEvents, usesSupabase],
  );

  const saveSource = useCallback(
    async (source: CalendarSource) => {
      if (!householdId) {
        return;
      }

      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase.from("calendar_sources").upsert(
        {
          household_id: householdId,
          external_key: source.id,
          label: source.label,
          source_kind: source.kind,
          url: source.url ?? null,
          enabled: source.enabled,
          sync_mode: source.syncMode,
          default_visibility: source.defaultVisibility,
          notes: source.notes ?? null,
          last_synced_at: source.lastSyncedAt ?? null,
          last_applied_at: source.lastAppliedAt ?? null,
          last_sync_status: source.lastSyncStatus ?? null,
          last_sync_message: source.lastSyncMessage ?? null,
          metadata: {
            defaultMemberIds: source.defaultMemberIds,
          },
        },
        {
          onConflict: "household_id,external_key",
        },
      );

      if (error) {
        throw error;
      }
    },
    [householdId],
  );

  const removeSource = useCallback(
    async (sourceId: string) => {
      if (!householdId) {
        setLocalSources((current) => current.filter((source) => source.id !== sourceId));
        setLocalAppliedEvents((current) => current.filter((event) => event.sourceId !== sourceId));
        return;
      }

      setRemoteSources((current) => current.filter((source) => source.id !== sourceId));
      setRemoteAppliedEvents((current) => current.filter((event) => event.sourceId !== sourceId));
      cacheRemoteFeed({
        appliedEvents: remoteAppliedEvents.filter((event) => event.sourceId !== sourceId),
        sources: remoteSources.filter((source) => source.id !== sourceId),
      });

      const supabase = createBrowserSupabaseClient();
      const { data: sourceRow, error: sourceError } = await supabase
        .from("calendar_sources")
        .select("id")
        .eq("household_id", householdId)
        .eq("external_key", sourceId)
        .maybeSingle<{ id: string }>();

      if (sourceError) {
        throw sourceError;
      }

      if (sourceRow) {
        const { error: eventError } = await supabase
          .from("calendar_events")
          .delete()
          .eq("household_id", householdId)
          .eq("calendar_source_id", sourceRow.id);

        if (eventError) {
          throw eventError;
        }
      }

      const { error } = await supabase
        .from("calendar_sources")
        .delete()
        .eq("household_id", householdId)
        .eq("external_key", sourceId);

      if (error) {
        throw error;
      }
    },
    [cacheRemoteFeed, householdId, remoteAppliedEvents, remoteSources, setLocalAppliedEvents, setLocalSources],
  );

  const applySourceEvents = useCallback(
    async (source: CalendarSource, nextEvents: AppliedCalendarEvent[]) => {
      if (!householdId) {
        setLocalAppliedEvents((current) => [
          ...current.filter((event) => event.sourceId !== source.id),
          ...nextEvents,
        ]);
        return;
      }

      await saveSource(source);

      const supabase = createBrowserSupabaseClient();
      const { data: sourceRow, error: sourceError } = await supabase
        .from("calendar_sources")
        .select("id")
        .eq("household_id", householdId)
        .eq("external_key", source.id)
        .single<{ id: string }>();

      if (sourceError) {
        throw sourceError;
      }

      const { error: deleteError } = await supabase
        .from("calendar_events")
        .delete()
        .eq("household_id", householdId)
        .eq("calendar_source_id", sourceRow.id);

      if (deleteError) {
        throw deleteError;
      }

      if (nextEvents.length > 0) {
        const { error: insertError } = await supabase.from("calendar_events").insert(
          nextEvents.map((event) => mapEventToInsert(householdId, sourceRow.id, event)),
        );

        if (insertError) {
          throw insertError;
        }
      }

      setRemoteAppliedEvents((current) => {
        const nextAppliedEvents = [
          ...current.filter((event) => event.sourceId !== source.id),
          ...nextEvents,
        ];
        cacheRemoteFeed({ appliedEvents: nextAppliedEvents });
        return nextAppliedEvents;
      });
    },
    [cacheRemoteFeed, householdId, saveSource, setLocalAppliedEvents],
  );

  const saveManualEvent = useCallback(
    async (input: ManualCalendarEventInput) => {
      const now = new Date().toISOString();
      const event: AppliedCalendarEvent = {
        sourceId: manualCalendarSource.id,
        sourceUid: `manual:${input.date}:${input.startTime}:${crypto.randomUUID()}`,
        title: input.title,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        location: input.location || undefined,
        category: input.category,
        sourceLabel: manualCalendarSource.label,
        assignedMemberIds: input.assignedMemberIds,
        appliedAt: now,
      };

      if (!householdId) {
        setLocalSources((current) =>
          current.some((source) => source.id === manualCalendarSource.id)
            ? current
            : [...current, manualCalendarSource],
        );
        setLocalAppliedEvents((current) => [...current, event]);
        return;
      }

      await saveSource(manualCalendarSource);

      const supabase = createBrowserSupabaseClient();
      const { data: sourceRow, error: sourceError } = await supabase
        .from("calendar_sources")
        .select("id")
        .eq("household_id", householdId)
        .eq("external_key", manualCalendarSource.id)
        .single<{ id: string }>();

      if (sourceError) {
        throw sourceError;
      }

      const { error } = await supabase
        .from("calendar_events")
        .insert(mapEventToInsert(householdId, sourceRow.id, event));

      if (error) {
        throw error;
      }

      setRemoteSources((current) => {
        const nextSources = current.some((source) => source.id === manualCalendarSource.id)
          ? current
          : [...current, manualCalendarSource];
        cacheRemoteFeed({ sources: nextSources });
        return nextSources;
      });
      setRemoteAppliedEvents((current) => {
        const nextAppliedEvents = [...current, event];
        cacheRemoteFeed({ appliedEvents: nextAppliedEvents });
        return nextAppliedEvents;
      });
    },
    [cacheRemoteFeed, householdId, saveSource, setLocalAppliedEvents, setLocalSources],
  );

  return useMemo(
    () => ({
      appliedEvents,
      applySourceEvents,
      errorMessage,
      refresh,
      removeSource,
      saveManualEvent,
      saveSource,
      setAppliedEvents,
      setSources,
      sources,
      status,
      usesSupabase,
    }),
    [
      appliedEvents,
      applySourceEvents,
      errorMessage,
      refresh,
      removeSource,
      saveManualEvent,
      saveSource,
      setAppliedEvents,
      setSources,
      sources,
      status,
      usesSupabase,
    ],
  );
}

function resolveStoredValue<T>(nextValue: StoredValueSetter<T>, current: T) {
  return typeof nextValue === "function" ? (nextValue as (current: T) => T)(current) : nextValue;
}

function mapSourceRow(row: CalendarSourceRow): CalendarSource {
  return {
    id: row.external_key,
    label: row.label,
    kind: row.source_kind as CalendarSourceKind,
    url: row.url ?? undefined,
    enabled: row.enabled,
    syncMode: row.sync_mode === "scheduled" ? "scheduled" : "manual",
    defaultVisibility:
      row.default_visibility === "parents" || row.default_visibility === "assigned-members"
        ? row.default_visibility
        : "family",
    defaultMemberIds: getStringArray(row.metadata.defaultMemberIds),
    lastSyncedAt: row.last_synced_at ?? undefined,
    lastAppliedAt: row.last_applied_at ?? undefined,
    lastSyncStatus:
      row.last_sync_status === "success" || row.last_sync_status === "error" || row.last_sync_status === "never"
        ? row.last_sync_status
        : undefined,
    lastSyncMessage: row.last_sync_message ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function mapEventRow(row: CalendarEventRow): AppliedCalendarEvent {
  const dateParts = formatDateTimeParts(row.starts_at);
  const endParts = formatDateTimeParts(row.ends_at);
  const metadata = row.metadata;

  return {
    sourceId: row.calendar_sources?.external_key ?? String(metadata.sourceId ?? "calendar-source"),
    sourceUid: row.source_event_uid ?? undefined,
    teamId: getOptionalString(metadata.teamId),
    teamLabel: getOptionalString(metadata.teamLabel),
    title: row.title,
    date: dateParts.date,
    startTime: row.all_day ? "00:00" : dateParts.time,
    endTime: row.all_day ? "23:59" : endParts.time,
    location: row.location ?? undefined,
    category: row.category,
    sourceLabel: row.calendar_sources?.label ?? getOptionalString(metadata.sourceLabel) ?? "Calendar",
    assignedMemberIds: getStringArray(metadata.assignedMemberIds),
    appliedAt: getOptionalString(metadata.appliedAt) ?? row.starts_at,
  };
}

function mapEventToInsert(
  householdId: string,
  sourceRowId: string,
  event: AppliedCalendarEvent,
) {
  const range = toCalendarEventIsoRange(event.date, event.startTime, event.endTime);

  return {
    household_id: householdId,
    calendar_source_id: sourceRowId,
    source_event_uid: event.sourceUid ?? getFallbackEventUid(event),
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

function formatDateTimeParts(value: string) {
  const date = new Date(value);

  return {
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
  };
}

function getFallbackEventUid(event: AppliedCalendarEvent) {
  return `${event.title}:${event.date}:${event.startTime}:${event.location ?? ""}`;
}

function getOptionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
