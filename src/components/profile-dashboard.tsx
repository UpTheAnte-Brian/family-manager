"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { choreStorageKey, type ChoreStorageState } from "@/lib/chores/storage";
import { getConfiguredEventsAfterAppliedSourceReplacements } from "@/lib/calendar/applied-source-replacements";
import { useCalendarFeed } from "@/lib/calendar/supabase-calendar";
import {
  calendarEventAssignmentsStorageKey,
  calendarTeamAssignmentsStorageKey,
} from "@/lib/calendar/storage";
import {
  getCalendarTeamAssignment,
  getCalendarEventTeamKey,
  inferSportsTeamLabel,
  normalizeTeamLabel,
  type CalendarTeamAssignment,
} from "@/lib/calendar/team-tags";
import type { AppliedCalendarEvent, CalendarSource } from "@/lib/calendar/types";
import { useLocalStorageState } from "@/lib/storage/local";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useCurrentHousehold } from "@/lib/supabase/household";
import type {
  ChoreCompletion,
  DayTemplate,
  DayOfWeek,
  FixedEvent,
  HouseholdMember,
  PlannerData,
  RoutineChore,
  WeeklyChore,
  WeeklyChoreAssignmentTemplate,
} from "@/lib/planner/types";
import type {
  LocalHouseholdItem,
  LocalResponsibilityItem,
  LocalRoutineItem,
  LocalTemporaryRoutineItem,
  ResponsibilityCategory,
  TodayContext,
} from "@/lib/today/types";

type DashboardState = {
  selectedMemberId: string;
  routineCompletions: Record<string, boolean>;
  actionCompletions: Record<string, boolean>;
  choreCompletions: ChoreCompletion[];
  localItems: LocalHouseholdItem[];
  localRoutines: LocalRoutineItem[];
  localResponsibilities: LocalResponsibilityItem[];
  localTemporaryRoutines: LocalTemporaryRoutineItem[];
};

type ProfileDashboardProps = {
  dayTemplates: DayTemplate[];
  fixedEvents: FixedEvent[];
  members: HouseholdMember[];
  chores: PlannerData["chores"];
  configuredResponsibilities: LocalResponsibilityItem[];
  season: PlannerData["season"];
  today: TodayContext;
};

type AssignmentWithChore = WeeklyChoreAssignmentTemplate & {
  chore?: WeeklyChore;
};

type DashboardRoutineItem = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  source: "configured" | "local";
};

type DashboardResponsibilityItem = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  category: ResponsibilityCategory;
  source:
    | "routine"
    | "configured"
    | "configured-responsibility"
    | "local"
    | "dated-task"
    | "temporary-routine";
  assignment?: AssignmentWithChore;
  localResponsibility?: LocalResponsibilityItem;
  localTaskId?: string;
  temporaryRoutineId?: string;
  remoteActionItemId?: string;
  completionKey?: string;
};

type RemoteTemporaryRoutineMetadata = {
  kind?: string;
  temporaryRoutineId?: string;
  occurrenceId?: string;
  occurrenceLabel?: string;
  startsOn?: string;
  endsOn?: string;
  category?: ResponsibilityCategory;
};

type RemoteHouseholdMemberRow = {
  id: string;
  external_key: string;
};

type RemoteActionItemRow = {
  id: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  metadata: RemoteTemporaryRoutineMetadata;
  created_at: string;
};

type RemoteAssignmentRow = {
  assignable_id: string;
  household_member_id: string | null;
};

type RemoteActionCompletionRow = {
  action_item_id: string;
  occurrence_date: string;
};

type RemoteTemporaryRoutineLoad = {
  routines: LocalTemporaryRoutineItem[];
  completionMap: Record<string, boolean>;
  memberIdsByExternalKey: Record<string, string>;
  externalKeysByMemberId: Record<string, string>;
};

type DashboardEvent = FixedEvent & {
  assignedMemberIds?: string[];
};

const storageKey = "family-manager:dashboard:v1";
const dayOptions: DayOfWeek[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const responsibilityCategories: ResponsibilityCategory[] = [
  "morning-routine",
  "homework",
  "chores",
  "sports",
  "personal-hygiene",
  "work",
  "personal",
  "investments",
  "family-planning",
  "home-maintenance",
  "finance",
];
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
const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ProfileDashboard({
  chores,
  configuredResponsibilities,
  dayTemplates,
  fixedEvents,
  members,
  season,
  today,
}: ProfileDashboardProps) {
  const defaultMemberId = members[0]?.id ?? "";
  const defaultQuickAddAssignee = members[0]?.id ?? "";
  const initialState = useMemo<DashboardState>(
    () => ({
      selectedMemberId: defaultMemberId,
      routineCompletions: {},
      actionCompletions: {},
      choreCompletions: chores.completions,
      localItems: [],
      localRoutines: [],
      localResponsibilities: [],
      localTemporaryRoutines: [],
    }),
    [chores.completions, defaultMemberId],
  );
  const [state, setState] = useLocalStorageState(storageKey, initialState);
  const fallbackChoreConfig = useMemo<ChoreStorageState>(
    () => ({
      routineChores: chores.routineChores,
      weeklyChores: chores.weeklyChores,
      weeklyAssignmentTemplates: chores.weeklyAssignmentTemplates,
      completions: chores.completions,
    }),
    [chores.completions, chores.routineChores, chores.weeklyAssignmentTemplates, chores.weeklyChores],
  );
  const [choreConfig] = useLocalStorageState(choreStorageKey, fallbackChoreConfig);
  const { appliedEvents: appliedCalendarEvents, sources: calendarSources } = useCalendarFeed();
  const [calendarEventAssignments] = useLocalStorageState<Record<string, string[]>>(
    calendarEventAssignmentsStorageKey,
    {},
  );
  const [calendarTeamAssignments] = useLocalStorageState<CalendarTeamAssignment[]>(
    calendarTeamAssignmentsStorageKey,
    [],
  );
  const { household, status: householdStatus } = useCurrentHousehold();
  const [remoteTemporaryRoutines, setRemoteTemporaryRoutines] = useState<LocalTemporaryRoutineItem[]>([]);
  const [remoteTemporaryCompletions, setRemoteTemporaryCompletions] = useState<Record<string, boolean>>({});
  const [remoteMemberIdsByExternalKey, setRemoteMemberIdsByExternalKey] = useState<Record<string, string>>({});
  const [remoteTemporaryRoutineError, setRemoteTemporaryRoutineError] = useState("");
  const [temporaryRoutineSyncVersion, setTemporaryRoutineSyncVersion] = useState(0);
  const [selectedDate, setSelectedDate] = useState(today.date);
  const [responsibilityModal, setResponsibilityModal] = useState<
    | { mode: "add" }
    | { mode: "edit"; responsibility: LocalResponsibilityItem }
    | null
  >(null);
  const [temporaryRoutineModal, setTemporaryRoutineModal] = useState(false);
  const [collapsedResponsibilityCategories, setCollapsedResponsibilityCategories] = useState<
    Partial<Record<ResponsibilityCategory, boolean>>
  >({});
  const wasMorningRoutineCompleteRef = useRef(false);
  const displayedDay = useMemo(
    () =>
      getDashboardDayContext({
        date: selectedDate,
        dayTemplates,
        fixedEvents,
        season,
        today,
      }),
    [dayTemplates, fixedEvents, season, selectedDate, today],
  );

  const selectedMember =
    members.find((member) => member.id === state.selectedMemberId) ?? members[0];
  const choresById = useMemo(
    () => new Map(choreConfig.weeklyChores.map((chore) => [chore.id, chore])),
    [choreConfig.weeklyChores],
  );
  const routineItems = getRoutineItems(
    choreConfig.routineChores,
    state.localRoutines,
    selectedMember,
    displayedDay,
  );
  const assignments = getAssignments(
    choreConfig.weeklyAssignmentTemplates,
    choresById,
    selectedMember,
    displayedDay,
  );
  const importedEvents = getAppliedEventsForToday(
    appliedCalendarEvents,
    calendarSources,
    calendarTeamAssignments,
    displayedDay.date,
  );
  const configuredEvents = getConfiguredEventsAfterAppliedSourceReplacements(
    displayedDay.fixedEvents,
    calendarSources,
  ).map((event) => ({
    ...event,
    assignedMemberIds:
      calendarEventAssignments[getConfiguredEventAssignmentKey(event)] ??
      getConfiguredEventTeamAssignedMemberIds(event, calendarTeamAssignments) ??
      event.assignedMemberIds ??
      getConfiguredEventAssignedMemberIds(event, calendarSources),
  }));
  const effectiveEvents = [...configuredEvents, ...importedEvents];
  const events = getRelevantEvents(effectiveEvents, selectedMember);
  const otherEvents = getOtherEvents(effectiveEvents, events, selectedMember);
  const dayTypeLabel = getEffectiveDayTypeLabel(displayedDay.dayTypeLabel, effectiveEvents);
  const visibleLocalItems = getVisibleLocalItems(state.localItems, selectedMember, displayedDay.date);
  const localTasks = visibleLocalItems.filter((item) => item.kind === "task");
  const localReminders = visibleLocalItems.filter((item) => item.kind === "reminder");
  const isRemoteHouseholdReady = householdStatus === "ready" && Boolean(household?.householdId);
  const temporaryRoutines = isRemoteHouseholdReady
    ? remoteTemporaryRoutines
    : state.localTemporaryRoutines;
  const dashboardStateForView = useMemo<DashboardState>(
    () => ({
      ...state,
      actionCompletions: {
        ...state.actionCompletions,
        ...remoteTemporaryCompletions,
      },
      localTemporaryRoutines: temporaryRoutines,
    }),
    [remoteTemporaryCompletions, state, temporaryRoutines],
  );
  const responsibilityItems = getResponsibilityItems(
    routineItems,
    assignments,
    configuredResponsibilities,
    state.localResponsibilities,
    temporaryRoutines,
    localTasks,
    selectedMember,
    displayedDay,
  );
  const reminderItems = getReminderItems(
    selectedMember,
    events,
    responsibilityItems.length,
    localReminders,
    displayedDay,
  );
  const isPastSelectedDate = displayedDay.date < today.date;
  const isTodaySelected = displayedDay.date === today.date;
  const groupedResponsibilityItems = groupResponsibilitiesByCategory(responsibilityItems);
  const householdId = household?.householdId;

  useEffect(() => {
    if (!householdId || householdStatus !== "ready") {
      return;
    }

    let isActive = true;
    const currentHouseholdId = householdId;

    async function loadRemoteTemporaryRoutinesForHousehold() {
      try {
        const remoteState = await loadRemoteTemporaryRoutines(currentHouseholdId);

        if (!isActive) {
          return;
        }

        setRemoteTemporaryRoutines(remoteState.routines);
        setRemoteTemporaryCompletions(remoteState.completionMap);
        setRemoteMemberIdsByExternalKey(remoteState.memberIdsByExternalKey);
        setRemoteTemporaryRoutineError("");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setRemoteTemporaryRoutineError(
          error instanceof Error ? error.message : "Could not load temporary routines from Supabase.",
        );
      }
    }

    void loadRemoteTemporaryRoutinesForHousehold();

    return () => {
      isActive = false;
    };
  }, [householdId, householdStatus, temporaryRoutineSyncVersion]);

  useEffect(() => {
    const morningRoutineItems =
      groupedResponsibilityItems.find(([category]) => category === "morning-routine")?.[1] ?? [];

    if (morningRoutineItems.length === 0) {
      return;
    }

    const isMorningRoutineComplete = morningRoutineItems.every((item) =>
      isResponsibilityComplete(item, dashboardStateForView, displayedDay.date, selectedMember.id),
    );

    const wasMorningRoutineComplete = wasMorningRoutineCompleteRef.current;
    wasMorningRoutineCompleteRef.current = isMorningRoutineComplete;

    if (isMorningRoutineComplete && !wasMorningRoutineComplete) {
      setCollapsedResponsibilityCategories((current) => ({
        ...current,
        "morning-routine": true,
      }));
      return;
    }

    if (!isMorningRoutineComplete && wasMorningRoutineComplete) {
      setCollapsedResponsibilityCategories((current) => ({
        ...current,
        "morning-routine": false,
      }));
    }
  }, [dashboardStateForView, displayedDay.date, groupedResponsibilityItems, selectedMember.id]);

  function selectMember(memberId: string) {
    setState((current) => ({
      ...current,
      selectedMemberId: memberId,
    }));
  }

  function toggleRoutine(routine: DashboardRoutineItem) {
    const key = getRoutineKey(displayedDay.date, selectedMember.id, routine.id);

    setState((current) => ({
      ...current,
      routineCompletions: {
        ...current.routineCompletions,
        [key]: !current.routineCompletions[key],
      },
    }));
  }

  function removeLocalRoutine(routineId: string) {
    setState((current) => {
      const removedRoutine = current.localRoutines.find((routine) => routine.id === routineId);
      const routineCompletions = { ...current.routineCompletions };

      if (removedRoutine) {
        delete routineCompletions[
          getRoutineKey(displayedDay.date, removedRoutine.assigneeId, removedRoutine.id)
        ];
      }

      return {
        ...current,
        localRoutines: current.localRoutines.filter((routine) => routine.id !== routineId),
        routineCompletions,
      };
    });
  }

  function toggleAssignment(assignment: AssignmentWithChore) {
    setState((current) => {
      const existing = current.choreCompletions.find(
        (completion) =>
          completion.assignmentTemplateId === assignment.id &&
          completion.completedAt.startsWith(displayedDay.date),
      );

      if (existing) {
        return {
          ...current,
          choreCompletions: current.choreCompletions.filter(
            (completion) => completion.id !== existing.id,
          ),
        };
      }

      return {
        ...current,
        choreCompletions: [
          ...current.choreCompletions,
          {
            id: createId(`${assignment.id}-${displayedDay.date}`),
            assignmentTemplateId: assignment.id,
            childId: assignment.childId,
            choreId: assignment.choreId,
            completedAt: `${displayedDay.date}T${assignment.endTime}:00`,
            completedBy: selectedMember.id,
          },
        ],
      };
    });
  }

  async function toggleResponsibility(item: DashboardResponsibilityItem) {
    if (item.assignment) {
      toggleAssignment(item.assignment);
      return;
    }

    if (item.localTaskId) {
      toggleLocalTask(item.localTaskId);
      return;
    }

    const key = item.completionKey ?? getActionKey(displayedDay.date, selectedMember.id, item.id);
    const isComplete = Boolean(dashboardStateForView.actionCompletions[key]);

    if (isRemoteHouseholdReady && item.source === "temporary-routine" && item.remoteActionItemId) {
      setRemoteTemporaryCompletions((current) => ({
        ...current,
        [key]: !isComplete,
      }));

      try {
        await saveRemoteTemporaryRoutineCompletion({
          actionItemId: item.remoteActionItemId,
          completed: !isComplete,
          date: displayedDay.date,
          householdId: household!.householdId,
          memberId: remoteMemberIdsByExternalKey[selectedMember.id],
        });
        setTemporaryRoutineSyncVersion((current) => current + 1);
        setRemoteTemporaryRoutineError("");
      } catch (error) {
        setRemoteTemporaryCompletions((current) => ({
          ...current,
          [key]: isComplete,
        }));
        setRemoteTemporaryRoutineError(
          error instanceof Error ? error.message : "Could not save temporary routine completion.",
        );
      }

      return;
    }

    setState((current) => ({
      ...current,
      actionCompletions: {
        ...current.actionCompletions,
        [key]: !current.actionCompletions[key],
      },
    }));
  }

  function addLocalResponsibility(input: Omit<LocalResponsibilityItem, "createdAt" | "id">) {
    const title = input.title.trim();

    if (!title) {
      return false;
    }

    const createdAt = new Date().toISOString();

    setState((current) => ({
      ...current,
      localResponsibilities: [
        ...current.localResponsibilities,
        {
          ...input,
          title,
          createdAt,
          id: createId(`responsibility-${input.assigneeId}-${createdAt}-${title}`),
        },
      ],
    }));

    return true;
  }

  function updateLocalResponsibility(
    responsibilityId: string,
    input: Omit<LocalResponsibilityItem, "createdAt" | "id">,
  ) {
    const title = input.title.trim();

    if (!title) {
      return false;
    }

    setState((current) => ({
      ...current,
      localResponsibilities: current.localResponsibilities.map((responsibility) =>
        responsibility.id === responsibilityId
          ? {
              ...responsibility,
              ...input,
              title,
            }
          : responsibility,
      ),
    }));

    return true;
  }

  function removeLocalResponsibility(responsibilityId: string) {
    setState((current) => {
      const removedResponsibility = current.localResponsibilities.find(
        (responsibility) => responsibility.id === responsibilityId,
      );
      const actionCompletions = { ...current.actionCompletions };

      if (removedResponsibility) {
        delete actionCompletions[
          getActionKey(displayedDay.date, removedResponsibility.assigneeId, removedResponsibility.id)
        ];
      }

      return {
        ...current,
        actionCompletions,
        localResponsibilities: current.localResponsibilities.filter(
          (responsibility) => responsibility.id !== responsibilityId,
        ),
      };
    });
  }

  async function addTemporaryRoutine(input: Omit<LocalTemporaryRoutineItem, "createdAt" | "id">) {
    const title = input.title.trim();
    const occurrences = input.occurrences.filter((occurrence) => occurrence.startTime && occurrence.endTime);

    if (!title || !input.assigneeId || !input.startsOn || !input.endsOn || occurrences.length === 0) {
      return false;
    }

    const createdAt = new Date().toISOString();
    const routine: LocalTemporaryRoutineItem = {
      ...input,
      title,
      occurrences,
      createdAt,
      id: createId(`temporary-routine-${input.assigneeId}-${createdAt}-${title}`),
    };

    if (isRemoteHouseholdReady) {
      try {
        const savedRoutine = await saveRemoteTemporaryRoutine({
          householdId: household!.householdId,
          memberId: remoteMemberIdsByExternalKey[input.assigneeId],
          routine,
        });

        setRemoteTemporaryRoutines((current) => [...current, savedRoutine]);
        setTemporaryRoutineSyncVersion((current) => current + 1);
        setRemoteTemporaryRoutineError("");
        return true;
      } catch (error) {
        setRemoteTemporaryRoutineError(
          error instanceof Error ? error.message : "Could not save temporary routine to Supabase.",
        );
        return false;
      }
    }

    setState((current) => ({
      ...current,
      localTemporaryRoutines: [
        ...current.localTemporaryRoutines,
        routine,
      ],
    }));

    return true;
  }

  async function removeTemporaryRoutine(routineId: string) {
    if (isRemoteHouseholdReady) {
      const routine = remoteTemporaryRoutines.find((candidate) => candidate.id === routineId);

      if (!routine) {
        return;
      }

      const actionItemIds = routine.occurrences
        .map((occurrence) => occurrence.remoteActionItemId)
        .filter((actionItemId): actionItemId is string => Boolean(actionItemId));

      try {
        await removeRemoteTemporaryRoutine({
          actionItemIds,
          householdId: household!.householdId,
        });
        setRemoteTemporaryRoutines((current) => current.filter((candidate) => candidate.id !== routineId));
        setRemoteTemporaryCompletions((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([key]) => !key.includes(`:${routineId}:`)),
          ),
        );
        setTemporaryRoutineSyncVersion((current) => current + 1);
        setRemoteTemporaryRoutineError("");
      } catch (error) {
        setRemoteTemporaryRoutineError(
          error instanceof Error ? error.message : "Could not remove temporary routine from Supabase.",
        );
      }

      return;
    }

    setState((current) => {
      const actionCompletions = Object.fromEntries(
        Object.entries(current.actionCompletions).filter(([key]) => !key.includes(`:${routineId}:`)),
      );

      return {
        ...current,
        actionCompletions,
        localTemporaryRoutines: current.localTemporaryRoutines.filter((routine) => routine.id !== routineId),
      };
    });
  }

  function toggleLocalTask(itemId: string) {
    setState((current) => ({
      ...current,
      localItems: current.localItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              completedAt: item.completedAt ? undefined : new Date().toISOString(),
            }
          : item,
      ),
    }));
  }

  return (
    <main className="min-h-screen bg-[#eef2f6] text-[#17202a]">
      <section className="border-b border-[#cbd5df] bg-[#f8fafc]">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-4 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Link className="text-sm font-semibold text-[#1f6f8b]" href="/admin">
                Admin setup
              </Link>
              <Link className="text-sm font-semibold text-[#1f6f8b]" href="/calendar">
                Calendar
              </Link>
              <Link className="text-sm font-semibold text-[#1f6f8b]" href="/chores">
                Chores
              </Link>
              <label className="text-sm">
                <span className="sr-only">Person</span>
                <select
                  className="min-w-[190px] border border-[#cbd5df] bg-white px-3 py-2 text-sm font-semibold text-[#17202a]"
                  onChange={(event) => selectMember(event.target.value)}
                  value={selectedMember.id}
                >
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.preferredName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="min-w-[150px]">
                <h2 className="text-lg font-semibold">{formatDateLabel(displayedDay.date)}</h2>
                <p className="text-xs text-[#4c5965]">
                  {displayedDay.dayTypeLabel} · {events.length} event{events.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:w-[340px]">
                <button
                  className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold"
                  onClick={() => setSelectedDate((current) => shiftDate(current, -1))}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isTodaySelected}
                  onClick={() => setSelectedDate(today.date)}
                  type="button"
                >
                  Today
                </button>
                <button
                  className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold"
                  onClick={() => setSelectedDate((current) => shiftDate(current, 1))}
                  type="button"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-5 sm:px-8 lg:px-10">
        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <div className="space-y-5">
            <Panel
              action={
                <div className="flex flex-wrap gap-2">
                  <button
                    className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#1f6f8b]"
                    onClick={() => setTemporaryRoutineModal(true)}
                    type="button"
                  >
                    Add temp routine
                  </button>
                  <button
                    className="border border-[#1f6f8b] bg-[#1f6f8b] px-3 py-2 text-sm font-semibold text-white"
                    onClick={() => setResponsibilityModal({ mode: "add" })}
                    type="button"
                  >
                    Add responsibility
                  </button>
                </div>
              }
              title="Responsibilities"
            >
              {responsibilityItems.length > 0 ? (
                <div className="grid gap-4">
                  {groupedResponsibilityItems.map(([category, items]) => {
                    const completedCount = items.filter((item) =>
                      isResponsibilityComplete(
                        item,
                        dashboardStateForView,
                        displayedDay.date,
                        selectedMember.id,
                      ),
                    ).length;
                    const isCollapsed = Boolean(collapsedResponsibilityCategories[category]);

                    return (
                      <section className="grid gap-2" key={category}>
                        <button
                          aria-expanded={!isCollapsed}
                          className="flex items-center justify-between gap-3 text-left"
                          onClick={() =>
                            setCollapsedResponsibilityCategories((current) => ({
                              ...current,
                              [category]: !current[category],
                            }))
                          }
                          type="button"
                        >
                          <span className="text-sm font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
                            {categoryLabel(category)}
                          </span>
                          <span className="flex items-center gap-2 text-xs font-semibold text-[#657381]">
                            <span>
                              {completedCount}/{items.length}
                            </span>
                            <span className="inline-grid h-6 w-6 place-items-center border border-[#d7e0e7] bg-[#f8fafc] text-[#17202a]">
                              {isCollapsed ? "+" : "-"}
                            </span>
                          </span>
                        </button>
                        {isCollapsed ? null : (
                          <Checklist>
                            {items.map((item) => {
                              const checked = isResponsibilityComplete(
                                item,
                                dashboardStateForView,
                                displayedDay.date,
                                selectedMember.id,
                              );
                              const editableResponsibility =
                                item.source === "local" ? item.localResponsibility : undefined;

                              return (
                                <ChecklistItem
                                  checked={checked}
                                  isPastDue={isPastSelectedDate && !checked}
                                  key={item.id}
                                  meta={formatTimeRange(item.startTime, item.endTime)}
                                  onChange={() =>
                                    item.source === "routine"
                                      ? toggleRoutine({
                                          id: item.id,
                                          title: item.title,
                                          startTime: item.startTime,
                                          endTime: item.endTime,
                                          source: "configured",
                                        })
                                      : void toggleResponsibility(item)
                                  }
                                  onRemove={
                                    item.source === "local"
                                      ? () => removeLocalResponsibility(item.id)
                                      : item.source === "temporary-routine" && item.temporaryRoutineId
                                        ? () => void removeTemporaryRoutine(item.temporaryRoutineId!)
                                      : item.source === "routine" && item.id.startsWith("routine-")
                                        ? () => removeLocalRoutine(item.id)
                                        : undefined
                                  }
                                  onEdit={
                                    editableResponsibility
                                      ? () =>
                                          setResponsibilityModal({
                                            mode: "edit",
                                            responsibility: editableResponsibility,
                                          })
                                      : undefined
                                  }
                                  sourceLabel={responsibilitySourceLabel(item)}
                                  title={item.title}
                                />
                              );
                            })}
                          </Checklist>
                        )}
                      </section>
                    );
                  })}
                </div>
              ) : (
                <EmptyState text="No responsibility is scheduled for this profile on this date." />
              )}
            </Panel>
          </div>

          <div className="space-y-5">
            <Panel title="Day Schedule">
              {events.length > 0 ? (
                <ol className="grid gap-2">
                  {events.map((event) => (
                    <EventRow event={event} key={event.id} />
                  ))}
                </ol>
              ) : (
                <EmptyState text="No fixed calendar events are attached to this profile on this date." />
              )}
            </Panel>

            <Panel title={isTodaySelected ? "Other Events Today" : "Other Events"}>
              {otherEvents.length > 0 ? (
                <ol className="grid gap-2">
                  {otherEvents.map((event) => (
                    <OtherEventRow event={event} key={event.id} members={members} />
                  ))}
                </ol>
              ) : (
                <EmptyState text="No other household events are scheduled for this date." />
              )}
            </Panel>

            <Panel title="Remember">
              <ul className="grid gap-2 text-sm">
                {reminderItems.map((item) => (
                  <li className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3" key={item.id}>
                    {item.title}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <div className="grid gap-5 xl:col-span-2 xl:grid-cols-[1fr_1fr]">
            <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Selected Day</h2>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <Fact label="Date" value={`${displayedDay.date} (${displayedDay.dayOfWeek})`} />
                <Fact label="Day type" value={dayTypeLabel} />
                <Fact label="Baseline" value={displayedDay.baseline.label} />
                <Fact label="Events" value={String(effectiveEvents.length)} />
                <Fact label="Imports on day" value={String(importedEvents.length)} />
                <Fact label="Schedule blocks" value={String(displayedDay.baseline.blocks.length)} />
              </dl>
            </section>

            <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Operating Mode</h2>
              <ul className="mt-3 space-y-2 text-sm text-[#4c5965]">
                <li>Manual profile switching is active.</li>
                <li>
                  Temporary routines sync through Supabase when a household is connected.
                </li>
                <li>Local browser storage is still used for prototype-only routines, tasks, and reminders.</li>
              </ul>
              {isRemoteHouseholdReady && remoteTemporaryRoutineError ? (
                <p className="mt-3 border border-[#f2b8a0] bg-[#fff7ed] px-3 py-2 text-sm text-[#8a3b12]">
                  {remoteTemporaryRoutineError}
                </p>
              ) : null}
            </section>

            <Panel title="History Notes">
              <EmptyState
                text={
                  isPastSelectedDate
                    ? "Unchecked items above are highlighted as missed for this day."
                    : "Open items above remain neutral until you page back after today."
                }
              />
            </Panel>
          </div>

          <div className="xl:col-span-2">
            <Panel title="Baseline Flow">
              {displayedDay.baseline.blocks.length > 0 ? (
                <ol className="grid gap-2 md:grid-cols-2">
                  {displayedDay.baseline.blocks.slice(0, 8).map((block) => (
                    <li
                      className="grid gap-1 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm"
                      key={block.id}
                    >
                      <span className="font-semibold text-[#17202a]">{block.title}</span>
                      <span className="text-[#657381]">
                        {formatTimeRange(block.startTime, block.endTime)} · {block.noiseLevel}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState text={`${dayTypeLabel} has no configured baseline yet. This is intentional until school-year and weekend flows are modeled.`} />
              )}
            </Panel>
          </div>
        </div>
      </section>
      {responsibilityModal ? (
        <ResponsibilityModal
          defaultAssigneeId={selectedMember?.id ?? defaultQuickAddAssignee}
          defaultDayOfWeek={displayedDay.dayOfWeek}
          initialResponsibility={
            responsibilityModal.mode === "edit" ? responsibilityModal.responsibility : undefined
          }
          members={members}
          onClose={() => setResponsibilityModal(null)}
          onSave={(input) => {
            const saved =
              responsibilityModal.mode === "edit"
                ? updateLocalResponsibility(responsibilityModal.responsibility.id, input)
                : addLocalResponsibility(input);

            if (saved) {
              setResponsibilityModal(null);
            }
          }}
        />
      ) : null}
      {temporaryRoutineModal ? (
        <TemporaryRoutineModal
          defaultAssigneeId={selectedMember?.id ?? defaultQuickAddAssignee}
          defaultDate={displayedDay.date}
          members={members}
          onClose={() => setTemporaryRoutineModal(false)}
          onSave={async (input) => {
            if (await addTemporaryRoutine(input)) {
              setTemporaryRoutineModal(false);
            }
          }}
        />
      ) : null}
    </main>
  );
}

function getDashboardDayContext({
  date,
  dayTemplates,
  fixedEvents,
  season,
  today,
}: {
  date: string;
  dayTemplates: DayTemplate[];
  fixedEvents: FixedEvent[];
  season: PlannerData["season"];
  today: TodayContext;
}): TodayContext {
  if (date === today.date) {
    return today;
  }

  const dayOfWeek = getDayOfWeekForDate(date);
  const dayEvents = fixedEvents.filter((event) => event.date === date);
  const dayType = getDayTypeForDate(date, dayOfWeek, dayEvents, season);
  const template = dayTemplates.find((candidate) => {
    const range = candidate.appliesTo.dateRange;

    return (
      candidate.appliesTo.daysOfWeek.includes(dayOfWeek) &&
      date >= range.startsOn &&
      date <= range.endsOn
    );
  });

  return {
    date,
    dayOfWeek,
    dayType,
    dayTypeLabel: getDayTypeDisplayLabel(dayType),
    baseline: {
      id: template?.id ?? `missing-${dayType}`,
      label: template?.label ?? `No ${getDayTypeDisplayLabel(dayType).toLowerCase()} baseline configured`,
      source: template ? "configured" : "missing",
      blocks: template?.blocks ?? [],
    },
    fixedEvents: dayEvents,
  };
}

function getDayTypeForDate(
  date: string,
  dayOfWeek: DayOfWeek,
  events: FixedEvent[],
  season: PlannerData["season"],
): TodayContext["dayType"] {
  const eventText = events.map((event) => `${event.title} ${event.category}`.toLowerCase()).join(" ");

  if (eventText.includes("holiday") || eventText.includes("labor day")) {
    return "holiday";
  }

  if (eventText.includes("no school") || eventText.includes("school closed")) {
    return "no-school";
  }

  const isWeekend = dayOfWeek === "SA" || dayOfWeek === "SU";
  const isSummer = date >= season.startsOn && date <= season.endsOn;

  if (isSummer) {
    return isWeekend ? "summer-weekend" : "summer-weekday";
  }

  return isWeekend ? "school-year-weekend" : "school-day";
}

function getDayTypeDisplayLabel(dayType: TodayContext["dayType"]) {
  switch (dayType) {
    case "school-day":
      return "School day";
    case "school-year-weekend":
      return "School-year weekend";
    case "summer-weekday":
      return "Summer weekday";
    case "summer-weekend":
      return "Summer weekend";
    case "no-school":
      return "No-school day";
    case "holiday":
      return "Holiday";
  }
}

function getDayOfWeekForDate(date: string): DayOfWeek {
  const dayCodes: DayOfWeek[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const [year, month, day] = date.split("-").map(Number);

  return dayCodes[new Date(year, month - 1, day).getDay()];
}

function shiftDate(date: string, amount: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(year, month - 1, day);

  next.setDate(next.getDate() + amount);

  return formatDateKey(next);
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDateLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(year, month - 1, day).getDay();

  return `${weekdayNames[weekday]}, ${monthNames[month - 1]} ${day} (${month}/${day}/${year})`;
}

function categoryLabel(category: ResponsibilityCategory) {
  switch (category) {
    case "morning-routine":
      return "Morning Routine";
    case "homework":
      return "Homework";
    case "chores":
      return "Chores";
    case "sports":
      return "Sports";
    case "personal-hygiene":
      return "Personal Hygiene";
    case "work":
      return "Work";
    case "personal":
      return "Personal";
    case "investments":
      return "Investments";
    case "family-planning":
      return "Family Planning";
    case "home-maintenance":
      return "Home Maintenance";
    case "finance":
      return "Finance";
  }
}

function responsibilitySourceLabel(item: DashboardResponsibilityItem) {
  switch (item.source) {
    case "routine":
      return "Routine";
    case "configured":
      return "Weekly chore";
    case "configured-responsibility":
      return "Configured";
    case "local":
      return "Custom";
    case "dated-task":
      return "Today";
    case "temporary-routine":
      return "Temporary routine";
  }
}

function choreCategoryToResponsibilityCategory(category?: string): ResponsibilityCategory {
  if (category === "sports") {
    return "sports";
  }

  if (category === "homework") {
    return "homework";
  }

  if (category === "personal-hygiene") {
    return "personal-hygiene";
  }

  return "chores";
}

function groupResponsibilitiesByCategory(items: DashboardResponsibilityItem[]) {
  return responsibilityCategories
    .map((category) => [category, items.filter((item) => item.category === category)] as const)
    .filter(([, categoryItems]) => categoryItems.length > 0);
}

function isResponsibilityComplete(
  item: DashboardResponsibilityItem,
  state: DashboardState,
  date: string,
  memberId: string,
) {
  if (item.assignment) {
    return hasCompletion(state.choreCompletions, item.assignment.id, date);
  }

  if (item.localTaskId) {
    const localTask = state.localItems.find((candidate) => candidate.id === item.localTaskId);

    return Boolean(localTask?.completedAt);
  }

  if (item.source === "routine") {
    return Boolean(state.routineCompletions[getRoutineKey(date, memberId, item.id)]);
  }

  if (item.completionKey) {
    return Boolean(state.actionCompletions[item.completionKey]);
  }

  return Boolean(state.actionCompletions[getActionKey(date, memberId, item.id)]);
}

function getRoutineItems(
  routines: RoutineChore[],
  localRoutines: LocalRoutineItem[],
  member: HouseholdMember,
  today: TodayContext,
): DashboardRoutineItem[] {
  const configuredItems =
    member.role === "child"
      ? routines
          .filter(
            (routine) =>
              routine.defaultAssigneeIds.includes(member.id) &&
              routine.schedule.daysOfWeek.includes(today.dayOfWeek),
          )
          .map((routine) => ({
            id: routine.id,
            title: routine.title,
            startTime: routine.schedule.startTime,
            endTime: routine.schedule.endTime,
            source: "configured" as const,
          }))
      : [];
  const localItems = localRoutines
    .filter(
      (routine) =>
        routine.assigneeId === member.id && routine.daysOfWeek.includes(today.dayOfWeek),
    )
    .map((routine) => ({
      id: routine.id,
      title: routine.title,
      startTime: routine.startTime,
      endTime: routine.endTime,
      source: "local" as const,
    }));

  return [...configuredItems, ...localItems].sort((first, second) =>
    compareStrings(`${first.startTime}-${first.title}`, `${second.startTime}-${second.title}`),
  );
}

function getAssignments(
  assignments: WeeklyChoreAssignmentTemplate[],
  choresById: Map<string, WeeklyChore>,
  member: HouseholdMember,
  today: TodayContext,
): AssignmentWithChore[] {
  if (member.role !== "child") {
    return [];
  }

  return assignments
    .filter((assignment) => assignment.childId === member.id && assignment.dayOfWeek === today.dayOfWeek)
    .map((assignment) => ({
      ...assignment,
      chore: choresById.get(assignment.choreId),
    }));
}

function getResponsibilityItems(
  routines: DashboardRoutineItem[],
  assignments: AssignmentWithChore[],
  configuredResponsibilities: LocalResponsibilityItem[],
  localResponsibilities: LocalResponsibilityItem[],
  localTemporaryRoutines: LocalTemporaryRoutineItem[],
  localTasks: LocalHouseholdItem[],
  member: HouseholdMember,
  today: TodayContext,
): DashboardResponsibilityItem[] {
  const routineResponsibilities = routines.map((routine) => ({
    id: routine.id,
    title: routine.title,
    startTime: routine.startTime,
    endTime: routine.endTime,
    category: "morning-routine" as const,
    source: "routine" as const,
  }));
  const configuredItems = assignments.map((assignment) => ({
    id: assignment.id,
    title: assignment.chore?.title ?? assignment.choreId,
    startTime: assignment.startTime,
    endTime: assignment.endTime,
    category: choreCategoryToResponsibilityCategory(assignment.chore?.category),
    source: "configured" as const,
    assignment,
  }));
  const configuredResponsibilityItems = configuredResponsibilities
    .filter(
      (responsibility) =>
        responsibility.assigneeId === member.id &&
        responsibility.daysOfWeek.includes(today.dayOfWeek),
    )
    .map((responsibility) => ({
      id: responsibility.id,
      title: responsibility.title,
      startTime: responsibility.startTime,
      endTime: responsibility.endTime,
      category: responsibility.category ?? "chores",
      source: "configured-responsibility" as const,
    }));
  const localItems = localResponsibilities
    .filter(
      (responsibility) =>
        responsibility.assigneeId === member.id &&
        responsibility.daysOfWeek.includes(today.dayOfWeek),
    )
    .map((responsibility) => ({
      id: responsibility.id,
      title: responsibility.title,
      startTime: responsibility.startTime,
      endTime: responsibility.endTime,
      category: responsibility.category ?? "chores",
      source: "local" as const,
      localResponsibility: responsibility,
    }));
  const datedTasks = localTasks.map((item) => ({
    id: item.id,
    title: item.title,
    startTime: "Anytime",
    endTime: "Today",
    category: "personal" as const,
    source: "dated-task" as const,
    localTaskId: item.id,
  }));
  const temporaryRoutineItems = localTemporaryRoutines.flatMap((routine) => {
    if (routine.assigneeId !== member.id || today.date < routine.startsOn || today.date > routine.endsOn) {
      return [];
    }

    return routine.occurrences.map((occurrence) => ({
      id: `temporary-routine:${routine.id}:${occurrence.id}`,
      title: occurrence.label ? `${routine.title}: ${occurrence.label}` : routine.title,
      startTime: occurrence.startTime,
      endTime: occurrence.endTime,
      category: routine.category ?? "personal-hygiene",
      source: "temporary-routine" as const,
      completionKey: getTemporaryRoutineCompletionKey(today.date, member.id, routine.id, occurrence.id),
      temporaryRoutineId: routine.id,
      remoteActionItemId: occurrence.remoteActionItemId,
    }));
  });

  return [
    ...routineResponsibilities,
    ...configuredItems,
    ...configuredResponsibilityItems,
    ...localItems,
    ...datedTasks,
    ...temporaryRoutineItems,
  ].sort((first, second) =>
    compareStrings(`${first.startTime}-${first.title}`, `${second.startTime}-${second.title}`),
  );
}

function getRelevantEvents(events: DashboardEvent[], member: HouseholdMember) {
  if (member.role === "parent") {
    return events;
  }

  const name = member.preferredName.toLowerCase();

  return events.filter((event) => {
    const title = event.title.toLowerCase();
    const assignedMemberIds = event.assignedMemberIds ?? [];

    if (assignedMemberIds.length > 0) {
      return assignedMemberIds.includes(member.id);
    }

    return (
      title.includes(name) ||
      event.category === "sports" ||
      event.category === "school-camp" ||
      event.source === "sportsengine-calendar"
    );
  });
}

function getOtherEvents(
  allEvents: DashboardEvent[],
  memberEvents: DashboardEvent[],
  member: HouseholdMember,
) {
  if (member.role === "parent") {
    return [];
  }

  const memberEventIds = new Set(memberEvents.map((event) => event.id));

  return allEvents.filter((event) => !memberEventIds.has(event.id));
}

function getReminderItems(
  member: HouseholdMember,
  events: FixedEvent[],
  responsibilityCount: number,
  localReminders: LocalHouseholdItem[],
  today: TodayContext,
) {
  const sportsToday = events.some((event) => event.category === "sports");
  const generated = localReminders.map((item) => ({
    id: item.id,
    title: item.title,
  }));

  if (member.role === "child") {
    return [
      ...generated,
      {
        id: "default-child-pack",
        title:
          today.dayType === "school-day"
            ? "Check backpack, shoes, and water bottle before leaving."
            : "Check shoes, water bottle, and anything needed for today's plan.",
      },
      {
        id: "default-child-sports",
        title: sportsToday
          ? "Sports gear may be needed today."
          : "No sports gear is flagged from configured calendars.",
      },
      {
        id: "default-child-responsibility",
        title:
          responsibilityCount > 0
            ? "One house responsibility is scheduled today."
            : "No weekly chore is scheduled today.",
      },
    ];
  }

  return [
    ...generated,
    {
      id: "default-parent-coverage",
      title: "Review pickup, meal, and activity coverage for the day.",
    },
    {
      id: "default-parent-events",
      title:
        events.length > 0
          ? "Configured calendars have fixed events for today."
          : "No fixed calendar events are connected for today yet.",
    },
    {
      id: "default-parent-roadmap",
      title: "Supabase sync, Mac Mini jobs, and identity recognition are future phases.",
    },
  ];
}

function getAppliedEventsForToday(
  events: AppliedCalendarEvent[],
  sources: CalendarSource[],
  teamAssignments: CalendarTeamAssignment[],
  date: string,
): DashboardEvent[] {
  const enabledSourceIds = new Set(sources.filter((source) => source.enabled).map((source) => source.id));

  return events
    .filter((event) => event.date === date && enabledSourceIds.has(event.sourceId))
    .map((event) => ({
      id: createId(`${event.sourceId}-${event.sourceUid ?? event.title}-${event.date}-${event.startTime}`),
      source: event.sourceLabel || event.sourceId,
      sourceUid: event.sourceUid,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      title: event.title,
      category: event.category,
      assignedMemberIds:
        getCalendarTeamAssignment(teamAssignments, getCalendarEventTeamKey(event))?.assignedMemberIds ??
        event.assignedMemberIds ??
        [],
      calendarBehavior: "fixed",
      ...(event.location ? { locationNote: event.location } : {}),
    }));
}

function getConfiguredEventAssignedMemberIds(event: FixedEvent, sources: CalendarSource[]) {
  const source = sources.find((candidate) => isMatchingCalendarSource(candidate, event.source));

  return source?.defaultMemberIds ?? [];
}

function getConfiguredEventAssignmentKey(event: FixedEvent) {
  return `configured:${event.id}`;
}

function getConfiguredEventTeamAssignedMemberIds(
  event: FixedEvent,
  teamAssignments: CalendarTeamAssignment[],
) {
  const teamLabel = inferSportsTeamLabel({
    sourceId: event.source,
    title: event.title,
  });

  if (!teamLabel) {
    return undefined;
  }

  const teamKey = `label:${normalizeTeamLabel(teamLabel)}`;

  return getCalendarTeamAssignment(teamAssignments, teamKey)?.assignedMemberIds;
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

function getEffectiveDayTypeLabel(defaultLabel: string, events: FixedEvent[]) {
  const eventText = events.map((event) => `${event.title} ${event.category}`.toLowerCase()).join(" ");

  if (eventText.includes("holiday") || eventText.includes("labor day")) {
    return "Holiday";
  }

  if (eventText.includes("no school") || eventText.includes("school closed")) {
    return "No-school day";
  }

  return defaultLabel;
}

function hasCompletion(completions: ChoreCompletion[], assignmentId: string, date: string) {
  return completions.some(
    (completion) =>
      completion.assignmentTemplateId === assignmentId && completion.completedAt.startsWith(date),
  );
}

function getVisibleLocalItems(
  items: LocalHouseholdItem[],
  member: HouseholdMember,
  date: string,
) {
  return items.filter(
    (item) =>
      item.date === date && (member.role === "parent" || item.assigneeId === member.id),
  );
}

function getRoutineKey(date: string, memberId: string, routineId: string) {
  return `${date}:${memberId}:${routineId}`;
}

function getActionKey(date: string, memberId: string, actionId: string) {
  return `${date}:${memberId}:${actionId}`;
}

function getTemporaryRoutineCompletionKey(
  date: string,
  memberId: string,
  routineId: string,
  occurrenceId: string,
) {
  return `${date}:${memberId}:temporary-routine:${routineId}:${occurrenceId}`;
}

async function loadRemoteTemporaryRoutines(householdId: string): Promise<RemoteTemporaryRoutineLoad> {
  const supabase = createBrowserSupabaseClient();
  const { data: members, error: membersError } = await supabase
    .from("household_members")
    .select("id, external_key")
    .eq("household_id", householdId)
    .returns<RemoteHouseholdMemberRow[]>();

  if (membersError) {
    throw membersError;
  }

  const memberIdsByExternalKey = Object.fromEntries(
    (members ?? []).map((member) => [member.external_key, member.id]),
  );
  const externalKeysByMemberId = Object.fromEntries(
    (members ?? []).map((member) => [member.id, member.external_key]),
  );

  const { data: actionItems, error: actionItemsError } = await supabase
    .from("household_action_items")
    .select("id, title, start_time, end_time, metadata, created_at")
    .eq("household_id", householdId)
    .eq("item_kind", "routine")
    .eq("status", "active")
    .eq("metadata->>kind", "temporary-routine")
    .returns<RemoteActionItemRow[]>();

  if (actionItemsError) {
    throw actionItemsError;
  }

  const actionItemIds = (actionItems ?? []).map((item) => item.id);

  if (actionItemIds.length === 0) {
    return {
      completionMap: {},
      externalKeysByMemberId,
      memberIdsByExternalKey,
      routines: [],
    };
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from("household_assignments")
    .select("assignable_id, household_member_id")
    .eq("household_id", householdId)
    .eq("assignable_type", "action_item")
    .in("assignable_id", actionItemIds)
    .returns<RemoteAssignmentRow[]>();

  if (assignmentsError) {
    throw assignmentsError;
  }

  const { data: completions, error: completionsError } = await supabase
    .from("household_action_item_completions")
    .select("action_item_id, occurrence_date")
    .eq("household_id", householdId)
    .in("action_item_id", actionItemIds)
    .returns<RemoteActionCompletionRow[]>();

  if (completionsError) {
    throw completionsError;
  }

  const assignmentByActionItemId = new Map(
    (assignments ?? [])
      .filter((assignment) => assignment.household_member_id)
      .map((assignment) => [assignment.assignable_id, assignment.household_member_id!]),
  );
  const actionItemById = new Map((actionItems ?? []).map((item) => [item.id, item]));
  const routineGroups = new Map<string, LocalTemporaryRoutineItem>();

  for (const item of actionItems ?? []) {
    const memberId = assignmentByActionItemId.get(item.id);
    const assigneeId = memberId ? externalKeysByMemberId[memberId] : undefined;
    const metadata = item.metadata ?? {};
    const routineId = metadata.temporaryRoutineId;
    const occurrenceId = metadata.occurrenceId;

    if (!assigneeId || !routineId || !occurrenceId || !metadata.startsOn || !metadata.endsOn) {
      continue;
    }

    const groupKey = `${assigneeId}:${routineId}`;
    const existingRoutine = routineGroups.get(groupKey);
    const routine =
      existingRoutine ??
      {
        id: routineId,
        title: item.title,
        category: metadata.category ?? "personal-hygiene",
        assigneeId,
        startsOn: metadata.startsOn,
        endsOn: metadata.endsOn,
        occurrences: [],
        createdAt: item.created_at,
      };

    routine.occurrences.push({
      id: occurrenceId,
      label: metadata.occurrenceLabel ?? "",
      startTime: normalizeTimeForInput(item.start_time),
      endTime: normalizeTimeForInput(item.end_time),
      remoteActionItemId: item.id,
    });
    routineGroups.set(groupKey, routine);
  }

  const routines = [...routineGroups.values()]
    .map((routine) => ({
      ...routine,
      occurrences: routine.occurrences.sort((first, second) =>
        compareStrings(`${first.startTime}-${first.label}`, `${second.startTime}-${second.label}`),
      ),
    }))
    .sort((first, second) => compareStrings(`${first.assigneeId}-${first.title}`, `${second.assigneeId}-${second.title}`));

  const completionMap: Record<string, boolean> = {};

  for (const completion of completions ?? []) {
    const actionItem = actionItemById.get(completion.action_item_id);
    const memberId = assignmentByActionItemId.get(completion.action_item_id);
    const memberExternalKey = memberId ? externalKeysByMemberId[memberId] : undefined;
    const metadata = actionItem?.metadata ?? {};

    if (!actionItem || !memberExternalKey || !metadata.temporaryRoutineId || !metadata.occurrenceId) {
      continue;
    }

    completionMap[
      getTemporaryRoutineCompletionKey(
        completion.occurrence_date,
        memberExternalKey,
        metadata.temporaryRoutineId,
        metadata.occurrenceId,
      )
    ] = true;
  }

  return {
    completionMap,
    externalKeysByMemberId,
    memberIdsByExternalKey,
    routines,
  };
}

async function saveRemoteTemporaryRoutine({
  householdId,
  memberId,
  routine,
}: {
  householdId: string;
  memberId?: string;
  routine: LocalTemporaryRoutineItem;
}) {
  if (!memberId) {
    throw new Error("Create household members in setup before assigning a temporary routine.");
  }

  const supabase = createBrowserSupabaseClient();
  const { data: actionItems, error: actionItemsError } = await supabase
    .from("household_action_items")
    .insert(
      routine.occurrences.map((occurrence) => ({
        household_id: householdId,
        item_kind: "routine",
        title: routine.title,
        source: "manual",
        days_of_week: dayOptions,
        start_time: occurrence.startTime,
        end_time: occurrence.endTime,
        metadata: {
          kind: "temporary-routine",
          temporaryRoutineId: routine.id,
          occurrenceId: occurrence.id,
          occurrenceLabel: occurrence.label,
          startsOn: routine.startsOn,
          endsOn: routine.endsOn,
          category: routine.category ?? "personal-hygiene",
        },
      })),
    )
    .select("id, metadata")
    .returns<Array<{ id: string; metadata: RemoteTemporaryRoutineMetadata }>>();

  if (actionItemsError) {
    throw actionItemsError;
  }

  const actionItemsByOccurrenceId = new Map(
    (actionItems ?? []).map((item) => [item.metadata.occurrenceId, item.id]),
  );
  const assignmentRows = (actionItems ?? []).map((item) => ({
    household_id: householdId,
    assignable_type: "action_item",
    assignable_id: item.id,
    assignee_type: "member",
    household_member_id: memberId,
  }));

  const { error: assignmentsError } = await supabase.from("household_assignments").insert(assignmentRows);

  if (assignmentsError) {
    await supabase
      .from("household_action_items")
      .delete()
      .eq("household_id", householdId)
      .in(
        "id",
        (actionItems ?? []).map((item) => item.id),
      );
    throw assignmentsError;
  }

  return {
    ...routine,
    occurrences: routine.occurrences.map((occurrence) => ({
      ...occurrence,
      remoteActionItemId: actionItemsByOccurrenceId.get(occurrence.id),
    })),
  };
}

async function removeRemoteTemporaryRoutine({
  actionItemIds,
  householdId,
}: {
  actionItemIds: string[];
  householdId: string;
}) {
  if (actionItemIds.length === 0) {
    return;
  }

  const supabase = createBrowserSupabaseClient();
  const { error: completionsError } = await supabase
    .from("household_action_item_completions")
    .delete()
    .eq("household_id", householdId)
    .in("action_item_id", actionItemIds);

  if (completionsError) {
    throw completionsError;
  }

  const { error: assignmentsError } = await supabase
    .from("household_assignments")
    .delete()
    .eq("household_id", householdId)
    .eq("assignable_type", "action_item")
    .in("assignable_id", actionItemIds);

  if (assignmentsError) {
    throw assignmentsError;
  }

  const { error: actionItemsError } = await supabase
    .from("household_action_items")
    .delete()
    .eq("household_id", householdId)
    .in("id", actionItemIds);

  if (actionItemsError) {
    throw actionItemsError;
  }
}

async function saveRemoteTemporaryRoutineCompletion({
  actionItemId,
  completed,
  date,
  householdId,
  memberId,
}: {
  actionItemId: string;
  completed: boolean;
  date: string;
  householdId: string;
  memberId?: string;
}) {
  if (!memberId) {
    throw new Error("Create household members in setup before completing a temporary routine.");
  }

  const supabase = createBrowserSupabaseClient();

  if (!completed) {
    const { error } = await supabase
      .from("household_action_item_completions")
      .delete()
      .eq("household_id", householdId)
      .eq("action_item_id", actionItemId)
      .eq("occurrence_date", date);

    if (error) {
      throw error;
    }

    return;
  }

  const { error } = await supabase.from("household_action_item_completions").upsert(
    {
      household_id: householdId,
      action_item_id: actionItemId,
      occurrence_date: date,
      completed_by_member_id: memberId,
      completed_at: new Date().toISOString(),
      metadata: {
        source: "profile-dashboard",
      },
    },
    {
      onConflict: "household_id,action_item_id,occurrence_date",
    },
  );

  if (error) {
    throw error;
  }
}

function normalizeTimeForInput(value: string | null) {
  return value ? value.slice(0, 5) : "";
}

function TemporaryRoutineModal({
  defaultAssigneeId,
  defaultDate,
  members,
  onClose,
  onSave,
}: {
  defaultAssigneeId: string;
  defaultDate: string;
  members: HouseholdMember[];
  onClose: () => void;
  onSave: (input: Omit<LocalTemporaryRoutineItem, "createdAt" | "id">) => void | Promise<void>;
}) {
  const [title, setTitle] = useState("Clean ears");
  const [category, setCategory] = useState<ResponsibilityCategory>("personal-hygiene");
  const [assigneeId, setAssigneeId] = useState(defaultAssigneeId);
  const [startsOn, setStartsOn] = useState(defaultDate);
  const [endsOn, setEndsOn] = useState(shiftDate(defaultDate, 42));
  const [occurrences, setOccurrences] = useState([
    { id: "morning", label: "Morning", startTime: "08:00", endTime: "08:05" },
    { id: "afternoon", label: "Afternoon", startTime: "14:00", endTime: "14:05" },
    { id: "bedtime", label: "Bedtime", startTime: "20:00", endTime: "20:05" },
  ]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    onSave({
      assigneeId,
      category,
      endsOn,
      occurrences,
      startsOn,
      title,
    });
  }

  function updateOccurrence(
    occurrenceId: string,
    patch: Partial<(typeof occurrences)[number]>,
  ) {
    setOccurrences((current) =>
      current.map((occurrence) =>
        occurrence.id === occurrenceId
          ? {
              ...occurrence,
              ...patch,
            }
          : occurrence,
      ),
    );
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
            <h2 className="text-xl font-semibold">Add temp routine</h2>
            <p className="mt-1 text-sm text-[#4c5965]">
              Use this for short-term care routines that need several checkoffs per day.
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

        <form className="grid gap-3" onSubmit={submit}>
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_170px]">
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Routine</span>
              <input
                className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Category</span>
              <select
                className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                onChange={(event) => setCategory(event.target.value as ResponsibilityCategory)}
                value={category}
              >
                {responsibilityCategories.map((option) => (
                  <option key={option} value={option}>
                    {categoryLabel(option)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">For</span>
              <select
                className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                onChange={(event) => setAssigneeId(event.target.value)}
                value={assigneeId}
              >
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.preferredName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Starts</span>
              <input
                className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                onChange={(event) => setStartsOn(event.target.value)}
                type="date"
                value={startsOn}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Ends</span>
              <input
                className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                onChange={(event) => setEndsOn(event.target.value)}
                type="date"
                value={endsOn}
              />
            </label>
          </div>

          <fieldset className="grid gap-2 text-sm">
            <legend className="font-semibold">Daily checkoffs</legend>
            <div className="grid gap-2">
              {occurrences.map((occurrence) => (
                <div className="grid gap-2 sm:grid-cols-[1fr_140px_140px]" key={occurrence.id}>
                  <input
                    className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                    onChange={(event) => updateOccurrence(occurrence.id, { label: event.target.value })}
                    value={occurrence.label}
                  />
                  <input
                    className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                    onChange={(event) => updateOccurrence(occurrence.id, { startTime: event.target.value })}
                    type="time"
                    value={occurrence.startTime}
                  />
                  <input
                    className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                    onChange={(event) => updateOccurrence(occurrence.id, { endTime: event.target.value })}
                    type="time"
                    value={occurrence.endTime}
                  />
                </div>
              ))}
            </div>
          </fieldset>

          <button
            className="justify-self-end border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!title.trim() || !assigneeId || !startsOn || !endsOn || startsOn > endsOn}
            type="submit"
          >
            Add routine
          </button>
        </form>
      </div>
    </div>
  );
}

function ResponsibilityModal({
  defaultAssigneeId,
  defaultDayOfWeek,
  initialResponsibility,
  members,
  onClose,
  onSave,
}: {
  defaultAssigneeId: string;
  defaultDayOfWeek: DayOfWeek;
  initialResponsibility?: LocalResponsibilityItem;
  members: HouseholdMember[];
  onClose: () => void;
  onSave: (input: Omit<LocalResponsibilityItem, "createdAt" | "id">) => void;
}) {
  const [title, setTitle] = useState(initialResponsibility?.title ?? "");
  const [category, setCategory] = useState<ResponsibilityCategory>(
    initialResponsibility?.category ?? "chores",
  );
  const [assigneeId, setAssigneeId] = useState(
    initialResponsibility?.assigneeId ?? defaultAssigneeId,
  );
  const [daysOfWeek, setDaysOfWeek] = useState<DayOfWeek[]>(
    initialResponsibility?.daysOfWeek ?? [defaultDayOfWeek],
  );
  const [startTime, setStartTime] = useState(initialResponsibility?.startTime ?? "16:00");
  const [endTime, setEndTime] = useState(initialResponsibility?.endTime ?? "16:15");
  const isEditing = Boolean(initialResponsibility);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({
      assigneeId,
      category,
      daysOfWeek,
      endTime,
      startTime,
      title,
    });
  }

  function toggleDay(day: DayOfWeek) {
    setDaysOfWeek((current) =>
      current.includes(day)
        ? current.filter((candidate) => candidate !== day)
        : [...current, day],
    );
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
            <h2 className="text-xl font-semibold">
              {isEditing ? "Edit responsibility" : "Add responsibility"}
            </h2>
            <p className="mt-1 text-sm text-[#4c5965]">
              Choose who owns it, when it appears, and where it is grouped.
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

        <form className="grid gap-3" onSubmit={submit}>
          <div className="grid gap-3 lg:grid-cols-[1fr_170px_170px]">
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Responsibility</span>
              <input
                className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Make bed, finish math, practice shots, take trash out..."
                value={title}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Category</span>
              <select
                className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                onChange={(event) => setCategory(event.target.value as ResponsibilityCategory)}
                value={category}
              >
                {responsibilityCategories.map((option) => (
                  <option key={option} value={option}>
                    {categoryLabel(option)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">For</span>
              <select
                className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                onChange={(event) => setAssigneeId(event.target.value)}
                value={assigneeId}
              >
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.preferredName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset className="grid gap-2 text-sm">
            <legend className="font-semibold">Days</legend>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {dayOptions.map((day) => (
                <label
                  className="flex items-center justify-center gap-2 border border-[#d7e0e7] bg-[#f8fafc] px-2 py-2 text-xs font-semibold"
                  key={day}
                >
                  <input
                    checked={daysOfWeek.includes(day)}
                    onChange={() => toggleDay(day)}
                    type="checkbox"
                  />
                  {day}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-[140px_140px_1fr_auto]">
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
            <span />
            <button
              className="self-end border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={daysOfWeek.length === 0}
              type="submit"
            >
              {isEditing ? "Save" : "Add"}
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

function sourceLabel(source: string) {
  if (source === "sportsengine-calendar") {
    return "Sports";
  }

  if (source === "family-calendar") {
    return "Family";
  }

  return source.replace(/-calendar$/, "").replace(/-/g, " ");
}

function formatTimeRange(startTime: string, endTime: string) {
  if (startTime === "00:00" && endTime === "23:59") {
    return "All Day";
  }

  if (!isClockTime(startTime) || !isClockTime(endTime)) {
    return `${startTime}-${endTime}`;
  }

  return `${formatClockTime(startTime)}-${formatClockTime(endTime)}`;
}

function formatClockTime(time: string) {
  const [hourValue, minuteValue] = time.split(":").map(Number);
  const period = hourValue >= 12 ? "PM" : "AM";
  const hour = hourValue % 12 || 12;

  return `${hour}:${String(minuteValue).padStart(2, "0")} ${period}`;
}

function isClockTime(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold text-[#17202a]">{label}</dt>
      <dd className="mt-1 text-[#4c5965]">{value}</dd>
    </div>
  );
}

function Panel({
  action,
  children,
  title,
}: Readonly<{ action?: React.ReactNode; children: React.ReactNode; title: string }>) {
  return (
    <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Checklist({ children }: Readonly<{ children: React.ReactNode }>) {
  return <ul className="grid gap-2">{children}</ul>;
}

function ChecklistItem({
  checked,
  isPastDue = false,
  meta,
  onChange,
  onEdit,
  onRemove,
  sourceLabel,
  title,
}: {
  checked: boolean;
  isPastDue?: boolean;
  meta: string;
  onChange: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
  sourceLabel: string;
  title: string;
}) {
  const itemClass = checked
    ? "border-[#b7d8c3] bg-[#f1faf3]"
    : isPastDue
      ? "border-[#e0b9a7] bg-[#fff4ed]"
      : "border-[#d7e0e7] bg-[#f8fafc]";

  return (
    <li>
      <div className={`grid grid-cols-[1fr_auto] gap-2 border px-3 py-3 text-sm ${itemClass}`}>
        <label className="grid cursor-pointer grid-cols-[24px_1fr] gap-3">
          <input checked={checked} className="mt-1 h-4 w-4" onChange={onChange} type="checkbox" />
          <span>
            <span className={checked ? "block font-semibold text-[#657381] line-through" : "block font-semibold"}>
              {title}
            </span>
            <span className="mt-1 block text-xs text-[#657381]">
              {meta} · {sourceLabel}
            </span>
          </span>
        </label>
        <span className="grid justify-items-end gap-2">
          {isPastDue ? (
            <span className="border border-[#e0b9a7] bg-white px-2 py-1 text-xs font-semibold text-[#8a3f2f]">
              Missed
            </span>
          ) : null}
          {onEdit ? (
            <button
              className="border border-[#d7e0e7] bg-white px-2 py-1 text-xs font-semibold text-[#1f6f8b]"
              onClick={onEdit}
              type="button"
            >
              Edit
            </button>
          ) : null}
          {onRemove ? (
            <button
              className="border border-[#d7e0e7] bg-white px-2 py-1 text-xs font-semibold text-[#8a2f2f]"
              onClick={onRemove}
              type="button"
            >
              Remove
            </button>
          ) : null}
        </span>
      </div>
    </li>
  );
}

function EventRow({ event }: { event: FixedEvent }) {
  return (
    <li className="grid gap-2 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm sm:grid-cols-[120px_1fr_80px]">
      <time className="font-semibold text-[#1f6f8b]">
        {formatTimeRange(event.startTime, event.endTime)}
      </time>
      <div>
        <p className="font-semibold">{event.title}</p>
        {event.locationNote ? <p className="mt-1 text-xs text-[#657381]">{event.locationNote}</p> : null}
      </div>
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
        {sourceLabel(event.source)}
      </span>
    </li>
  );
}

function OtherEventRow({ event, members }: { event: FixedEvent; members: HouseholdMember[] }) {
  const assignedMemberNames = getAssignedMemberNames(event, members);
  const eventOwnerLabel =
    assignedMemberNames.length > 0 ? assignedMemberNames.join(", ") : "Household";

  return (
    <li className="grid gap-2 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm sm:grid-cols-[120px_1fr_110px]">
      <time className="font-semibold text-[#1f6f8b]">
        {formatTimeRange(event.startTime, event.endTime)}
      </time>
      <div>
        <p className="font-semibold">{event.title}</p>
        <p className="mt-1 text-xs text-[#657381]">{eventOwnerLabel}</p>
        {event.locationNote ? <p className="mt-1 text-xs text-[#657381]">{event.locationNote}</p> : null}
      </div>
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
        {sourceLabel(event.source)}
      </span>
    </li>
  );
}

function getAssignedMemberNames(event: FixedEvent, members: HouseholdMember[]) {
  const assignedMemberIds = event.assignedMemberIds ?? [];

  return assignedMemberIds
    .map((memberId) => members.find((member) => member.id === memberId)?.preferredName)
    .filter((name): name is string => Boolean(name));
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

function EmptyState({ text }: { text: string }) {
  return <p className="border border-dashed border-[#cbd5df] bg-[#f8fafc] px-3 py-4 text-sm text-[#4c5965]">{text}</p>;
}
