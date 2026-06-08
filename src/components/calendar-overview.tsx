"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { getConfiguredEventsAfterAppliedSourceReplacements } from "@/lib/calendar/applied-source-replacements";
import { type ManualCalendarEventInput, useCalendarFeed } from "@/lib/calendar/supabase-calendar";
import {
  calendarEventAssignmentsStorageKey,
  calendarTeamAssignmentsStorageKey,
} from "@/lib/calendar/storage";
import {
  getCalendarTeamAssignment,
  getCalendarEventTeamKey,
  getCalendarEventTeamLabel,
  inferSportsTeamLabel,
  normalizeTeamLabel,
  type CalendarTeamAssignment,
} from "@/lib/calendar/team-tags";
import type { AppliedCalendarEvent, CalendarSource } from "@/lib/calendar/types";
import { getBirthdayEventsForRange } from "@/lib/planner/birthdays";
import type { FixedEvent, HouseholdMember } from "@/lib/planner/types";
import { useLocalStorageState } from "@/lib/storage/local";

type CalendarOverviewProps = {
  configuredEvents: FixedEvent[];
  members: HouseholdMember[];
  season: {
    startsOn: string;
    endsOn: string;
  };
};

type CalendarEventRow = {
  id: string;
  assignmentKey: string;
  appliedEventKey?: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  category: string;
  location?: string;
  sourceLabel: string;
  sourceType: "configured" | "imported";
  teamKey: string;
  teamLabel?: string;
  assignedMemberIds: string[];
};

const emptyAssignmentOverrides: Record<string, string[]> = {};
const emptyTeamAssignments: CalendarTeamAssignment[] = [];
const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const shortMonthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const manualEventCategories = [
  "family-planning",
  "personal",
  "sports",
  "school-camp",
  "finance",
  "home-maintenance",
  "calendar",
];

export function CalendarOverview({ configuredEvents, members, season }: CalendarOverviewProps) {
  const { appliedEvents, saveManualEvent, setAppliedEvents, sources: calendarSources, usesSupabase } = useCalendarFeed();
  const [assignmentOverrides, setAssignmentOverrides] = useLocalStorageState<Record<string, string[]>>(
    calendarEventAssignmentsStorageKey,
    emptyAssignmentOverrides,
  );
  const [teamAssignments, setTeamAssignments] = useLocalStorageState<CalendarTeamAssignment[]>(
    calendarTeamAssignmentsStorageKey,
    emptyTeamAssignments,
  );
  const [selectedMemberId, setSelectedMemberId] = useState("all");
  const [sourceType, setSourceType] = useState<"all" | "configured" | "imported">("all");
  const [selectedTeamKey, setSelectedTeamKey] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState(season.startsOn.slice(0, 7));
  const [manualEventModal, setManualEventModal] = useState(false);
  const [manualEventStatus, setManualEventStatus] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const sourceLabels = useMemo(
    () => new Map(calendarSources.map((source) => [source.id, source.label])),
    [calendarSources],
  );
  const displayConfiguredEvents = useMemo(
    () => getConfiguredEventsAfterAppliedSourceReplacements(configuredEvents, calendarSources),
    [calendarSources, configuredEvents],
  );
  const birthdayEvents = useMemo(
    () => getBirthdayEventsForRange(members, getCalendarWindowStartsOn(season.startsOn), season.endsOn),
    [members, season.endsOn, season.startsOn],
  );
  const rows = useMemo(
    () =>
      [
        ...displayConfiguredEvents.map((event): CalendarEventRow => {
          const assignmentKey = getConfiguredEventAssignmentKey(event);
          const teamLabel = inferSportsTeamLabel({
            sourceId: event.source,
            title: event.title,
          });
          const teamKey = teamLabel ? `label:${normalizeTeamLabel(teamLabel)}` : "";

          return {
            id: event.id,
            assignmentKey,
            date: event.date,
            startTime: event.startTime,
            endTime: event.endTime,
            title: event.title,
            category: event.category,
            location: event.locationNote,
            sourceLabel: getConfiguredEventSourceLabel(event, calendarSources),
            sourceType: "configured",
            teamKey,
            teamLabel,
            assignedMemberIds: getEventAssignedMemberIds({
              assignmentKey,
              assignmentOverrides,
              fallbackMemberIds: event.assignedMemberIds ?? getConfiguredEventAssignedMemberIds(event, calendarSources),
              teamAssignments,
              teamKey,
            }),
          };
        }),
        ...birthdayEvents.map((event): CalendarEventRow => ({
          id: event.id,
          assignmentKey: getConfiguredEventAssignmentKey(event),
          date: event.date,
          startTime: event.startTime,
          endTime: event.endTime,
          title: event.title,
          category: event.category,
          location: event.locationNote,
          sourceLabel: "Birthdays",
          sourceType: "configured",
          teamKey: "",
          assignedMemberIds: getEventAssignedMemberIds({
            assignmentKey: getConfiguredEventAssignmentKey(event),
            assignmentOverrides,
            fallbackMemberIds: event.assignedMemberIds ?? [],
            teamAssignments,
            teamKey: "",
          }),
        })),
        ...appliedEvents.map((event): CalendarEventRow => {
          const appliedEventKey = getAppliedEventKey(event);
          const teamKey = getCalendarEventTeamKey(event);
          const teamLabel = getCalendarEventTeamLabel(event);

          return {
            id: appliedEventKey,
            assignmentKey: appliedEventKey,
            appliedEventKey,
            date: event.date,
            startTime: event.startTime,
            endTime: event.endTime,
            title: event.title,
            category: event.category,
            location: event.location,
            sourceLabel: event.sourceLabel || sourceLabels.get(event.sourceId) || event.sourceId,
            sourceType: "imported",
            teamKey,
            teamLabel,
            assignedMemberIds: getEventAssignedMemberIds({
              assignmentKey: appliedEventKey,
              assignmentOverrides,
              fallbackMemberIds: event.assignedMemberIds ?? [],
              teamAssignments,
              teamKey,
            }),
          };
        }),
      ].sort((first, second) =>
        compareStrings(
          `${first.date} ${first.startTime} ${first.title}`,
          `${second.date} ${second.startTime} ${second.title}`,
        ),
      ),
    [
      appliedEvents,
      assignmentOverrides,
      birthdayEvents,
      calendarSources,
      displayConfiguredEvents,
      sourceLabels,
      teamAssignments,
    ],
  );
  const filteredRows = rows.filter((event) => {
    const matchesMonth = event.date.startsWith(selectedMonth);
    const matchesSource = sourceType === "all" || event.sourceType === sourceType;
    const matchesTeam =
      selectedTeamKey === "all" ||
      event.teamKey === selectedTeamKey ||
      (selectedTeamKey === "unassigned-team" && !event.teamKey);
    const matchesMember =
      selectedMemberId === "all" ||
      event.assignedMemberIds.includes(selectedMemberId) ||
      (selectedMemberId === "unassigned" && event.assignedMemberIds.length === 0);

    return matchesMonth && matchesSource && matchesTeam && matchesMember;
  });
  const monthOptions = getMonthOptions(getCalendarWindowStartsOn(season.startsOn), season.endsOn);
  const teamOptions = getTeamOptions(rows);
  const groupedRows = groupByDate(filteredRows);

  function toggleEventMember(event: CalendarEventRow, memberId: string) {
    const nextAssignedMemberIds = event.assignedMemberIds.includes(memberId)
      ? event.assignedMemberIds.filter((id) => id !== memberId)
      : [...event.assignedMemberIds, memberId];

    setAssignmentOverrides((current) => ({
      ...current,
      [event.assignmentKey]: nextAssignedMemberIds,
    }));

    if (event.appliedEventKey) {
      setAppliedEvents((current) =>
        current.map((candidate) =>
          getAppliedEventKey(candidate) === event.appliedEventKey
            ? {
                ...candidate,
                assignedMemberIds: nextAssignedMemberIds,
              }
            : candidate,
        ),
      );
    }
  }

  function toggleTeamMember(teamKey: string, teamLabel: string, memberId: string) {
    const currentTeamAssignment = getCalendarTeamAssignment(teamAssignments, teamKey);
    const currentMemberIds = currentTeamAssignment?.assignedMemberIds ?? [];
    const nextAssignedMemberIds = currentMemberIds.includes(memberId)
      ? currentMemberIds.filter((id) => id !== memberId)
      : [...currentMemberIds, memberId];

    setTeamAssignments((current) => {
      const next = current.filter((assignment) => assignment.teamKey !== teamKey);

      return [
        ...next,
        {
          teamKey,
          teamLabel,
          assignedMemberIds: nextAssignedMemberIds,
        },
      ].sort((first, second) => compareStrings(first.teamLabel, second.teamLabel));
    });
    setAppliedEvents((current) =>
      current.map((event) =>
        getCalendarEventTeamKey(event) === teamKey
          ? {
              ...event,
              assignedMemberIds: assignmentOverrides[getAppliedEventKey(event)] ?? nextAssignedMemberIds,
            }
          : event,
      ),
    );
  }

  async function addManualEvent(input: ManualCalendarEventInput) {
    setManualEventStatus(null);

    try {
      await saveManualEvent(input);
      setSelectedMonth(input.date.slice(0, 7));
      setSourceType("all");
      setSelectedMemberId("all");
      setManualEventStatus({
        tone: "success",
        message: usesSupabase
          ? "Event saved to the household calendar."
          : "Event saved in this browser because no Supabase household is connected.",
      });
      return true;
    } catch (error) {
      setManualEventStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not save calendar event.",
      });
      return false;
    }
  }

  return (
    <main className="min-h-screen bg-[#eef2f6] text-[#17202a]">
      <section className="border-b border-[#cbd5df] bg-[#f8fafc]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-6 sm:px-8 lg:px-10">
          <div className="flex flex-wrap gap-4">
            <Link className="text-sm font-semibold text-[#1f6f8b]" href="/">
              Back to dashboard
            </Link>
            <Link className="text-sm font-semibold text-[#1f6f8b]" href="/admin">
              Admin setup
            </Link>
            <Link className="text-sm font-semibold text-[#1f6f8b]" href="/chores">
              Chores
            </Link>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
              Calendar
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-normal sm:text-5xl">
              Household calendar
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[#4c5965]">
              View configured schedule events, connected calendar imports, and app-only household events.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white"
              onClick={() => setManualEventModal(true)}
              type="button"
            >
              Add event
            </button>
            {manualEventStatus ? (
              <p
                className={`text-sm font-semibold ${
                  manualEventStatus.tone === "success" ? "text-[#2f6f73]" : "text-[#8a3b12]"
                }`}
              >
                {manualEventStatus.message}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-5 sm:px-8 lg:px-10">
        <section className="grid gap-3 border border-[#cbd5df] bg-white p-4 shadow-sm lg:grid-cols-[1fr_170px_170px_220px_220px]">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Stat label="Configured" value={displayConfiguredEvents.length} />
            <Stat label="Imported" value={appliedEvents.length} />
            <Stat label="Showing" value={filteredRows.length} />
          </div>
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Month</span>
            <select
              className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
              onChange={(event) => setSelectedMonth(event.target.value)}
              value={selectedMonth}
            >
              {monthOptions.map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Source</span>
            <select
              className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
              onChange={(event) => setSourceType(event.target.value as "all" | "configured" | "imported")}
              value={sourceType}
            >
              <option value="all">All</option>
              <option value="configured">Configured</option>
              <option value="imported">Imported</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">For</span>
            <select
              className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
              onChange={(event) => setSelectedMemberId(event.target.value)}
              value={selectedMemberId}
            >
              <option value="all">All events</option>
              <option value="unassigned">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.preferredName}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Team</span>
            <select
              className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
              onChange={(event) => setSelectedTeamKey(event.target.value)}
              value={selectedTeamKey}
            >
              <option value="all">All teams</option>
              <option value="unassigned-team">No team tag</option>
              {teamOptions.map((team) => (
                <option key={team.teamKey} value={team.teamKey}>
                  {team.teamLabel}
                </option>
              ))}
            </select>
          </label>
        </section>

        {teamOptions.length > 0 ? (
          <section className="grid gap-3 border border-[#cbd5df] bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Team dashboard defaults</h2>
                <p className="mt-1 text-sm text-[#4c5965]">
                  Assign a team once, then matching SportsEngine events inherit that dashboard assignment.
                </p>
              </div>
              <span className="text-sm font-semibold text-[#2f6f73]">
                {teamOptions.length} tagged team{teamOptions.length === 1 ? "" : "s"}
              </span>
            </div>
            <ol className="grid gap-2 md:grid-cols-2">
              {teamOptions.map((team) => {
                const assignedMemberIds =
                  getCalendarTeamAssignment(teamAssignments, team.teamKey)?.assignedMemberIds ?? [];

                return (
                  <li
                    className="grid gap-2 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm"
                    key={team.teamKey}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{team.teamLabel}</span>
                      <span className="text-xs font-semibold text-[#657381]">
                        {team.count} event{team.count === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {members.map((member) => (
                        <label
                          className="flex items-center gap-2 border border-[#d7e0e7] bg-white px-2 py-1 text-xs font-semibold text-[#4c5965]"
                          key={member.id}
                        >
                          <input
                            checked={assignedMemberIds.includes(member.id)}
                            onChange={() => toggleTeamMember(team.teamKey, team.teamLabel, member.id)}
                            type="checkbox"
                          />
                          {member.preferredName}
                        </label>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}

        <section className="grid gap-4">
          {groupedRows.length > 0 ? (
            groupedRows.map(([date, events]) => (
              <article className="border border-[#cbd5df] bg-white p-4 shadow-sm" key={date}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold">{formatDateLabel(date)}</h2>
                  <span className="text-sm font-semibold text-[#2f6f73]">
                    {events.length} event{events.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ol className="mt-3 grid gap-2">
                  {events.map((event) => (
                    <li
                      className="grid gap-3 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm md:grid-cols-[120px_1fr_320px]"
                      key={event.id}
                    >
                      <time className="font-semibold text-[#1f6f8b]">
                        {event.startTime}-{event.endTime}
                      </time>
                      <div>
                        <p className="font-semibold">{event.title}</p>
                        <p className="mt-1 text-xs text-[#657381]">
                          {event.category} · {event.sourceLabel}
                        </p>
                        {event.teamLabel ? (
                          <p className="mt-1 text-xs font-semibold text-[#2f6f73]">{event.teamLabel}</p>
                        ) : null}
                        {event.location ? <p className="mt-1 text-xs text-[#657381]">{event.location}</p> : null}
                      </div>
                      <fieldset className="grid gap-2">
                        <legend className="sr-only">Dashboard assignment</legend>
                        <div className="flex flex-wrap gap-2">
                          {members.map((member) => (
                            <label
                              className="flex items-center gap-2 border border-[#d7e0e7] bg-white px-2 py-1 text-xs font-semibold text-[#4c5965]"
                              key={member.id}
                            >
                              <input
                                checked={event.assignedMemberIds.includes(member.id)}
                                onChange={() => toggleEventMember(event, member.id)}
                                type="checkbox"
                              />
                              {member.preferredName}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    </li>
                  ))}
                </ol>
              </article>
            ))
          ) : (
            <p className="border border-dashed border-[#cbd5df] bg-white px-3 py-4 text-sm text-[#4c5965]">
              No calendar events match these filters.
            </p>
          )}
        </section>
      </section>
      {manualEventModal ? (
        <ManualEventModal
          defaultDate={getTodayDateKey()}
          members={members}
          onClose={() => setManualEventModal(false)}
          onSave={async (input) => {
            const saved = await addManualEvent(input);

            if (saved) {
              setManualEventModal(false);
            }

            return saved;
          }}
        />
      ) : null}
    </main>
  );
}

function groupByDate(events: CalendarEventRow[]) {
  const groups = new Map<string, CalendarEventRow[]>();

  for (const event of events) {
    groups.set(event.date, [...(groups.get(event.date) ?? []), event]);
  }

  return [...groups.entries()];
}

function getTeamOptions(events: CalendarEventRow[]) {
  const teams = new Map<string, { count: number; teamKey: string; teamLabel: string }>();

  for (const event of events) {
    if (!event.teamKey || !event.teamLabel) {
      continue;
    }

    const team = teams.get(event.teamKey);
    teams.set(event.teamKey, {
      count: (team?.count ?? 0) + 1,
      teamKey: event.teamKey,
      teamLabel: event.teamLabel,
    });
  }

  return [...teams.values()].sort((first, second) => compareStrings(first.teamLabel, second.teamLabel));
}

function getEventAssignedMemberIds({
  assignmentKey,
  assignmentOverrides,
  fallbackMemberIds,
  teamAssignments,
  teamKey,
}: {
  assignmentKey: string;
  assignmentOverrides: Record<string, string[]>;
  fallbackMemberIds: string[];
  teamAssignments: CalendarTeamAssignment[];
  teamKey: string;
}) {
  if (assignmentKey in assignmentOverrides) {
    return assignmentOverrides[assignmentKey];
  }

  const teamAssignment = getCalendarTeamAssignment(teamAssignments, teamKey);

  return teamAssignment?.assignedMemberIds ?? fallbackMemberIds;
}

function getMonthOptions(startsOn: string, endsOn: string) {
  const options: { label: string; value: string }[] = [];
  const [startYear, startMonth] = startsOn.split("-").map(Number);
  const [endYear, endMonth] = endsOn.split("-").map(Number);
  const current = new Date(startYear, startMonth - 1, 1);
  const end = new Date(endYear, endMonth - 1, 1);

  while (current <= end) {
    const value = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
    options.push({
      label: `${monthNames[current.getMonth()]} ${current.getFullYear()}`,
      value,
    });
    current.setMonth(current.getMonth() + 1);
  }

  return options;
}

function getCalendarWindowStartsOn(seasonStartsOn: string) {
  const [year, month] = seasonStartsOn.split("-").map(Number);
  const startsOn = new Date(year, month - 2, 1);

  return `${startsOn.getFullYear()}-${String(startsOn.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatDateLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(year, month - 1, day).getDay();

  return `${weekdayNames[weekday]}, ${shortMonthNames[month - 1]} ${day}, ${year}`;
}

function getConfiguredEventAssignedMemberIds(event: FixedEvent, sources: CalendarSource[]) {
  const source = sources.find((candidate) => isMatchingCalendarSource(candidate, event.source));

  return source?.defaultMemberIds ?? [];
}

function getConfiguredEventAssignmentKey(event: FixedEvent) {
  return `configured:${event.id}`;
}

function getAppliedEventKey(event: AppliedCalendarEvent) {
  return `imported:${event.sourceId}:${event.sourceUid ?? event.title}:${event.date}:${event.startTime}`;
}

function getConfiguredEventSourceLabel(event: FixedEvent, sources: CalendarSource[]) {
  const source = sources.find((candidate) => isMatchingCalendarSource(candidate, event.source));

  return source?.label ?? event.source;
}

function isMatchingCalendarSource(source: CalendarSource, eventSource: string) {
  if (source.id === eventSource) {
    return true;
  }

  if (source.kind === "sportsengine" && eventSource === "sportsengine-calendar") {
    return true;
  }

  return createId(source.label) === eventSource || createId(source.label) === eventSource.replace(/-calendar$/, "");
}

function ManualEventModal({
  defaultDate,
  members,
  onClose,
  onSave,
}: {
  defaultDate: string;
  members: HouseholdMember[];
  onClose: () => void;
  onSave: (input: ManualCalendarEventInput) => boolean | Promise<boolean>;
}) {
  const [title, setTitle] = useState("Boat to fish fry");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("16:30");
  const [endTime, setEndTime] = useState("21:00");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState("family-planning");
  const [assignedMemberIds, setAssignedMemberIds] = useState(() => members.map((member) => member.id));
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanTitle = title.trim();

    if (!cleanTitle) {
      setErrorMessage("Add an event title.");
      return;
    }

    if (!date || !startTime || !endTime) {
      setErrorMessage("Add a date, start time, and end time.");
      return;
    }

    if (endTime < startTime) {
      setErrorMessage("End time must be after start time.");
      return;
    }

    setErrorMessage("");
    setIsSaving(true);
    const saved = await onSave({
      assignedMemberIds,
      category,
      date,
      endTime,
      location: location.trim(),
      startTime,
      title: cleanTitle,
    });

    setIsSaving(false);

    if (!saved) {
      setErrorMessage("Could not save the event. Check the calendar status message and try again.");
    }
  }

  function toggleMember(memberId: string) {
    setAssignedMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((candidate) => candidate !== memberId)
        : [...current, memberId],
    );
  }

  function selectEveryone() {
    setAssignedMemberIds(members.map((member) => member.id));
  }

  function clearPeople() {
    setAssignedMemberIds([]);
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-[#17202a]/45 px-4 py-6"
      role="dialog"
    >
      <div className="w-full max-w-3xl border border-[#cbd5df] bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Add calendar event</h2>
            <p className="mt-1 text-sm text-[#4c5965]">
              Save app-only household events without adding them to your normal calendar.
            </p>
          </div>
          <button
            className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2 text-sm font-semibold"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <form className="grid gap-4" onSubmit={submit}>
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Title</span>
            <input
              className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-[1fr_150px_150px]">
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Date</span>
              <input
                className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                onChange={(event) => setDate(event.target.value)}
                type="date"
                value={date}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Start</span>
              <input
                className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                onChange={(event) => setStartTime(event.target.value)}
                type="time"
                value={startTime}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">End</span>
              <input
                className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                onChange={(event) => setEndTime(event.target.value)}
                type="time"
                value={endTime}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_210px]">
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Location or note</span>
              <input
                className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Dock, lake, restaurant, or reminder"
                value={location}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Category</span>
              <select
                className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                onChange={(event) => setCategory(event.target.value)}
                value={category}
              >
                {manualEventCategories.map((option) => (
                  <option key={option} value={option}>
                    {formatCategoryLabel(option)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <legend className="text-sm font-semibold">Show for</legend>
              <div className="flex gap-2">
                <button
                  className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2 text-xs font-semibold text-[#1f6f8b]"
                  onClick={selectEveryone}
                  type="button"
                >
                  Everyone
                </button>
                <button
                  className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2 text-xs font-semibold text-[#4c5965]"
                  onClick={clearPeople}
                  type="button"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {members.map((member) => (
                <label
                  className="flex items-center gap-2 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2 text-sm font-semibold text-[#4c5965]"
                  key={member.id}
                >
                  <input
                    checked={assignedMemberIds.includes(member.id)}
                    onChange={() => toggleMember(member.id)}
                    type="checkbox"
                  />
                  {member.preferredName}
                </label>
              ))}
            </div>
          </fieldset>

          {errorMessage ? (
            <p className="border border-[#f2b8a0] bg-[#fff7ed] px-3 py-2 text-sm text-[#8a3b12]">
              {errorMessage}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              className="border border-[#d7e0e7] bg-[#f8fafc] px-4 py-2 text-sm font-semibold"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? "Saving..." : "Save event"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function createId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function compareStrings(first: string, second: string) {
  if (first < second) {
    return -1;
  }

  if (first > second) {
    return 1;
  }

  return 0;
}

function getTodayDateKey() {
  const date = new Date();

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatCategoryLabel(category: string) {
  return category
    .split("-")
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">{label}</p>
    </div>
  );
}
