"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  applyAllowanceEntryDraft,
  canRenameAllowanceEntry,
  type AllowanceEntryDraftInput,
} from "@/lib/allowance/entries";
import {
  allowanceStorageKey,
  createChoreAllowanceEntry,
  formatCurrency,
  getAllowanceBalance,
  getChoreAllowanceAmount,
  normalizeCurrencyAmount,
  removeAllowanceEntriesForCompletion,
  type AllowanceStorageState,
} from "@/lib/allowance/storage";
import {
  createRemoteMorningRoutineAllowanceEntry,
  deleteRemoteAllowanceEntry,
  deleteRemoteMorningRoutineAllowanceEntry,
  isMissingAllowanceEntriesTableError,
  updateRemoteAllowanceEntry,
} from "@/lib/allowance/remote";
import { canApproveAllowanceRequests } from "@/lib/allowance/approval";
import {
  approveRemoteAllowanceRequest,
  createRemoteAllowanceRequest,
  loadRemoteAllowanceRequests,
  type AllowanceRequest,
  updateRemoteAllowanceRequest,
} from "@/lib/allowance/requests";
import {
  createMorningRoutineAllowanceEntry,
  getMorningRoutineAllowanceAmount,
  getMorningRoutineOccurredAt,
  hasMorningRoutineAllowanceEntry,
  removeMorningRoutineAllowanceEntries,
} from "@/lib/allowance/morning-routine";
import { planMorningRoutineSync } from "@/lib/allowance/morning-routine-sync";
import { choreCategories, getChoreCategoryLabel, normalizeChoreCategory } from "@/lib/chores/categories";
import { createRemoteChoreCompletion, deleteRemoteChoreCompletion } from "@/lib/chores/completions";
import { choreStorageKey, type ChoreStorageState } from "@/lib/chores/storage";
import { getConfiguredEventsAfterAppliedSourceReplacements } from "@/lib/calendar/applied-source-replacements";
import { getAppliedCalendarEventAssignmentKey } from "@/lib/calendar/applied-events";
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
import { getBirthdayCountdown, getBirthdayEventsForDate } from "@/lib/planner/birthdays";
import { useLocalStorageState } from "@/lib/storage/local";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useCurrentHousehold } from "@/lib/supabase/household";
import type {
  AllowanceEntry,
  ChoreCompletion,
  DayTemplate,
  DayOfWeek,
  FixedEvent,
  HouseholdMember,
  PlannerData,
  RoutineChore,
  ScheduleBlock,
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
  localScheduleEvents: LocalScheduledEvent[];
  localTemporaryRoutines: LocalTemporaryRoutineItem[];
};

type ProfileDashboardProps = {
  allowance: PlannerData["allowance"];
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
  source: "configured" | "local" | "remote";
  remoteActionItemId?: string;
  completionKey?: string;
};

type DashboardHouseholdItem = LocalHouseholdItem & {
  completionKey?: string;
  remoteActionItemId?: string;
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
    | "open-responsibility"
    | "temporary-routine";
  assignment?: AssignmentWithChore;
  localResponsibility?: LocalResponsibilityItem;
  localTaskId?: string;
  temporaryRoutineId?: string;
  remoteActionItemId?: string;
  completionKey?: string;
  allowanceAmount?: number;
};

type RemoteTemporaryRoutineMetadata = {
  baselineBlockId?: string;
  baselineTemplateId?: string;
  baselineTemplateName?: string;
  kind?: string;
  category?: string;
  noiseLevel?: "low" | "medium" | "high" | "variable";
  location?: ScheduleBlock["location"];
  routineTemplateId?: string;
  routineTemplateName?: string;
  stepId?: string;
  temporaryRoutineId?: string;
  occurrenceId?: string;
  occurrenceLabel?: string;
  startsOn?: string;
  endsOn?: string;
};

type RemoteHouseholdMemberRow = {
  id: string;
  external_key: string;
  metadata?: {
    morningRoutineAllowanceAmount?: number;
  };
};

type RemoteHouseholdMemberConfigRow = {
  id: string;
  external_key: string;
  metadata: {
    morningRoutineAllowanceAmount?: number;
  };
};

type RemoteChoreRow = {
  id: string;
  title: string;
  category_id: string;
  metadata: {
    allowanceAmount?: number;
    eligibleAssigneeIds?: string[];
    estimatedMinutes?: number;
    requiresAdultCheck?: boolean;
  };
};

type RemoteChoreTemplateRow = {
  id: string;
  chore_id: string;
  day_of_week: DayOfWeek;
  metadata: {
    endTime?: string;
    startTime?: string;
  };
};

type RemoteChoreCompletionRow = {
  id: string;
  assignment_template_id: string | null;
  chore_id: string;
  completed_at: string;
  completed_by_member_id: string | null;
};

type RemoteActionItemRow = {
  id: string;
  item_kind?: "routine" | "task" | "reminder";
  title: string;
  days_of_week?: string[];
  start_time: string | null;
  end_time: string | null;
  occurrence_date?: string | null;
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

type RemoteHouseholdItemLoad = {
  completionMap: Record<string, boolean>;
  items: DashboardHouseholdItem[];
  responsibilities: LocalResponsibilityItem[];
};

type RemoteBaselineTemplateLoad = {
  templates: DayTemplate[];
};

type RemoteBaselineScheduleLoad = {
  events: DashboardEvent[];
};

type ResponsibilityDraftInput =
  | ({
      mode: "weekly";
    } & Omit<LocalResponsibilityItem, "createdAt" | "id">)
  | {
      mode: "open";
      assigneeId: string;
      availableFrom: string;
      category: ResponsibilityCategory;
      title: string;
    };

type RemoteRoutineLoad = {
  completions: Record<string, boolean>;
  routines: DashboardRoutineItem[];
};

type RemoteDashboardChoreState = {
  completions: ChoreCompletion[];
  memberIdsByExternalKey: Record<string, string>;
  weeklyAssignmentTemplates: WeeklyChoreAssignmentTemplate[];
  weeklyChores: WeeklyChore[];
};

type RemoteAllowanceEntryRow = {
  id: string;
  household_member_id: string;
  amount_cents: number;
  chore_completion_id: string | null;
  chore_id: string | null;
  entry_type: string;
  occurred_at: string;
  metadata: {
    allowanceRequestId?: string;
    assignmentTemplateId?: string;
    choreTitle?: string;
    label?: string;
    note?: string;
    routineCategory?: string;
    routineCompletionDate?: string;
  };
};

type AllowanceRequestDraftInput = {
  amount: string;
  category: string;
  childId: string;
  note: string;
  occurrenceDate: string;
  title: string;
};

type AllowanceRequestModalState =
  | { mode: "create"; draft: AllowanceRequestDraftInput }
  | { mode: "edit"; draft: AllowanceRequestDraftInput; request: AllowanceRequest }
  | null;

type AllowanceEntryModalState = {
  draft: AllowanceEntryDraftInput;
  entry: AllowanceEntry;
} | null;

type DashboardEvent = FixedEvent & {
  assignedMemberIds?: string[];
};

type LocalScheduledEvent = FixedEvent & {
  assignedMemberIds: string[];
  createdAt: string;
  baselineBlockId?: string;
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
  allowance,
  chores,
  configuredResponsibilities,
  dayTemplates,
  fixedEvents,
  members,
  season,
  today,
}: ProfileDashboardProps) {
  const router = useRouter();
  const childMembers = useMemo(() => members.filter((member) => member.role === "child"), [members]);
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
      localScheduleEvents: [],
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
  const [choreConfig, setChoreConfig] = useLocalStorageState(choreStorageKey, fallbackChoreConfig);
  const fallbackAllowanceState = useMemo<AllowanceStorageState>(
    () => ({
      entries: allowance.entries,
    }),
    [allowance.entries],
  );
  const [allowanceState, setAllowanceState] = useLocalStorageState(
    allowanceStorageKey,
    fallbackAllowanceState,
  );
  const { appliedEvents: appliedCalendarEvents, sources: calendarSources } = useCalendarFeed();
  const [calendarEventAssignments] = useLocalStorageState<Record<string, string[]>>(
    calendarEventAssignmentsStorageKey,
    {},
  );
  const [calendarTeamAssignments] = useLocalStorageState<CalendarTeamAssignment[]>(
    calendarTeamAssignmentsStorageKey,
    [],
  );
  const { household, households, selectHousehold, status: householdStatus } = useCurrentHousehold();
  const [remoteTemporaryRoutines, setRemoteTemporaryRoutines] = useState<LocalTemporaryRoutineItem[]>([]);
  const [remoteBaselineTemplates, setRemoteBaselineTemplates] = useState<DayTemplate[]>([]);
  const [remoteBaselineScheduleEvents, setRemoteBaselineScheduleEvents] = useState<DashboardEvent[]>([]);
  const [remoteHouseholdItems, setRemoteHouseholdItems] = useState<DashboardHouseholdItem[]>([]);
  const [remoteResponsibilities, setRemoteResponsibilities] = useState<LocalResponsibilityItem[]>([]);
  const [remoteTemporaryCompletions, setRemoteTemporaryCompletions] = useState<Record<string, boolean>>({});
  const [remoteHouseholdItemCompletions, setRemoteHouseholdItemCompletions] = useState<Record<string, boolean>>({});
  const [remoteRoutineItems, setRemoteRoutineItems] = useState<DashboardRoutineItem[]>([]);
  const [remoteRoutineCompletions, setRemoteRoutineCompletions] = useState<Record<string, boolean>>({});
  const [remoteAllowanceEntries, setRemoteAllowanceEntries] = useState<AllowanceEntry[]>([]);
  const [remoteAllowanceRequests, setRemoteAllowanceRequests] = useState<AllowanceRequest[]>([]);
  const [remoteMemberIdsByExternalKey, setRemoteMemberIdsByExternalKey] = useState<Record<string, string>>({});
  const [remoteMemberConfigsByExternalKey, setRemoteMemberConfigsByExternalKey] = useState<
    Record<string, { morningRoutineAllowanceAmount?: number }>
  >({});
  const [remoteTemporaryRoutineError, setRemoteTemporaryRoutineError] = useState("");
  const [remoteBaselineError, setRemoteBaselineError] = useState("");
  const [remoteHouseholdItemError, setRemoteHouseholdItemError] = useState("");
  const [remoteChoreError, setRemoteChoreError] = useState("");
  const [remoteAllowanceError, setRemoteAllowanceError] = useState("");
  const [allowanceEntryError, setAllowanceEntryError] = useState("");
  const [remoteAllowanceRequestError, setRemoteAllowanceRequestError] = useState("");
  const [baselineScheduleSyncVersion, setBaselineScheduleSyncVersion] = useState(0);
  const [householdItemSyncVersion, setHouseholdItemSyncVersion] = useState(0);
  const [temporaryRoutineSyncVersion, setTemporaryRoutineSyncVersion] = useState(0);
  const [routineSyncVersion, setRoutineSyncVersion] = useState(0);
  const [choreSyncVersion, setChoreSyncVersion] = useState(0);
  const [allowanceRequestSyncVersion, setAllowanceRequestSyncVersion] = useState(0);
  const [selectedDate, setSelectedDate] = useState(today.date);
  const [approvingAllowanceRequestId, setApprovingAllowanceRequestId] = useState("");
  const [allowanceEntryModal, setAllowanceEntryModal] = useState<AllowanceEntryModalState>(null);
  const [allowanceRequestModal, setAllowanceRequestModal] = useState<AllowanceRequestModalState>(null);
  const [morningRoutineCelebrationKey, setMorningRoutineCelebrationKey] = useState(0);
  const [responsibilityModal, setResponsibilityModal] = useState<
    | { mode: "add" }
    | { mode: "edit"; responsibility: LocalResponsibilityItem }
    | null
  >(null);
  const [baselineScheduleModal, setBaselineScheduleModal] = useState<ScheduleBlock[] | null>(null);
  const [selectedBaselineBlockIds, setSelectedBaselineBlockIds] = useState<string[]>([]);
  const [temporaryRoutineModal, setTemporaryRoutineModal] = useState(false);
  const [collapsedResponsibilityCategories, setCollapsedResponsibilityCategories] = useState<
    Partial<Record<ResponsibilityCategory, boolean>>
  >({});
  const morningRoutineProgressRef = useRef<{ contextKey: string; isComplete: boolean }>({
    contextKey: "",
    isComplete: false,
  });
  const morningRoutineAllowanceSyncQueueRef = useRef(Promise.resolve());
  const isRemoteHouseholdReady = householdStatus === "ready" && Boolean(household?.householdId);
  const selectedMember =
    members.find((member) => member.id === state.selectedMemberId) ?? members[0];
  const isAllowanceApprovalMode = canApproveAllowanceRequests({
    householdRole: household?.role,
    selectedMemberRole: selectedMember.role,
  });
  const requestedByRemoteMemberId = remoteMemberIdsByExternalKey[selectedMember.id];
  const remoteExternalKeysByMemberId = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(remoteMemberIdsByExternalKey).map(([externalKey, remoteMemberId]) => [
          remoteMemberId,
          externalKey,
        ]),
      ),
    [remoteMemberIdsByExternalKey],
  );
  const effectiveDayTemplates = useMemo(
    () =>
      isRemoteHouseholdReady && remoteBaselineTemplates.length > 0
        ? [...remoteBaselineTemplates, ...dayTemplates]
        : dayTemplates,
    [dayTemplates, isRemoteHouseholdReady, remoteBaselineTemplates],
  );
  const displayedDay = useMemo(
    () =>
      getDashboardDayContext({
        date: selectedDate,
        dayTemplates: effectiveDayTemplates,
        fixedEvents,
        season,
      }),
    [effectiveDayTemplates, fixedEvents, season, selectedDate],
  );
  const choresById = useMemo(
    () => new Map(choreConfig.weeklyChores.map((chore) => [chore.id, chore])),
    [choreConfig.weeklyChores],
  );
  const routineItems = getRoutineItems(
    choreConfig.routineChores,
    state.localRoutines,
    isRemoteHouseholdReady ? remoteRoutineItems : [],
    isRemoteHouseholdReady,
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
    calendarEventAssignments,
    calendarTeamAssignments,
    displayedDay.date,
  );
  const localScheduleEvents = getLocalScheduleEventsForDate(
    state.localScheduleEvents,
    displayedDay.date,
  );
  const dayScheduleEvents = getDayScheduleEvents(
    importedEvents,
    isRemoteHouseholdReady ? remoteBaselineScheduleEvents : localScheduleEvents,
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
  const birthdayEvents = getBirthdayEventsForDate(members, displayedDay.date);
  const effectiveEvents = [...configuredEvents, ...importedEvents, ...birthdayEvents];
  const scheduleEvents = getRelevantEvents(dayScheduleEvents, selectedMember);
  const otherScheduleEvents = getOtherEvents(dayScheduleEvents, scheduleEvents, selectedMember);
  const dayTypeLabel = getEffectiveDayTypeLabel(displayedDay.dayTypeLabel, effectiveEvents);
  const visibleHouseholdItems = getVisibleLocalItems(
    isRemoteHouseholdReady ? [...remoteHouseholdItems, ...state.localItems] : state.localItems,
    selectedMember,
    displayedDay.date,
  );
  const localTasks = visibleHouseholdItems.filter((item) => item.kind === "task");
  const localReminders = visibleHouseholdItems.filter((item) => item.kind === "reminder");
  const temporaryRoutines = isRemoteHouseholdReady
    ? remoteTemporaryRoutines
    : state.localTemporaryRoutines;
  const dashboardStateForView = useMemo<DashboardState>(
    () => ({
      ...state,
      actionCompletions: {
        ...state.actionCompletions,
        ...remoteHouseholdItemCompletions,
        ...remoteRoutineCompletions,
        ...remoteTemporaryCompletions,
      },
      choreCompletions: choreConfig.completions,
      localTemporaryRoutines: temporaryRoutines,
    }),
    [
      choreConfig.completions,
      remoteHouseholdItemCompletions,
      remoteRoutineCompletions,
      remoteTemporaryCompletions,
      state,
      temporaryRoutines,
    ],
  );
  const responsibilityItems = getResponsibilityItems(
    routineItems,
    assignments,
    configuredResponsibilities,
    isRemoteHouseholdReady ? [...remoteResponsibilities, ...state.localResponsibilities] : state.localResponsibilities,
    temporaryRoutines,
    localTasks,
    selectedMember,
    displayedDay,
  );
  const reminderItems = getReminderItems(
    selectedMember,
    scheduleEvents,
    responsibilityItems.length,
    localReminders,
    displayedDay,
  );
  const selectedMemberAllowanceEntries = (
    isRemoteHouseholdReady && selectedMember.role === "child"
      ? remoteAllowanceEntries
      : allowanceState.entries
  )
    .filter((entry) => entry.childId === selectedMember.id)
    .sort((first, second) => compareStrings(second.occurredAt, first.occurredAt));
  const visibleAllowanceRequests = remoteAllowanceRequests.filter((request) => {
    const childExternalKey = remoteExternalKeysByMemberId[request.childRemoteMemberId];

    if (!childExternalKey) {
      return false;
    }

    return selectedMember.role === "child" ? childExternalKey === selectedMember.id : true;
  });
  const selectedMemberMorningRoutineAllowanceAmount = isRemoteHouseholdReady
    ? getMorningRoutineAllowanceAmount(remoteMemberConfigsByExternalKey[selectedMember.id] ?? null)
    : getMorningRoutineAllowanceAmount(selectedMember);
  const allowanceBalance = getAllowanceBalance(selectedMemberAllowanceEntries, selectedMember.id);
  const remoteSyncErrors = isRemoteHouseholdReady
    ? [
        remoteTemporaryRoutineError,
        remoteBaselineError,
        remoteHouseholdItemError,
        remoteChoreError,
      ].filter((message): message is string => Boolean(message))
    : [];
  const isPastSelectedDate = displayedDay.date < today.date;
  const isTodaySelected = displayedDay.date === today.date;
  const groupedResponsibilityItems = groupResponsibilitiesByCategory(responsibilityItems);
  const selectedBaselineBlocks = displayedDay.baseline.blocks.filter((block) =>
    selectedBaselineBlockIds.includes(block.id),
  );
  const householdId = household?.householdId;

  useEffect(() => {
    if (householdStatus === "signed-out" || householdStatus === "unconfigured") {
      router.replace("/admin");
    }
  }, [householdStatus, router]);

  useEffect(() => {
    if (!householdId || householdStatus !== "ready") {
      return;
    }

    let isActive = true;
    const currentHouseholdId = householdId;

    async function loadRemoteMemberConfigs() {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data, error } = await supabase
          .from("household_members")
          .select("id, external_key, metadata")
          .eq("household_id", currentHouseholdId)
          .eq("status", "active")
          .returns<RemoteHouseholdMemberConfigRow[]>();

        if (error) {
          throw error;
        }

        if (!isActive) {
          return;
        }

        setRemoteMemberIdsByExternalKey(
          Object.fromEntries((data ?? []).map((member) => [member.external_key, member.id])),
        );
        setRemoteMemberConfigsByExternalKey(
          Object.fromEntries(
            (data ?? []).map((member) => [
              member.external_key,
              {
                morningRoutineAllowanceAmount: normalizeCurrencyAmount(
                  member.metadata?.morningRoutineAllowanceAmount,
                ),
              },
            ]),
          ),
        );
        setRemoteAllowanceError("");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setRemoteAllowanceError(
          error instanceof Error ? error.message : "Could not load household member settings.",
        );
      }
    }

    void loadRemoteMemberConfigs();

    return () => {
      isActive = false;
    };
  }, [householdId, householdStatus]);

  useEffect(() => {
    if (!householdId || householdStatus !== "ready") {
      return;
    }

    let isActive = true;
    const currentHouseholdId = householdId;

    async function loadRemoteChoreConfig() {
      try {
        const remoteState = await loadRemoteDashboardChoreState(currentHouseholdId);

        if (!isActive) {
          return;
        }

        setRemoteMemberIdsByExternalKey((current) => ({
          ...current,
          ...remoteState.memberIdsByExternalKey,
        }));
        setChoreConfig((current) => ({
          ...current,
          weeklyChores: remoteState.weeklyChores,
          weeklyAssignmentTemplates: remoteState.weeklyAssignmentTemplates,
          completions: remoteState.completions,
        }));
        setRemoteChoreError("");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setRemoteChoreError(
          error instanceof Error ? error.message : "Could not load chore state from Supabase.",
        );
      }
    }

    void loadRemoteChoreConfig();

    return () => {
      isActive = false;
    };
  }, [householdId, householdStatus, setChoreConfig, choreSyncVersion]);

  useEffect(() => {
    if (!householdId || householdStatus !== "ready") {
      return;
    }

    let isActive = true;
    const currentHouseholdId = householdId;

    async function loadRemoteBaselineTemplateConfig() {
      try {
        const remoteState = await loadRemoteBaselineTemplates(currentHouseholdId);

        if (!isActive) {
          return;
        }

        setRemoteBaselineTemplates(remoteState.templates);
        setRemoteBaselineError("");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setRemoteBaselineError(
          error instanceof Error ? error.message : "Could not load baseline flows from Supabase.",
        );
      }
    }

    void loadRemoteBaselineTemplateConfig();

    return () => {
      isActive = false;
    };
  }, [householdId, householdStatus]);

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
    if (!householdId || householdStatus !== "ready") {
      return;
    }

    let isActive = true;
    const currentHouseholdId = householdId;

    async function loadRemoteBaselineEventsForDate() {
      try {
        const remoteState = await loadRemoteBaselineScheduleEvents(
          currentHouseholdId,
          displayedDay.date,
        );

        if (!isActive) {
          return;
        }

        setRemoteBaselineScheduleEvents(remoteState.events);
        setRemoteBaselineError("");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setRemoteBaselineError(
          error instanceof Error
            ? error.message
            : "Could not load baseline schedule events from Supabase.",
        );
      }
    }

    void loadRemoteBaselineEventsForDate();

    return () => {
      isActive = false;
    };
  }, [displayedDay.date, householdId, householdStatus, baselineScheduleSyncVersion]);

  useEffect(() => {
    if (!householdId || householdStatus !== "ready") {
      return;
    }

    let isActive = true;
    const currentHouseholdId = householdId;

    async function loadRemoteHouseholdActionItemsForDay() {
      try {
        const remoteState = await loadRemoteHouseholdItems(
          currentHouseholdId,
          displayedDay.date,
          displayedDay.dayOfWeek,
        );

        if (!isActive) {
          return;
        }

        setRemoteResponsibilities(remoteState.responsibilities);
        setRemoteHouseholdItems(remoteState.items);
        setRemoteHouseholdItemCompletions(remoteState.completionMap);
        setRemoteHouseholdItemError("");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setRemoteHouseholdItemError(
          error instanceof Error
            ? error.message
            : "Could not load responsibilities, tasks, or reminders from Supabase.",
        );
      }
    }

    void loadRemoteHouseholdActionItemsForDay();

    return () => {
      isActive = false;
    };
  }, [displayedDay.date, displayedDay.dayOfWeek, householdId, householdItemSyncVersion, householdStatus]);

  useEffect(() => {
    if (!householdId || householdStatus !== "ready" || selectedMember.role !== "child") {
      return;
    }

    const currentHouseholdId = householdId;
    const remoteMemberId = remoteMemberIdsByExternalKey[selectedMember.id];

    if (!remoteMemberId) {
      return;
    }

    let isActive = true;

    async function loadAllowanceEntries() {
      try {
        const entries = await loadRemoteAllowanceEntries({
          householdId: currentHouseholdId,
          childId: selectedMember.id,
          remoteMemberId,
        });

        if (!isActive) {
          return;
        }

        setRemoteAllowanceEntries(entries);
        setRemoteAllowanceError("");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setRemoteAllowanceError(
          error instanceof Error ? error.message : "Could not load allowance entries from Supabase.",
        );
      }
    }

    void loadAllowanceEntries();

    return () => {
      isActive = false;
    };
  }, [householdId, householdStatus, remoteMemberIdsByExternalKey, selectedMember.id, selectedMember.role, choreSyncVersion]);

  useEffect(() => {
    if (!householdId || householdStatus !== "ready") {
      return;
    }

    const scopeChildIds =
      selectedMember.role === "child" ? [selectedMember.id] : childMembers.map((member) => member.id);
    const remoteChildIds = scopeChildIds
      .map((childId) => remoteMemberIdsByExternalKey[childId])
      .filter((remoteMemberId): remoteMemberId is string => Boolean(remoteMemberId));

    if (remoteChildIds.length === 0) {
      return;
    }

    let isActive = true;
    const currentHouseholdId = householdId;

    async function loadAllowanceRequestsForScope() {
      try {
        const requests = await loadRemoteAllowanceRequests({
          householdId: currentHouseholdId,
          remoteChildMemberIds: remoteChildIds,
        });

        if (!isActive) {
          return;
        }

        setRemoteAllowanceRequests(requests);
        setRemoteAllowanceRequestError("");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setRemoteAllowanceRequestError(
          error instanceof Error ? error.message : "Could not load pending bank requests from Supabase.",
        );
      }
    }

    void loadAllowanceRequestsForScope();

    return () => {
      isActive = false;
    };
  }, [
    allowanceRequestSyncVersion,
    childMembers,
    householdId,
    householdStatus,
    remoteMemberIdsByExternalKey,
    selectedMember.id,
    selectedMember.role,
  ]);

  useEffect(() => {
    if (!householdId || householdStatus !== "ready") {
      return;
    }

    let isActive = true;
    const currentHouseholdId = householdId;

    async function loadRemoteRoutinesForHousehold() {
      try {
        const remoteState = await loadRemoteRoutines(currentHouseholdId, displayedDay.date, displayedDay.dayOfWeek);

        if (!isActive) {
          return;
        }

        setRemoteRoutineItems(remoteState.routines);
        setRemoteRoutineCompletions(remoteState.completions);
        setRemoteTemporaryRoutineError("");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setRemoteTemporaryRoutineError(
          error instanceof Error ? error.message : "Could not load household routines from Supabase.",
        );
      }
    }

    void loadRemoteRoutinesForHousehold();

    return () => {
      isActive = false;
    };
  }, [displayedDay.date, displayedDay.dayOfWeek, householdId, householdStatus, routineSyncVersion]);

  const queueMorningRoutineAllowanceSync = useEffectEvent(
    ({
      childId,
      completionDate,
      contextKey,
      occurredAt,
      rewardAmount,
      shouldAward,
      shouldCelebrate,
    }: {
      childId: string;
      completionDate: string;
      contextKey: string;
      occurredAt: string;
      rewardAmount: number | undefined;
      shouldAward: boolean;
      shouldCelebrate: boolean;
    }) => {
      morningRoutineAllowanceSyncQueueRef.current = morningRoutineAllowanceSyncQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (selectedMember.role !== "child") {
            return;
          }

          const celebrate = () => {
            if (contextKey === `${displayedDay.date}:${selectedMember.id}`) {
              setMorningRoutineCelebrationKey((current) => current + 1);
            }
          };

          if (isRemoteHouseholdReady && householdId) {
            const remoteMemberId = remoteMemberIdsByExternalKey[childId];

            if (!remoteMemberId) {
              if (shouldAward && rewardAmount) {
                setRemoteAllowanceError("Open Setup and save household members before tracking allowance.");
              }
              return;
            }

            try {
              if (!shouldAward || !rewardAmount) {
                await deleteRemoteMorningRoutineAllowanceEntry({
                  completionDate,
                  householdId,
                  householdMemberId: remoteMemberId,
                });
                setRemoteAllowanceEntries((current) =>
                  removeMorningRoutineAllowanceEntries(current, childId, completionDate),
                );
                setRemoteAllowanceError("");
              } else {
                const entry = await createRemoteMorningRoutineAllowanceEntry({
                  amount: rewardAmount,
                  childId,
                  completionDate,
                  householdId,
                  householdMemberId: remoteMemberId,
                  occurredAt,
                });

                setRemoteAllowanceEntries((current) => {
                  const withoutExisting = removeMorningRoutineAllowanceEntries(current, childId, completionDate);
                  return [...withoutExisting, entry];
                });
                setRemoteAllowanceError("");
              }
            } catch (error) {
              setRemoteAllowanceError(
                error instanceof Error ? error.message : "Could not update morning routine allowance.",
              );
              return;
            }

            if (shouldCelebrate) {
              celebrate();
            }

            return;
          }

          setAllowanceState((current) => {
            const nextEntries = removeMorningRoutineAllowanceEntries(current.entries, childId, completionDate);

            if (!shouldAward || !rewardAmount) {
              return {
                entries: nextEntries,
              };
            }

            if (hasMorningRoutineAllowanceEntry(current.entries, childId, completionDate)) {
              return current;
            }

            const entry = createMorningRoutineAllowanceEntry({
              amount: rewardAmount,
              childId,
              completionDate,
              id: createId(`morning-routine-${childId}-${completionDate}`),
              occurredAt,
            });

            return entry
              ? {
                  entries: [...nextEntries, entry],
                }
              : current;
          });

          if (shouldCelebrate) {
            celebrate();
          }
        });
    },
  );

  useEffect(() => {
    const morningRoutineItems =
      groupedResponsibilityItems.find(([category]) => category === "morning-routine")?.[1] ?? [];
    const contextKey = `${displayedDay.date}:${selectedMember.id}`;

    if (morningRoutineItems.length === 0) {
      morningRoutineProgressRef.current = {
        contextKey,
        isComplete: false,
      };
      return;
    }

    const isMorningRoutineComplete = morningRoutineItems.every((item) =>
      isResponsibilityComplete(item, dashboardStateForView, displayedDay.date, selectedMember.id),
    );
    const previousProgress = morningRoutineProgressRef.current;

    const syncPlan = planMorningRoutineSync({
      contextKey,
      isComplete: isMorningRoutineComplete,
      previousProgress,
    });

    morningRoutineProgressRef.current = syncPlan.nextProgress;

    if (syncPlan.shouldCollapseCategory) {
      setCollapsedResponsibilityCategories((current) => ({
        ...current,
        "morning-routine": true,
      }));
    } else if (syncPlan.shouldSyncAllowance) {
      setCollapsedResponsibilityCategories((current) => ({
        ...current,
        "morning-routine": false,
      }));
    }

    if (!syncPlan.shouldSyncAllowance) {
      return;
    }
    queueMorningRoutineAllowanceSync({
      childId: selectedMember.id,
      completionDate: displayedDay.date,
      contextKey,
      occurredAt: getMorningRoutineOccurredAt(displayedDay.date, morningRoutineItems),
      rewardAmount: selectedMemberMorningRoutineAllowanceAmount,
      shouldAward: syncPlan.shouldAwardAllowance,
      shouldCelebrate: syncPlan.shouldCelebrate,
    });
  }, [
    dashboardStateForView,
    displayedDay.date,
    groupedResponsibilityItems,
    selectedMember.id,
    selectedMemberMorningRoutineAllowanceAmount,
  ]);

  async function saveAllowanceRequest(
    input: AllowanceRequestDraftInput,
    editingRequest?: AllowanceRequest,
  ) {
    if (!isRemoteHouseholdReady || !householdId) {
      setRemoteAllowanceRequestError("Connect a household in Setup before using approval-based bank requests.");
      throw new Error("Connect a household in Setup before using approval-based bank requests.");
    }

    const targetChildId = input.childId || (selectedMember.role === "child" ? selectedMember.id : childMembers[0]?.id);
    const selectedBankChild =
      childMembers.find((member) => member.id === targetChildId) ?? childMembers[0] ?? null;
    const selectedBankChildRemoteMemberId = selectedBankChild
      ? remoteMemberIdsByExternalKey[selectedBankChild.id]
      : undefined;

    if (!selectedBankChild || !selectedBankChildRemoteMemberId) {
      setRemoteAllowanceRequestError("Open Setup and save household members before creating a bank request.");
      throw new Error("Open Setup and save household members before creating a bank request.");
    }

    const matchedChore = choreConfig.weeklyChores.find(
      (chore) => chore.title.trim().toLowerCase() === input.title.trim().toLowerCase(),
    );

    try {
      const nextRequest = editingRequest
        ? await updateRemoteAllowanceRequest({
            amount: Number(input.amount),
            category: normalizeChoreCategory(matchedChore?.category ?? input.category),
            childRemoteMemberId: selectedBankChildRemoteMemberId,
            choreId: matchedChore?.id,
            choreTitle: input.title,
            householdId,
            note: input.note,
            occurrenceDate: input.occurrenceDate,
            requestId: editingRequest.id,
          })
        : await createRemoteAllowanceRequest({
            amount: Number(input.amount),
            category: normalizeChoreCategory(matchedChore?.category ?? input.category),
            childRemoteMemberId: selectedBankChildRemoteMemberId,
            choreId: matchedChore?.id,
            choreTitle: input.title,
            householdId,
            note: input.note,
            occurrenceDate: input.occurrenceDate,
            requestedByRemoteMemberId,
          });

      setRemoteAllowanceRequests((current) =>
        editingRequest
          ? current.map((request) => (request.id === editingRequest.id ? nextRequest : request))
          : [nextRequest, ...current],
      );
      setAllowanceRequestModal(null);
      setRemoteAllowanceRequestError("");
      setAllowanceRequestSyncVersion((current) => current + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save the bank request.";
      setRemoteAllowanceRequestError(message);
      throw error instanceof Error ? error : new Error(message);
    }
  }

  function openCreateAllowanceRequestModal() {
    const defaultChildId = selectedMember.role === "child" ? selectedMember.id : childMembers[0]?.id ?? "";

    setAllowanceRequestModal({
      mode: "create",
      draft: {
        amount: "1.00",
        category: "yard",
        childId: defaultChildId,
        note: "",
        occurrenceDate: displayedDay.date,
        title: "",
      },
    });
    setRemoteAllowanceRequestError("");
  }

  function openEditAllowanceRequestModal(request: AllowanceRequest) {
    const childId = remoteExternalKeysByMemberId[request.childRemoteMemberId] ?? childMembers[0]?.id ?? "";

    setAllowanceRequestModal({
      mode: "edit",
      draft: {
        amount: request.amount.toFixed(2),
        category: request.category,
        childId,
        note: request.note ?? "",
        occurrenceDate: request.occurrenceDate,
        title: request.choreTitle,
      },
      request,
    });
    setRemoteAllowanceRequestError("");
  }

  function openAllowanceEntryModal(entry: AllowanceEntry) {
    setAllowanceEntryModal({
      draft: {
        amount: entry.amount.toFixed(2),
        note: entry.note ?? "",
        title: entry.choreTitle ?? entry.label ?? "",
      },
      entry,
    });
    setAllowanceEntryError("");
  }

  function closeAllowanceEntryModal() {
    setAllowanceEntryModal(null);
    setAllowanceEntryError("");
  }

  function closeAllowanceRequestModal() {
    setAllowanceRequestModal(null);
    setRemoteAllowanceRequestError("");
  }

  async function saveAllowanceEntry(draft: AllowanceEntryDraftInput, entry: AllowanceEntry) {
    if (!isAllowanceApprovalMode) {
      const message = "Switch to a parent profile before editing a bank entry.";
      setAllowanceEntryError(message);
      throw new Error(message);
    }

    try {
      const nextEntry = applyAllowanceEntryDraft(entry, draft);

      if (isRemoteHouseholdReady && householdId) {
        const updatedEntry = await updateRemoteAllowanceEntry({
          currentEntry: entry,
          draft,
          householdId,
        });
        setRemoteAllowanceEntries((current) =>
          current.map((candidate) => (candidate.id === updatedEntry.id ? updatedEntry : candidate)),
        );
      } else {
        setAllowanceState((current) => ({
          entries: current.entries.map((candidate) => (candidate.id === entry.id ? nextEntry : candidate)),
        }));
      }

      setAllowanceEntryError("");
      closeAllowanceEntryModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update the bank entry.";
      setAllowanceEntryError(message);
      throw error instanceof Error ? error : new Error(message);
    }
  }

  async function removeAllowanceEntry(entry: AllowanceEntry) {
    if (!isAllowanceApprovalMode) {
      const message = "Switch to a parent profile before deleting a bank entry.";
      setAllowanceEntryError(message);
      throw new Error(message);
    }

    try {
      if (isRemoteHouseholdReady && householdId) {
        await deleteRemoteAllowanceEntry({
          entryId: entry.id,
          householdId,
        });
        setRemoteAllowanceEntries((current) => current.filter((candidate) => candidate.id !== entry.id));
      } else {
        setAllowanceState((current) => ({
          entries: current.entries.filter((candidate) => candidate.id !== entry.id),
        }));
      }

      setAllowanceEntryError("");
      closeAllowanceEntryModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not delete the bank entry.";
      setAllowanceEntryError(message);
      throw error instanceof Error ? error : new Error(message);
    }
  }

  async function approveAllowanceRequest(request: AllowanceRequest) {
    if (!isAllowanceApprovalMode) {
      setRemoteAllowanceRequestError("Switch to a parent profile before approving a bank request.");
      return;
    }

    try {
      setApprovingAllowanceRequestId(request.id);
      await approveRemoteAllowanceRequest(request.id);
      setRemoteAllowanceRequests((current) =>
        current.filter((candidate) => candidate.id !== request.id),
      );
      setRemoteAllowanceRequestError("");
      setAllowanceRequestSyncVersion((current) => current + 1);
      setChoreSyncVersion((current) => current + 1);
    } catch (error) {
      setRemoteAllowanceRequestError(
        error instanceof Error ? error.message : "Could not approve the bank request.",
      );
    } finally {
      setApprovingAllowanceRequestId("");
    }
  }

  function selectMember(memberId: string) {
    setState((current) => ({
      ...current,
      selectedMemberId: memberId,
    }));
  }

  function clearBaselineScheduleSelection() {
    setSelectedBaselineBlockIds([]);
    setBaselineScheduleModal(null);
  }

  function setDashboardDate(nextDate: string) {
    clearBaselineScheduleSelection();
    setSelectedDate(nextDate);
  }

  function shiftDashboardDate(days: number) {
    clearBaselineScheduleSelection();
    setSelectedDate((current) => shiftDate(current, days));
  }

  async function toggleRoutine(routine: DashboardRoutineItem) {
    const key = getRoutineKey(displayedDay.date, selectedMember.id, routine.id);

    if (isRemoteHouseholdReady && routine.remoteActionItemId && routine.completionKey) {
      const isComplete = Boolean(dashboardStateForView.actionCompletions[routine.completionKey]);

      setRemoteRoutineCompletions((current) => ({
        ...current,
        [routine.completionKey!]: !isComplete,
      }));

      try {
        await saveRemoteActionItemCompletion({
          actionItemId: routine.remoteActionItemId,
          completed: !isComplete,
          date: displayedDay.date,
          householdId: household!.householdId,
          memberId: remoteMemberIdsByExternalKey[selectedMember.id],
        });
        setRoutineSyncVersion((current) => current + 1);
        setRemoteTemporaryRoutineError("");
      } catch (error) {
        setRemoteRoutineCompletions((current) => ({
          ...current,
          [routine.completionKey!]: isComplete,
        }));
        setRemoteTemporaryRoutineError(
          error instanceof Error ? error.message : "Could not save routine completion.",
        );
      }

      return;
    }

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

  async function toggleAssignment(assignment: AssignmentWithChore) {
    const existing = choreConfig.completions.find(
      (completion) =>
        completion.assignmentTemplateId === assignment.id &&
        completion.completedAt.startsWith(displayedDay.date),
    );

    if (isRemoteHouseholdReady && householdId) {
      if (existing) {
        const previousCompletions = choreConfig.completions;
        const previousAllowanceEntries = allowanceState.entries;

        setChoreConfig((current) => ({
          ...current,
          completions: current.completions.filter((completion) => completion.id !== existing.id),
        }));
        setAllowanceState((current) => ({
          entries: removeAllowanceEntriesForCompletion(current.entries, existing.id),
        }));

        try {
          await deleteRemoteChoreCompletion(householdId, existing.id);
          setChoreSyncVersion((current) => current + 1);
          setRemoteChoreError("");
          return;
        } catch (error) {
          setChoreConfig((current) => ({
            ...current,
            completions: previousCompletions,
          }));
          setAllowanceState({
            entries: previousAllowanceEntries,
          });
          setRemoteChoreError(
            error instanceof Error ? error.message : "Could not clear chore completion.",
          );
          return;
        }
      }

      const remoteMemberId = remoteMemberIdsByExternalKey[assignment.childId];

      if (!remoteMemberId) {
        setRemoteChoreError("Open Setup and save household members before tracking allowance.");
        return;
      }

      try {
        const createdCompletion = await createRemoteChoreCompletion({
          assignment,
          chore: assignment.chore,
          earnsAllowance: selectedMember.role === "child",
          householdId,
          occurrenceDate: displayedDay.date,
          remoteMemberId,
        });
        const nextCompletion: ChoreCompletion = {
          id: createdCompletion.id,
          assignmentTemplateId: assignment.id,
          childId: assignment.childId,
          choreId: assignment.choreId,
          completedAt: createdCompletion.completedAt,
          completedBy: assignment.childId,
        };
        const allowanceEntry = createChoreAllowanceEntry({
          assignment,
          childId: assignment.childId,
          chore: assignment.chore,
          choreCompletionId: createdCompletion.id,
          id: createId(`${assignment.id}-${displayedDay.date}-allowance`),
          occurredAt: createdCompletion.completedAt,
        });

        setChoreConfig((current) => ({
          ...current,
          completions: [...current.completions, nextCompletion],
        }));

        if (
          allowanceEntry &&
          createdCompletion.allowanceTracked &&
          selectedMember.role === "child"
        ) {
          setAllowanceState((current) => ({
            entries: [...current.entries, allowanceEntry],
          }));
        }

        setChoreSyncVersion((current) => current + 1);
        setRemoteChoreError("");
        return;
      } catch (error) {
        setRemoteChoreError(error instanceof Error ? error.message : "Could not save chore completion.");
        return;
      }
    }

    if (existing) {
      setChoreConfig((current) => ({
        ...current,
        completions: current.completions.filter((completion) => completion.id !== existing.id),
      }));
      setAllowanceState((current) => ({
        entries: removeAllowanceEntriesForCompletion(current.entries, existing.id),
      }));
      return;
    }

    const completionId = createId(`${assignment.id}-${displayedDay.date}`);
    const completedAt = `${displayedDay.date}T${assignment.endTime}:00`;
    const nextCompletion: ChoreCompletion = {
      id: completionId,
      assignmentTemplateId: assignment.id,
      childId: assignment.childId,
      choreId: assignment.choreId,
      completedAt,
      completedBy: selectedMember.id,
    };
    const allowanceEntry = createChoreAllowanceEntry({
      assignment,
      childId: assignment.childId,
      chore: assignment.chore,
      choreCompletionId: completionId,
      id: createId(`${assignment.id}-${displayedDay.date}-allowance`),
      occurredAt: completedAt,
    });

    setChoreConfig((current) => ({
      ...current,
      completions: [...current.completions, nextCompletion],
    }));

    if (allowanceEntry && selectedMember.role === "child") {
      setAllowanceState((current) => ({
        entries: [...current.entries, allowanceEntry],
      }));
    }
  }

  async function toggleResponsibility(item: DashboardResponsibilityItem) {
    if (item.assignment) {
      await toggleAssignment(item.assignment);
      return;
    }

    if (item.localTaskId) {
      toggleLocalTask(item.localTaskId);
      return;
    }

    const key = item.completionKey ?? getActionKey(displayedDay.date, selectedMember.id, item.id);
    const isComplete = Boolean(dashboardStateForView.actionCompletions[key]);

    if (isRemoteHouseholdReady && item.remoteActionItemId) {
      const setCompletionState =
        item.source === "temporary-routine"
          ? setRemoteTemporaryCompletions
          : setRemoteHouseholdItemCompletions;

      setCompletionState((current) => ({
        ...current,
        [key]: !isComplete,
      }));

      try {
        await saveRemoteActionItemCompletion({
          actionItemId: item.remoteActionItemId,
          completed: !isComplete,
          date: displayedDay.date,
          householdId: household!.householdId,
          memberId: remoteMemberIdsByExternalKey[selectedMember.id],
        });
        if (item.source === "temporary-routine") {
          setTemporaryRoutineSyncVersion((current) => current + 1);
          setRemoteTemporaryRoutineError("");
        } else {
          setHouseholdItemSyncVersion((current) => current + 1);
          setRemoteHouseholdItemError("");
        }
      } catch (error) {
        setCompletionState((current) => ({
          ...current,
          [key]: isComplete,
        }));
        if (item.source === "temporary-routine") {
          setRemoteTemporaryRoutineError(
            error instanceof Error ? error.message : "Could not save temporary routine completion.",
          );
        } else {
          setRemoteHouseholdItemError(
            error instanceof Error ? error.message : "Could not save task completion.",
          );
        }
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

  async function addDashboardResponsibility(input: ResponsibilityDraftInput) {
    const title = input.title.trim();

    if (!title) {
      return false;
    }

    if (input.mode === "open") {
      if (isRemoteHouseholdReady && householdId) {
        const remoteMemberId = remoteMemberIdsByExternalKey[input.assigneeId];

        if (!remoteMemberId) {
          setRemoteHouseholdItemError("Open Setup and save household members before assigning responsibilities.");
          return false;
        }

        try {
          await saveRemoteOpenResponsibility({
            availableFrom: input.availableFrom,
            category: input.category,
            householdId,
            memberId: remoteMemberId,
            title,
          });
          setHouseholdItemSyncVersion((current) => current + 1);
          setRemoteHouseholdItemError("");
          return true;
        } catch (error) {
          setRemoteHouseholdItemError(
            error instanceof Error ? error.message : "Could not save responsibility to Supabase.",
          );
          return false;
        }
      }

      const createdAt = new Date().toISOString();

      setState((current) => ({
        ...current,
        localItems: [
          ...current.localItems,
          {
            id: createId(`open-responsibility-${input.assigneeId}-${createdAt}-${title}`),
            kind: "task",
            title,
            assigneeId: input.assigneeId,
            date: input.availableFrom,
            createdAt,
            category: input.category,
            displayMode: "open-responsibility",
          },
        ],
      }));

      return true;
    }

    return addLocalResponsibility({
      assigneeId: input.assigneeId,
      category: input.category,
      daysOfWeek: input.daysOfWeek,
      endTime: input.endTime,
      startTime: input.startTime,
      title,
    });
  }

  async function addLocalResponsibility(input: Omit<LocalResponsibilityItem, "createdAt" | "id">) {
    const title = input.title.trim();

    if (!title) {
      return false;
    }

    if (isRemoteHouseholdReady && householdId) {
      const remoteMemberId = remoteMemberIdsByExternalKey[input.assigneeId];

      if (!remoteMemberId) {
        setRemoteHouseholdItemError("Open Setup and save household members before assigning responsibilities.");
        return false;
      }

      try {
        await saveRemoteResponsibility({
          householdId,
          memberId: remoteMemberId,
          responsibility: input,
        });
        setHouseholdItemSyncVersion((current) => current + 1);
        setRemoteHouseholdItemError("");
        return true;
      } catch (error) {
        setRemoteHouseholdItemError(
          error instanceof Error ? error.message : "Could not save responsibility to Supabase.",
        );
        return false;
      }
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

  function toggleBaselineBlockSelection(blockId: string) {
    setSelectedBaselineBlockIds((current) =>
      current.includes(blockId)
        ? current.filter((candidate) => candidate !== blockId)
        : [...current, blockId],
    );
  }

  async function addBaselineBlocksToSchedule(blocks: ScheduleBlock[], assignedMemberIds: string[]) {
    const normalizedAssignedMemberIds = Array.from(new Set(assignedMemberIds));

    if (blocks.length === 0 || normalizedAssignedMemberIds.length === 0) {
      return false;
    }

    if (isRemoteHouseholdReady && householdId) {
      const remoteMemberIds = normalizedAssignedMemberIds
        .map((memberId) => remoteMemberIdsByExternalKey[memberId])
        .filter((memberId): memberId is string => Boolean(memberId));

      if (remoteMemberIds.length !== normalizedAssignedMemberIds.length) {
        setRemoteBaselineError("Open Setup and save household members before assigning baseline blocks.");
        return false;
      }

      try {
        await saveRemoteBaselineScheduleEvents({
          assignedMemberIds: remoteMemberIds,
          blocks,
          date: displayedDay.date,
          householdId,
        });
        setBaselineScheduleSyncVersion((current) => current + 1);
        setRemoteBaselineError("");
        return true;
      } catch (error) {
        setRemoteBaselineError(
          error instanceof Error ? error.message : "Could not save baseline blocks to Supabase.",
        );
        return false;
      }
    }

    let addedEventCount = 0;

    setState((current) => {
      const createdAt = new Date().toISOString();
      const existingEventKeys = new Set(current.localScheduleEvents.map(getLocalScheduleEventKey));
      const nextLocalScheduleEvents = [...current.localScheduleEvents];

      for (const block of blocks) {
        const nextEvent = createLocalScheduleEvent({
          assignedMemberIds: normalizedAssignedMemberIds,
          block,
          createdAt,
          date: displayedDay.date,
        });
        const eventKey = getLocalScheduleEventKey(nextEvent);

        if (existingEventKeys.has(eventKey)) {
          continue;
        }

        existingEventKeys.add(eventKey);
        nextLocalScheduleEvents.push(nextEvent);
        addedEventCount += 1;
      }

      if (addedEventCount === 0) {
        return current;
      }

      return {
        ...current,
        localScheduleEvents: nextLocalScheduleEvents,
      };
    });

    return addedEventCount > 0;
  }

  async function updateLocalResponsibility(
    responsibilityId: string,
    input: Omit<LocalResponsibilityItem, "createdAt" | "id">,
  ) {
    const title = input.title.trim();

    if (!title) {
      return false;
    }

    if (isRemoteHouseholdReady && householdId && isUuid(responsibilityId)) {
      const remoteMemberId = remoteMemberIdsByExternalKey[input.assigneeId];

      if (!remoteMemberId) {
        setRemoteHouseholdItemError("Open Setup and save household members before assigning responsibilities.");
        return false;
      }

      try {
        await saveRemoteResponsibility({
          householdId,
          memberId: remoteMemberId,
          responsibility: input,
          responsibilityId,
        });
        setHouseholdItemSyncVersion((current) => current + 1);
        setRemoteHouseholdItemError("");
        return true;
      } catch (error) {
        setRemoteHouseholdItemError(
          error instanceof Error ? error.message : "Could not update responsibility in Supabase.",
        );
        return false;
      }
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

  async function removeLocalResponsibility(responsibilityId: string) {
    if (isRemoteHouseholdReady && householdId && isUuid(responsibilityId)) {
      try {
        await deleteRemoteHouseholdActionItem({
          actionItemId: responsibilityId,
          householdId,
        });
        setHouseholdItemSyncVersion((current) => current + 1);
        setRemoteHouseholdItemError("");
      } catch (error) {
        setRemoteHouseholdItemError(
          error instanceof Error ? error.message : "Could not remove responsibility from Supabase.",
        );
      }
      return;
    }

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

  async function removeOpenResponsibility(item: DashboardResponsibilityItem) {
    if (isRemoteHouseholdReady && householdId && item.remoteActionItemId) {
      try {
        await deleteRemoteHouseholdActionItem({
          actionItemId: item.remoteActionItemId,
          householdId,
        });
        setHouseholdItemSyncVersion((current) => current + 1);
        setRemoteHouseholdItemError("");
      } catch (error) {
        setRemoteHouseholdItemError(
          error instanceof Error ? error.message : "Could not remove responsibility from Supabase.",
        );
      }
      return;
    }

    if (!item.localTaskId) {
      return;
    }

    setState((current) => ({
      ...current,
      localItems: current.localItems.filter((candidate) => candidate.id !== item.localTaskId),
    }));
  }

  async function removeScheduledBaselineEvent(eventId: string) {
    if (isRemoteHouseholdReady && householdId) {
      try {
        await deleteRemoteBaselineScheduleEvent({
          actionItemId: eventId,
          householdId,
        });
        setBaselineScheduleSyncVersion((current) => current + 1);
        setRemoteBaselineError("");
      } catch (error) {
        setRemoteBaselineError(
          error instanceof Error ? error.message : "Could not remove baseline schedule event.",
        );
      }
      return;
    }

    setState((current) => ({
      ...current,
      localScheduleEvents: current.localScheduleEvents.filter((event) => event.id !== eventId),
    }));
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

  if (householdStatus === "loading") {
    return <DashboardSetupGate title="Checking household setup" />;
  }

  if (householdStatus === "signed-out" || householdStatus === "unconfigured") {
    return <DashboardSetupGate title="Household setup required" />;
  }

  return (
    <main className="min-h-screen bg-[#eef2f6] text-[#17202a]">
      <section className="border-b border-[#cbd5df] bg-[#f8fafc]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 sm:px-8 lg:px-10">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link className="text-sm font-semibold text-[#1f6f8b]" href="/admin">
              Admin setup
            </Link>
            <Link className="text-sm font-semibold text-[#1f6f8b]" href="/calendar">
              Calendar
            </Link>
            <Link className="text-sm font-semibold text-[#1f6f8b]" href="/chores">
              Chores
            </Link>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-wrap items-end gap-3">
              {households.length > 1 ? (
                <label className="grid gap-1 text-sm">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#657381]">
                    Household
                  </span>
                  <select
                    className="min-w-[200px] border border-[#cbd5df] bg-white px-3 py-2 text-sm font-semibold text-[#17202a]"
                    onChange={(event) => selectHousehold(event.target.value)}
                    value={household?.householdId ?? ""}
                  >
                    {households.map((accessibleHousehold) => (
                      <option key={accessibleHousehold.householdId} value={accessibleHousehold.householdId}>
                        {accessibleHousehold.householdName}
                      </option>
                    ))}
                  </select>
                </label>
              ) : household ? (
                <div className="min-w-[200px] border border-[#d7e0e7] bg-white px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#657381]">Household</p>
                  <p className="mt-1 text-sm font-semibold text-[#17202a]">{household.householdName}</p>
                </div>
              ) : null}
              <label className="grid gap-1 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#657381]">Person</span>
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
                  {displayedDay.dayTypeLabel} · {scheduleEvents.length} event{scheduleEvents.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:w-[340px]">
                <button
                  className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold"
                  onClick={() => shiftDashboardDate(-1)}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isTodaySelected}
                  onClick={() => setDashboardDate(today.date)}
                  type="button"
                >
                  Today
                </button>
                <button
                  className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold"
                  onClick={() => shiftDashboardDate(1)}
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
                                  lateStatus={item.source === "open-responsibility" ? "carryover" : "missed"}
                                  meta={formatTimeRange(item.startTime, item.endTime)}
                                  onChange={() =>
                                    item.source === "routine"
                                      ? void toggleRoutine({
                                          id: item.id,
                                          title: item.title,
                                          startTime: item.startTime,
                                          endTime: item.endTime,
                                          source: item.remoteActionItemId ? "remote" : "configured",
                                          remoteActionItemId: item.remoteActionItemId,
                                          completionKey: item.completionKey,
                                        })
                                      : void toggleResponsibility(item)
                                  }
                                  onRemove={
                                    item.source === "local"
                                      ? () => removeLocalResponsibility(item.id)
                                      : item.source === "open-responsibility"
                                        ? () => void removeOpenResponsibility(item)
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
                                  valueLabel={
                                    item.allowanceAmount ? formatCurrency(item.allowanceAmount) : undefined
                                  }
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
              {scheduleEvents.length > 0 ? (
                <ol className="grid gap-2">
                  {scheduleEvents.map((event) => (
                    <EventRow
                      event={event}
                      key={event.id}
                      members={members}
                      onRemove={
                        event.source === "baseline-flow"
                          ? () => void removeScheduledBaselineEvent(event.id)
                          : undefined
                      }
                    />
                  ))}
                </ol>
              ) : (
                <EmptyState text="No imported or manual calendar events are attached to this profile on this date." />
              )}
            </Panel>

            <Panel title={isTodaySelected ? "Other Events Today" : "Other Events"}>
              {otherScheduleEvents.length > 0 ? (
                <ol className="grid gap-2">
                  {otherScheduleEvents.map((event) => (
                    <OtherEventRow
                      event={event}
                      key={event.id}
                      members={members}
                      onRemove={
                        event.source === "baseline-flow"
                          ? () => void removeScheduledBaselineEvent(event.id)
                          : undefined
                      }
                    />
                  ))}
                </ol>
              ) : (
                <EmptyState text="No other imported or manual household events are scheduled for this date." />
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
                <Fact label="Day schedule" value={String(scheduleEvents.length)} />
                <Fact label="Schedule blocks" value={String(displayedDay.baseline.blocks.length)} />
              </dl>
              {remoteSyncErrors.length > 0 ? (
                <div className="mt-4 border-t border-[#e2e8f0] pt-4">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#8a3b12]">
                    Sync issues
                  </h3>
                  <ul className="mt-3 grid gap-2">
                    {remoteSyncErrors.map((message, index) => (
                      <li
                        className="border border-[#f2b8a0] bg-[#fff7ed] px-3 py-2 text-sm text-[#8a3b12]"
                        key={`${message}-${index}`}
                      >
                        {message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            <BirthdayCountdownPanel member={selectedMember} referenceDate={displayedDay.date} />

            <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Bank</h2>
                  <p className="mt-1 text-sm text-[#657381]">
                    Approved credits land in the ledger below. New work can be submitted here and waits for a parent
                    approval before it is added.
                  </p>
                  {selectedMember.role === "child" && selectedMemberMorningRoutineAllowanceAmount ? (
                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
                      Morning routine credit {formatCurrency(selectedMemberMorningRoutineAllowanceAmount)} per day
                    </p>
                  ) : null}
                </div>
                {selectedMember.role === "child" ? (
                  <div className="text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#657381]">
                      Balance
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-[#1f6f8b]">
                      {formatCurrency(allowanceBalance)}
                    </p>
                  </div>
                ) : null}
              </div>
              {selectedMember.role !== "child" ? (
                <p className="mt-4 text-sm text-[#4c5965]">
                  Switch to a child to view their balance, or submit a new bank request for a child below.
                </p>
              ) : selectedMemberAllowanceEntries.length > 0 ? (
                <ol className="mt-4 grid gap-2">
                  {selectedMemberAllowanceEntries.slice(0, 8).map((entry) => (
                    <li
                      className="grid gap-2 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm sm:grid-cols-[1fr_auto]"
                      key={entry.id}
                    >
                      <div>
                        <p className="font-semibold">{entry.choreTitle ?? entry.label ?? "Allowance credit"}</p>
                        <p className="mt-1 text-xs text-[#657381]">
                          {formatDateLabel(entry.occurredAt.slice(0, 10))}
                        </p>
                        {entry.note ? (
                          <p className="mt-2 text-xs text-[#4c5965]">{entry.note}</p>
                        ) : null}
                      </div>
                      <span className="font-semibold text-[#2f6f73]">
                        {formatCurrency(entry.amount)}
                      </span>
                      {isAllowanceApprovalMode ? (
                        <div className="sm:col-span-2 flex justify-end">
                          <button
                            className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#1f6f8b]"
                            onClick={() => openAllowanceEntryModal(entry)}
                            type="button"
                          >
                            Edit or delete
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState text="No allowance has been earned yet." />
              )}
              <div className="mt-4 border-t border-[#e2e8f0] pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#657381]">
                      Request Credit
                    </h3>
                    <p className="mt-1 text-sm text-[#4c5965]">
                      If the chore title is new, approval will also save it into the chore bank for later use.
                    </p>
                  </div>
                  {isAllowanceApprovalMode ? (
                    <span className="border border-[#c9d8df] bg-[#eef7f7] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
                      Parent approval enabled
                    </span>
                  ) : null}
                </div>
                {!isRemoteHouseholdReady ? (
                  <p className="mt-3 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2 text-sm text-[#4c5965]">
                    Connect a household in Setup to submit and approve bank requests.
                  </p>
                ) : childMembers.length === 0 ? (
                  <p className="mt-3 text-sm text-[#4c5965]">
                    Add at least one child in Setup before creating bank requests.
                  </p>
                ) : (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-[#d7e0e7] bg-[#f8fafc] px-4 py-4">
                    <p className="max-w-2xl text-sm text-[#4c5965]">
                      Open the request editor to enter the work, amount, and note. Parents can also
                      reopen pending requests to fix details before approval.
                    </p>
                    <button
                      className="border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white"
                      onClick={openCreateAllowanceRequestModal}
                      type="button"
                    >
                      New credit request
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-4 border-t border-[#e2e8f0] pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#657381]">
                      Pending Approval
                    </h3>
                    <p className="mt-1 text-sm text-[#4c5965]">
                      {selectedMember.role === "child"
                        ? "Requests waiting to be added to this bank balance."
                        : "Pending child bank requests across the household."}
                    </p>
                  </div>
                </div>
                {visibleAllowanceRequests.length > 0 ? (
                  <ol className="mt-4 grid gap-2">
                    {visibleAllowanceRequests.map((request) => {
                      const requestChildId = remoteExternalKeysByMemberId[request.childRemoteMemberId];
                      const requestChild =
                        members.find((member) => member.id === requestChildId) ?? null;
                      const requestedById = request.requestedByRemoteMemberId
                        ? remoteExternalKeysByMemberId[request.requestedByRemoteMemberId]
                        : undefined;
                      const requestedBy =
                        members.find((member) => member.id === requestedById) ?? null;

                      return (
                        <li
                          className="grid gap-3 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm"
                          key={request.id}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold">{request.choreTitle}</p>
                              <p className="mt-1 text-xs text-[#657381]">
                                {formatDateLabel(request.occurrenceDate)} · {getChoreCategoryLabel(request.category)}
                                {requestChild && selectedMember.role !== "child"
                                  ? ` · ${requestChild.preferredName}`
                                  : ""}
                                {requestedBy ? ` · entered by ${requestedBy.preferredName}` : ""}
                              </p>
                              {request.note ? (
                                <p className="mt-2 text-xs text-[#4c5965]">{request.note}</p>
                              ) : null}
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-[#2f6f73]">{formatCurrency(request.amount)}</p>
                              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#a14a1a]">
                                Awaiting approval
                              </p>
                            </div>
                          </div>
                          {isAllowanceApprovalMode ? (
                            <div className="flex flex-wrap justify-end gap-2">
                              <button
                                className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#1f6f8b]"
                                disabled={approvingAllowanceRequestId === request.id}
                                onClick={() => openEditAllowanceRequestModal(request)}
                                type="button"
                              >
                                Edit
                              </button>
                              <button
                                className="border border-[#1f6f8b] bg-white px-3 py-2 text-sm font-semibold text-[#1f6f8b] disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={approvingAllowanceRequestId === request.id}
                                onClick={() => {
                                  void approveAllowanceRequest(request);
                                }}
                                type="button"
                              >
                                {approvingAllowanceRequestId === request.id ? "Approving..." : "Approve"}
                              </button>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <EmptyState text="No bank requests are waiting for approval." />
                )}
              </div>
              {isRemoteHouseholdReady && remoteAllowanceError ? (
                <p className="mt-3 border border-[#f2b8a0] bg-[#fff7ed] px-3 py-2 text-sm text-[#8a3b12]">
                  {remoteAllowanceError}
                </p>
              ) : null}
              {allowanceEntryError ? (
                <p className="mt-3 border border-[#f2b8a0] bg-[#fff7ed] px-3 py-2 text-sm text-[#8a3b12]">
                  {allowanceEntryError}
                </p>
              ) : null}
              {remoteAllowanceRequestError ? (
                <p className="mt-3 border border-[#f2b8a0] bg-[#fff7ed] px-3 py-2 text-sm text-[#8a3b12]">
                  {remoteAllowanceRequestError}
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
            <Panel
              action={
                displayedDay.baseline.blocks.length > 0 ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    {selectedBaselineBlockIds.length > 0 ? (
                      <button
                        className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold"
                        onClick={() => setSelectedBaselineBlockIds([])}
                        type="button"
                      >
                        Clear selection
                      </button>
                    ) : null}
                    <button
                      className="border border-[#1f6f8b] bg-[#1f6f8b] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={selectedBaselineBlocks.length === 0}
                      onClick={() => setBaselineScheduleModal(selectedBaselineBlocks)}
                      type="button"
                    >
                      Add selected to day schedule
                    </button>
                  </div>
                ) : undefined
              }
              title="Baseline Flow"
            >
              {displayedDay.baseline.blocks.length > 0 ? (
                <ol className="grid gap-2 md:grid-cols-2">
                  {displayedDay.baseline.blocks.slice(0, 8).map((block) => (
                    <li key={block.id}>
                      <button
                        aria-pressed={selectedBaselineBlockIds.includes(block.id)}
                        className={`grid w-full gap-2 border px-3 py-3 text-left text-sm ${
                          selectedBaselineBlockIds.includes(block.id)
                            ? "border-[#dc546a] bg-[#fff4f5] shadow-[inset_0_0_0_1px_#dc546a]"
                            : "border-[#d7e0e7] bg-[#f8fafc]"
                        }`}
                        onClick={() => toggleBaselineBlockSelection(block.id)}
                        type="button"
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="font-semibold text-[#17202a]">{block.title}</span>
                          <span className="border border-[#d7e0e7] bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#657381]">
                            {selectedBaselineBlockIds.includes(block.id) ? "Selected" : "Click to add"}
                          </span>
                        </span>
                        <span className="text-[#657381]">
                          {formatTimeRange(block.startTime, block.endTime)} · {block.noiseLevel}
                        </span>
                      </button>
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
          defaultDate={displayedDay.date}
          defaultDayOfWeek={displayedDay.dayOfWeek}
          initialResponsibility={
            responsibilityModal.mode === "edit" ? responsibilityModal.responsibility : undefined
          }
          members={members}
          onClose={() => setResponsibilityModal(null)}
          onSave={async (input) => {
            const saved = await (
              responsibilityModal.mode === "edit"
                ? input.mode === "weekly"
                  ? updateLocalResponsibility(responsibilityModal.responsibility.id, input)
                  : false
                : addDashboardResponsibility(input)
            );

            if (saved) {
              setResponsibilityModal(null);
            }
          }}
        />
      ) : null}
      {baselineScheduleModal ? (
        <BaselineScheduleModal
          blocks={baselineScheduleModal}
          defaultSelectedMemberIds={selectedMember?.role === "parent" ? [] : [selectedMember?.id ?? ""]}
          members={members}
          onClose={() => setBaselineScheduleModal(null)}
          onSave={async (assignedMemberIds) => {
            if (await addBaselineBlocksToSchedule(baselineScheduleModal, assignedMemberIds)) {
              setBaselineScheduleModal(null);
              setSelectedBaselineBlockIds([]);
            }
          }}
          selectedDate={displayedDay.date}
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
      {allowanceRequestModal ? (
        <AllowanceRequestModal
          childMembers={childMembers}
          errorMessage={remoteAllowanceRequestError}
          isEditing={allowanceRequestModal.mode === "edit"}
          onClose={closeAllowanceRequestModal}
          onSave={async (input) => {
            await saveAllowanceRequest(
              input,
              allowanceRequestModal.mode === "edit" ? allowanceRequestModal.request : undefined,
            );
          }}
          request={allowanceRequestModal.mode === "edit" ? allowanceRequestModal.request : undefined}
          showChildPicker={selectedMember.role !== "child"}
          startingDraft={allowanceRequestModal.draft}
        />
      ) : null}
      {allowanceEntryModal ? (
        <AllowanceEntryModal
          entry={allowanceEntryModal.entry}
          errorMessage={allowanceEntryError}
          onClose={closeAllowanceEntryModal}
          onDelete={async () => {
            await removeAllowanceEntry(allowanceEntryModal.entry);
          }}
          onSave={async (input) => {
            await saveAllowanceEntry(input, allowanceEntryModal.entry);
          }}
          startingDraft={allowanceEntryModal.draft}
        />
      ) : null}
      {morningRoutineCelebrationKey > 0 ? (
        <MorningRoutineFireworks key={morningRoutineCelebrationKey} />
      ) : null}
    </main>
  );
}

function getDashboardDayContext({
  date,
  dayTemplates,
  fixedEvents,
  season,
}: {
  date: string;
  dayTemplates: DayTemplate[];
  fixedEvents: FixedEvent[];
  season: PlannerData["season"];
}): TodayContext {
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
    case "open-responsibility":
      return "Open";
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

function normalizeRemoteResponsibilityCategory(category?: string): ResponsibilityCategory {
  if (
    category === "morning-routine" ||
    category === "homework" ||
    category === "chores" ||
    category === "sports" ||
    category === "personal-hygiene" ||
    category === "work" ||
    category === "personal" ||
    category === "investments" ||
    category === "family-planning" ||
    category === "home-maintenance" ||
    category === "finance"
  ) {
    return category;
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
    if (item.completionKey) {
      return Boolean(state.actionCompletions[item.completionKey]);
    }

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
  remoteRoutines: DashboardRoutineItem[],
  remoteRoutinesAreAuthoritative: boolean,
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

  const remoteItems = remoteRoutines.filter((routine) => routine.id.startsWith(`${member.id}:`));
  const baseRoutineItems = remoteRoutinesAreAuthoritative ? remoteItems : configuredItems;

  return [...baseRoutineItems, ...localItems].sort((first, second) =>
    compareStrings(`${first.startTime}-${first.title}`, `${second.startTime}-${second.title}`),
  );
}

function getAssignments(
  assignments: WeeklyChoreAssignmentTemplate[],
  choresById: Map<string, WeeklyChore>,
  member: HouseholdMember,
  today: TodayContext,
): AssignmentWithChore[] {
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
  localTasks: DashboardHouseholdItem[],
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
    completionKey: routine.completionKey,
    remoteActionItemId: routine.remoteActionItemId,
  }));
  const configuredItems = assignments.map((assignment) => ({
    id: assignment.id,
    title: assignment.chore?.title ?? assignment.choreId,
    startTime: assignment.startTime,
    endTime: assignment.endTime,
    category: choreCategoryToResponsibilityCategory(assignment.chore?.category),
    source: "configured" as const,
    assignment,
    allowanceAmount: member.role === "child" ? getChoreAllowanceAmount(assignment.chore) : undefined,
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
      remoteActionItemId: isUuid(responsibility.id) ? responsibility.id : undefined,
      completionKey: getActionKey(today.date, responsibility.assigneeId, responsibility.id),
    }));
  const datedTasks = localTasks.map((item) => ({
    id: item.id,
    title: item.title,
    startTime: "Anytime",
    endTime: item.displayMode === "open-responsibility" ? "Open until complete" : "Today",
    category: item.category ?? ("personal" as const),
    source:
      item.displayMode === "open-responsibility"
        ? ("open-responsibility" as const)
        : ("dated-task" as const),
    localTaskId: item.remoteActionItemId ? undefined : item.id,
    remoteActionItemId: item.remoteActionItemId,
    completionKey: item.completionKey,
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

function getRelevantEvents(events: FixedEvent[], member: HouseholdMember) {
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

function getOtherEvents(allEvents: FixedEvent[], memberEvents: FixedEvent[], member: HouseholdMember) {
  if (member.role === "parent") {
    return [];
  }

  const memberEventIds = new Set(memberEvents.map((event) => event.id));

  return allEvents.filter((event) => !memberEventIds.has(event.id));
}

function getLocalScheduleEventsForDate(events: LocalScheduledEvent[], date: string) {
  return events.filter((event) => event.date === date);
}

function getDayScheduleEvents(
  importedEvents: DashboardEvent[],
  localScheduleEvents: FixedEvent[],
) {
  return [...importedEvents, ...localScheduleEvents].sort((first, second) =>
    compareStrings(`${first.startTime}-${first.title}`, `${second.startTime}-${second.title}`),
  );
}

function getReminderItems(
  member: HouseholdMember,
  events: FixedEvent[],
  responsibilityCount: number,
  localReminders: DashboardHouseholdItem[],
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
          : "No sports gear is flagged from imported or manual calendar events.",
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
          ? "Imported or manual calendar events are scheduled for today."
          : "No imported or manual calendar events are scheduled for today yet.",
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
  assignmentOverrides: Record<string, string[]>,
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
        assignmentOverrides[getAppliedCalendarEventAssignmentKey(event)] ??
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
  items: DashboardHouseholdItem[],
  member: HouseholdMember,
  date: string,
) {
  return items.filter(
    (item) => {
      if (member.role !== "parent" && item.assigneeId !== member.id) {
        return false;
      }

      if (item.kind === "task" && item.displayMode === "open-responsibility") {
        const completedOn = item.completedAt?.slice(0, 10);

        return item.date <= date && (!completedOn || date < completedOn);
      }

      return item.date === date;
    },
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

function normalizeRemoteDaysOfWeek(daysOfWeek: string[] | null | undefined): DayOfWeek[] {
  return dayOptions.filter((day) => daysOfWeek?.includes(day));
}

async function loadRemoteHouseholdItems(
  householdId: string,
  date: string,
  dayOfWeek: DayOfWeek,
): Promise<RemoteHouseholdItemLoad> {
  const supabase = createBrowserSupabaseClient();
  const { data: members, error: membersError } = await supabase
    .from("household_members")
    .select("id, external_key")
    .eq("household_id", householdId)
    .eq("status", "active")
    .returns<RemoteHouseholdMemberRow[]>();

  if (membersError) {
    throw membersError;
  }

  const externalKeysByMemberId = Object.fromEntries(
    (members ?? []).map((member) => [member.id, member.external_key]),
  );

  const { data: actionItems, error: actionItemsError } = await supabase
    .from("household_action_items")
    .select("id, item_kind, title, days_of_week, start_time, end_time, occurrence_date, metadata, created_at")
    .eq("household_id", householdId)
    .in("item_kind", ["task", "reminder"])
    .eq("status", "active")
    .returns<RemoteActionItemRow[]>();

  if (actionItemsError) {
    throw actionItemsError;
  }

  const relevantActionItems = (actionItems ?? []).filter((item) => {
    if (item.item_kind === "task" && item.occurrence_date === null) {
      return item.metadata.kind === "custom-responsibility" && (item.days_of_week ?? []).includes(dayOfWeek);
    }

    if (item.item_kind === "task" && item.metadata.kind === "open-responsibility" && item.occurrence_date) {
      return item.occurrence_date <= date;
    }

    if (item.occurrence_date !== date) {
      return false;
    }

    return item.metadata.kind !== "baseline-schedule-block";
  });

  const actionItemIds = relevantActionItems.map((item) => item.id);
  const { data: assignments, error: assignmentsError } =
    actionItemIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("household_assignments")
          .select("assignable_id, household_member_id")
          .eq("household_id", householdId)
          .eq("assignable_type", "action_item")
          .in("assignable_id", actionItemIds)
          .returns<RemoteAssignmentRow[]>();

  if (assignmentsError) {
    throw assignmentsError;
  }

  const { data: completionsOnDate, error: completionsOnDateError } =
    actionItemIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("household_action_item_completions")
          .select("action_item_id, occurrence_date")
          .eq("household_id", householdId)
          .eq("occurrence_date", date)
          .in("action_item_id", actionItemIds)
          .returns<RemoteActionCompletionRow[]>();

  if (completionsOnDateError) {
    throw completionsOnDateError;
  }

  const openResponsibilityIds = relevantActionItems
    .filter((item) => item.item_kind === "task" && item.metadata.kind === "open-responsibility")
    .map((item) => item.id);
  const { data: openResponsibilityCompletions, error: openResponsibilityCompletionsError } =
    openResponsibilityIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("household_action_item_completions")
          .select("action_item_id, occurrence_date")
          .eq("household_id", householdId)
          .lte("occurrence_date", date)
          .in("action_item_id", openResponsibilityIds)
          .returns<RemoteActionCompletionRow[]>();

  if (openResponsibilityCompletionsError) {
    throw openResponsibilityCompletionsError;
  }

  const assignedMemberIdsByActionItemId = new Map<string, string[]>();

  for (const assignment of assignments ?? []) {
    if (!assignment.household_member_id) {
      continue;
    }

    const externalKey = externalKeysByMemberId[assignment.household_member_id];

    if (!externalKey) {
      continue;
    }

    assignedMemberIdsByActionItemId.set(assignment.assignable_id, [
      ...(assignedMemberIdsByActionItemId.get(assignment.assignable_id) ?? []),
      externalKey,
    ]);
  }

  const completionMap: Record<string, boolean> = {};
  const completionsOnDateByActionItemId = new Set(
    (completionsOnDate ?? []).map((completion) => completion.action_item_id),
  );
  const completedOpenResponsibilityIds = new Set(
    (openResponsibilityCompletions ?? []).map((completion) => completion.action_item_id),
  );
  const responsibilities: LocalResponsibilityItem[] = [];
  const items: DashboardHouseholdItem[] = [];

  for (const item of relevantActionItems) {
    const assignedMemberIds = assignedMemberIdsByActionItemId.get(item.id) ?? [];
    const assigneeId = assignedMemberIds[0] ?? "";

    if (item.item_kind === "task" && item.occurrence_date === null) {
      if (!assigneeId) {
        continue;
      }

      if (completionsOnDateByActionItemId.has(item.id)) {
        completionMap[getActionKey(date, assigneeId, item.id)] = true;
      }

      responsibilities.push({
        id: item.id,
        title: item.title,
        category: normalizeRemoteResponsibilityCategory(item.metadata.category),
        assigneeId,
        daysOfWeek: normalizeRemoteDaysOfWeek(item.days_of_week),
        startTime: normalizeTimeForInput(item.start_time),
        endTime: normalizeTimeForInput(item.end_time),
        createdAt: item.created_at,
      });
      continue;
    }

    if (item.item_kind === "task" && item.metadata.kind === "open-responsibility") {
      if (!assigneeId || completedOpenResponsibilityIds.has(item.id)) {
        continue;
      }

      items.push({
        id: item.id,
        kind: "task",
        title: item.title,
        assigneeId,
        date: item.occurrence_date ?? date,
        createdAt: item.created_at,
        category: normalizeRemoteResponsibilityCategory(item.metadata.category),
        displayMode: "open-responsibility",
        remoteActionItemId: item.id,
      });
      continue;
    }

    const completionKey = getActionKey(date, assigneeId || "household", item.id);

    if (item.item_kind === "task" && completionsOnDateByActionItemId.has(item.id)) {
      completionMap[completionKey] = true;
    }

    items.push({
      id: item.id,
      kind: item.item_kind as LocalHouseholdItem["kind"],
      title: item.title,
      assigneeId,
      date: item.occurrence_date ?? date,
      createdAt: item.created_at,
      completionKey: item.item_kind === "task" ? completionKey : undefined,
      remoteActionItemId: item.id,
    });
  }

  return {
    completionMap,
    items,
    responsibilities,
  };
}

async function saveRemoteResponsibility({
  householdId,
  memberId,
  responsibility,
  responsibilityId,
}: {
  householdId: string;
  memberId: string;
  responsibility: Omit<LocalResponsibilityItem, "createdAt" | "id">;
  responsibilityId?: string;
}) {
  const supabase = createBrowserSupabaseClient();
  const row = {
    household_id: householdId,
    item_kind: "task",
    title: responsibility.title.trim(),
    source: "manual",
    days_of_week: responsibility.daysOfWeek,
    start_time: responsibility.startTime,
    end_time: responsibility.endTime,
    metadata: {
      kind: "custom-responsibility",
      category: responsibility.category ?? "chores",
    },
  };
  const query =
    responsibilityId && isUuid(responsibilityId)
      ? supabase
          .from("household_action_items")
          .update(row)
          .eq("household_id", householdId)
          .eq("id", responsibilityId)
      : supabase.from("household_action_items").insert(row);
  const { data: item, error: itemError } = await query.select("id").single<{ id: string }>();

  if (itemError) {
    throw itemError;
  }

  const { error: deleteError } = await supabase
    .from("household_assignments")
    .delete()
    .eq("household_id", householdId)
    .eq("assignable_type", "action_item")
    .eq("assignable_id", item.id);

  if (deleteError) {
    throw deleteError;
  }

  const { error: assignmentError } = await supabase.from("household_assignments").insert({
    household_id: householdId,
    assignable_type: "action_item",
    assignable_id: item.id,
    assignee_type: "member",
    household_member_id: memberId,
  });

  if (assignmentError) {
    throw assignmentError;
  }
}

async function saveRemoteOpenResponsibility({
  availableFrom,
  category,
  householdId,
  memberId,
  title,
}: {
  availableFrom: string;
  category: ResponsibilityCategory;
  householdId: string;
  memberId: string;
  title: string;
}) {
  const supabase = createBrowserSupabaseClient();
  const { data: item, error: itemError } = await supabase
    .from("household_action_items")
    .insert({
      household_id: householdId,
      item_kind: "task",
      title,
      source: "manual",
      occurrence_date: availableFrom,
      metadata: {
        kind: "open-responsibility",
        category,
      },
    })
    .select("id")
    .single<{ id: string }>();

  if (itemError) {
    throw itemError;
  }

  const { error: assignmentError } = await supabase.from("household_assignments").insert({
    household_id: householdId,
    assignable_type: "action_item",
    assignable_id: item.id,
    assignee_type: "member",
    household_member_id: memberId,
  });

  if (assignmentError) {
    throw assignmentError;
  }
}

async function deleteRemoteHouseholdActionItem({
  actionItemId,
  householdId,
}: {
  actionItemId: string;
  householdId: string;
}) {
  const supabase = createBrowserSupabaseClient();
  const { error: completionsError } = await supabase
    .from("household_action_item_completions")
    .delete()
    .eq("household_id", householdId)
    .eq("action_item_id", actionItemId);

  if (completionsError) {
    throw completionsError;
  }

  const { error: assignmentsError } = await supabase
    .from("household_assignments")
    .delete()
    .eq("household_id", householdId)
    .eq("assignable_type", "action_item")
    .eq("assignable_id", actionItemId);

  if (assignmentsError) {
    throw assignmentsError;
  }

  const { error: actionItemsError } = await supabase
    .from("household_action_items")
    .delete()
    .eq("household_id", householdId)
    .eq("id", actionItemId);

  if (actionItemsError) {
    throw actionItemsError;
  }
}

async function loadRemoteBaselineTemplates(
  householdId: string,
): Promise<RemoteBaselineTemplateLoad> {
  const supabase = createBrowserSupabaseClient();
  const { data: actionItems, error } = await supabase
    .from("household_action_items")
    .select("id, title, days_of_week, start_time, end_time, metadata, created_at")
    .eq("household_id", householdId)
    .eq("item_kind", "routine")
    .eq("status", "active")
    .eq("metadata->>kind", "baseline-template-block")
    .returns<RemoteActionItemRow[]>();

  if (error) {
    throw error;
  }

  const templateGroups = new Map<
    string,
    {
      blocksById: Map<string, ScheduleBlock>;
      daysOfWeek: Set<DayOfWeek>;
      endsOn: string;
      label: string;
      startsOn: string;
    }
  >();

  for (const item of actionItems ?? []) {
    const templateId = item.metadata.baselineTemplateId;

    if (!templateId) {
      continue;
    }

    const group =
      templateGroups.get(templateId) ??
      {
        blocksById: new Map<string, ScheduleBlock>(),
        daysOfWeek: new Set<DayOfWeek>(),
        endsOn: item.metadata.endsOn ?? "",
        label: item.metadata.baselineTemplateName ?? "Baseline flow",
        startsOn: item.metadata.startsOn ?? "",
      };

    for (const day of normalizeRemoteDaysOfWeek(item.days_of_week)) {
      group.daysOfWeek.add(day);
    }

    const blockId = item.metadata.stepId ?? item.id;
    if (!group.blocksById.has(blockId)) {
      group.blocksById.set(blockId, {
        id: blockId,
        startTime: normalizeTimeForInput(item.start_time),
        endTime: normalizeTimeForInput(item.end_time),
        title: item.title,
        category: item.metadata.category ?? "personal",
        noiseLevel: item.metadata.noiseLevel ?? "medium",
        location: item.metadata.location ?? "home",
        calendarBehavior: "draft",
      });
    }

    templateGroups.set(templateId, group);
  }

  return {
    templates: [...templateGroups.entries()].map(([id, group]) => ({
      id,
      label: group.label,
      appliesTo: {
        daysOfWeek: [...group.daysOfWeek],
        dateRange: {
          startsOn: group.startsOn,
          endsOn: group.endsOn,
        },
      },
      blocks: [...group.blocksById.values()].sort((first, second) =>
        compareStrings(`${first.startTime}-${first.title}`, `${second.startTime}-${second.title}`),
      ),
    })),
  };
}

async function loadRemoteBaselineScheduleEvents(
  householdId: string,
  date: string,
): Promise<RemoteBaselineScheduleLoad> {
  const supabase = createBrowserSupabaseClient();
  const { data: members, error: membersError } = await supabase
    .from("household_members")
    .select("id, external_key")
    .eq("household_id", householdId)
    .eq("status", "active")
    .returns<RemoteHouseholdMemberRow[]>();

  if (membersError) {
    throw membersError;
  }

  const externalKeysByMemberId = Object.fromEntries(
    (members ?? []).map((member) => [member.id, member.external_key]),
  );

  const { data: actionItems, error: actionItemsError } = await supabase
    .from("household_action_items")
    .select("id, title, days_of_week, start_time, end_time, metadata, created_at")
    .eq("household_id", householdId)
    .eq("item_kind", "task")
    .eq("status", "active")
    .eq("occurrence_date", date)
    .eq("metadata->>kind", "baseline-schedule-block")
    .returns<RemoteActionItemRow[]>();

  if (actionItemsError) {
    throw actionItemsError;
  }

  const actionItemIds = (actionItems ?? []).map((item) => item.id);
  const { data: assignments, error: assignmentsError } =
    actionItemIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("household_assignments")
          .select("assignable_id, household_member_id")
          .eq("household_id", householdId)
          .eq("assignable_type", "action_item")
          .in("assignable_id", actionItemIds)
          .returns<RemoteAssignmentRow[]>();

  if (assignmentsError) {
    throw assignmentsError;
  }

  const assignedMemberIdsByActionItemId = new Map<string, string[]>();

  for (const assignment of assignments ?? []) {
    if (!assignment.household_member_id) {
      continue;
    }

    const externalKey = externalKeysByMemberId[assignment.household_member_id];

    if (!externalKey) {
      continue;
    }

    assignedMemberIdsByActionItemId.set(assignment.assignable_id, [
      ...(assignedMemberIdsByActionItemId.get(assignment.assignable_id) ?? []),
      externalKey,
    ]);
  }

  return {
    events: (actionItems ?? []).map((item) => ({
      id: item.id,
      source: "baseline-flow",
      date,
      startTime: normalizeTimeForInput(item.start_time),
      endTime: normalizeTimeForInput(item.end_time),
      title: item.title,
      category: item.metadata.category ?? "personal",
      calendarBehavior: "draft",
      assignedMemberIds: assignedMemberIdsByActionItemId.get(item.id) ?? [],
    })),
  };
}

async function saveRemoteBaselineScheduleEvents({
  assignedMemberIds,
  blocks,
  date,
  householdId,
}: {
  assignedMemberIds: string[];
  blocks: ScheduleBlock[];
  date: string;
  householdId: string;
}) {
  const supabase = createBrowserSupabaseClient();
  const { data: existingActionItems, error: existingActionItemsError } = await supabase
    .from("household_action_items")
    .select("id, title, start_time, end_time, metadata")
    .eq("household_id", householdId)
    .eq("item_kind", "task")
    .eq("status", "active")
    .eq("occurrence_date", date)
    .eq("metadata->>kind", "baseline-schedule-block")
    .returns<
      Array<{
        id: string;
        title: string;
        start_time: string | null;
        end_time: string | null;
        metadata: RemoteTemporaryRoutineMetadata;
      }>
    >();

  if (existingActionItemsError) {
    throw existingActionItemsError;
  }

  const existingActionItemIds = (existingActionItems ?? []).map((item) => item.id);
  const { data: existingAssignments, error: existingAssignmentsError } =
    existingActionItemIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("household_assignments")
          .select("assignable_id, household_member_id")
          .eq("household_id", householdId)
          .eq("assignable_type", "action_item")
          .in("assignable_id", existingActionItemIds)
          .returns<RemoteAssignmentRow[]>();

  if (existingAssignmentsError) {
    throw existingAssignmentsError;
  }

  const assignedMemberIdsByActionItemId = new Map<string, string[]>();

  for (const assignment of existingAssignments ?? []) {
    if (!assignment.household_member_id) {
      continue;
    }

    assignedMemberIdsByActionItemId.set(assignment.assignable_id, [
      ...(assignedMemberIdsByActionItemId.get(assignment.assignable_id) ?? []),
      assignment.household_member_id,
    ]);
  }

  const existingKeys = new Set(
    (existingActionItems ?? []).map((item) =>
      getScheduledBaselineEventKey({
        assignedIds: assignedMemberIdsByActionItemId.get(item.id) ?? [],
        baselineBlockId: item.metadata.baselineBlockId ?? item.id,
        date,
        endTime: normalizeTimeForInput(item.end_time),
        startTime: normalizeTimeForInput(item.start_time),
        title: item.title,
      }),
    ),
  );
  const rows = blocks
    .filter(
      (block) =>
        !existingKeys.has(
          getScheduledBaselineEventKey({
            assignedIds: assignedMemberIds,
            baselineBlockId: block.id,
            date,
            endTime: block.endTime,
            startTime: block.startTime,
            title: block.title,
          }),
        ),
    )
    .map((block) => ({
      household_id: householdId,
      item_kind: "task",
      title: block.title,
      source: "manual",
      occurrence_date: date,
    start_time: block.startTime,
    end_time: block.endTime,
      metadata: {
        kind: "baseline-schedule-block",
        baselineBlockId: block.id,
        category: block.category,
        noiseLevel: block.noiseLevel,
        location: block.location,
      },
    }));

  if (rows.length === 0) {
    return;
  }

  const { data: actionItems, error: actionItemsError } = await supabase
    .from("household_action_items")
    .insert(rows)
    .select("id")
    .returns<Array<{ id: string }>>();

  if (actionItemsError) {
    throw actionItemsError;
  }

  const assignmentRows = (actionItems ?? []).flatMap((item) =>
    assignedMemberIds.map((memberId) => ({
      household_id: householdId,
      assignable_type: "action_item",
      assignable_id: item.id,
      assignee_type: "member",
      household_member_id: memberId,
    })),
  );

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
}

async function deleteRemoteBaselineScheduleEvent({
  actionItemId,
  householdId,
}: {
  actionItemId: string;
  householdId: string;
}) {
  const supabase = createBrowserSupabaseClient();
  const { error: assignmentsError } = await supabase
    .from("household_assignments")
    .delete()
    .eq("household_id", householdId)
    .eq("assignable_type", "action_item")
    .eq("assignable_id", actionItemId);

  if (assignmentsError) {
    throw assignmentsError;
  }

  const { error: actionItemsError } = await supabase
    .from("household_action_items")
    .delete()
    .eq("household_id", householdId)
    .eq("id", actionItemId);

  if (actionItemsError) {
    throw actionItemsError;
  }
}

async function loadRemoteRoutines(
  householdId: string,
  date: string,
  dayOfWeek: DayOfWeek,
): Promise<RemoteRoutineLoad> {
  const supabase = createBrowserSupabaseClient();
  const { data: members, error: membersError } = await supabase
    .from("household_members")
    .select("id, external_key")
    .eq("household_id", householdId)
    .eq("status", "active")
    .returns<RemoteHouseholdMemberRow[]>();

  if (membersError) {
    throw membersError;
  }

  const externalKeysByMemberId = Object.fromEntries(
    (members ?? []).map((member) => [member.id, member.external_key]),
  );

  const { data: actionItems, error: actionItemsError } = await supabase
    .from("household_action_items")
    .select("id, title, days_of_week, start_time, end_time, metadata, created_at")
    .eq("household_id", householdId)
    .eq("item_kind", "routine")
    .eq("status", "active")
    .eq("metadata->>kind", "routine-template-step")
    .returns<RemoteActionItemRow[]>();

  if (actionItemsError) {
    throw actionItemsError;
  }

  const scheduledItems = (actionItems ?? []).filter((item) =>
    (item.days_of_week ?? []).includes(dayOfWeek),
  );
  const actionItemIds = scheduledItems.map((item) => item.id);

  if (actionItemIds.length === 0) {
    return {
      completions: {},
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
    .eq("occurrence_date", date)
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
  const completedActionItemIds = new Set((completions ?? []).map((completion) => completion.action_item_id));
  const completionMap: Record<string, boolean> = {};
  const routines = scheduledItems.flatMap((item) => {
    const memberId = assignmentByActionItemId.get(item.id);
    const memberExternalKey = memberId ? externalKeysByMemberId[memberId] : undefined;

    if (!memberExternalKey) {
      return [];
    }

    const completionKey = getRemoteRoutineCompletionKey(date, memberExternalKey, item.id);

    if (completedActionItemIds.has(item.id)) {
      completionMap[completionKey] = true;
    }

    return [
      {
        id: `${memberExternalKey}:${item.id}`,
        title: item.title,
        startTime: normalizeTimeForInput(item.start_time),
        endTime: normalizeTimeForInput(item.end_time),
        source: "remote" as const,
        remoteActionItemId: item.id,
        completionKey,
      },
    ];
  });

  return {
    completions: completionMap,
    routines,
  };
}

async function loadRemoteDashboardChoreState(
  householdId: string,
): Promise<RemoteDashboardChoreState> {
  const supabase = createBrowserSupabaseClient();
  const { data: members, error: membersError } = await supabase
    .from("household_members")
    .select("id, external_key")
    .eq("household_id", householdId)
    .eq("status", "active")
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

  const { data: chores, error: choresError } = await supabase
    .from("chores")
    .select("id, title, category_id, metadata")
    .eq("household_id", householdId)
    .eq("chore_kind", "weekly")
    .eq("status", "active")
    .returns<RemoteChoreRow[]>();

  if (choresError) {
    throw choresError;
  }

  const weeklyChores = (chores ?? []).map((chore) => ({
    id: chore.id,
    title: chore.title,
    category: normalizeChoreCategory(chore.category_id),
    estimatedMinutes: chore.metadata.estimatedMinutes ?? 10,
    eligibleAssigneeIds: chore.metadata.eligibleAssigneeIds ?? [],
    requiresAdultCheck: chore.metadata.requiresAdultCheck,
    allowanceAmount: normalizeCurrencyAmount(chore.metadata.allowanceAmount),
  }));
  const choreIds = weeklyChores.map((chore) => chore.id);

  const { data: templates, error: templatesError } =
    choreIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("chore_assignment_templates")
          .select("id, chore_id, day_of_week, metadata")
          .eq("household_id", householdId)
          .eq("status", "active")
          .in("chore_id", choreIds)
          .returns<RemoteChoreTemplateRow[]>();

  if (templatesError) {
    throw templatesError;
  }

  const templateIds = (templates ?? []).map((template) => template.id);
  const { data: assignments, error: assignmentsError } =
    templateIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("household_assignments")
          .select("assignable_id, household_member_id")
          .eq("household_id", householdId)
          .eq("assignable_type", "chore_assignment_template")
          .in("assignable_id", templateIds)
          .returns<RemoteAssignmentRow[]>();

  if (assignmentsError) {
    throw assignmentsError;
  }

  const assignmentByTemplateId = new Map(
    (assignments ?? []).map((assignment) => [assignment.assignable_id, assignment.household_member_id]),
  );
  const weeklyAssignmentTemplates = (templates ?? [])
    .map((template) => {
      const remoteMemberId = assignmentByTemplateId.get(template.id);
      const childId = remoteMemberId ? externalKeysByMemberId[remoteMemberId] : undefined;

      if (!childId) {
        return null;
      }

      return {
        id: template.id,
        childId,
        choreId: template.chore_id,
        dayOfWeek: template.day_of_week,
        startTime: template.metadata.startTime ?? "16:00",
        endTime: template.metadata.endTime ?? "16:15",
      };
    })
    .filter((template): template is WeeklyChoreAssignmentTemplate => Boolean(template));

  const { data: completions, error: completionsError } =
    templateIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("chore_completions")
          .select("id, assignment_template_id, chore_id, completed_at, completed_by_member_id")
          .eq("household_id", householdId)
          .in("assignment_template_id", templateIds)
          .returns<RemoteChoreCompletionRow[]>();

  if (completionsError) {
    throw completionsError;
  }

  const choreCompletions = (completions ?? []).flatMap((completion) => {
    const childId = completion.completed_by_member_id
      ? externalKeysByMemberId[completion.completed_by_member_id]
      : undefined;

    if (!childId || !completion.assignment_template_id) {
      return [];
    }

    return [
      {
        id: completion.id,
        assignmentTemplateId: completion.assignment_template_id,
        childId,
        choreId: completion.chore_id,
        completedAt: completion.completed_at,
        completedBy: childId,
      },
    ];
  });

  return {
    completions: choreCompletions,
    memberIdsByExternalKey,
    weeklyAssignmentTemplates,
    weeklyChores,
  };
}

async function loadRemoteAllowanceEntries({
  childId,
  householdId,
  remoteMemberId,
}: {
  childId: string;
  householdId: string;
  remoteMemberId: string;
}): Promise<AllowanceEntry[]> {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase
    .from("allowance_entries")
    .select("id, household_member_id, amount_cents, chore_completion_id, chore_id, entry_type, occurred_at, metadata")
    .eq("household_id", householdId)
    .eq("household_member_id", remoteMemberId)
    .order("occurred_at", { ascending: false })
    .returns<RemoteAllowanceEntryRow[]>();

  if (error) {
    if (isMissingAllowanceEntriesTableError(error)) {
      return [];
    }

    throw error;
  }

  return (data ?? []).map((entry) => ({
    id: entry.id,
    childId,
    amount: entry.amount_cents / 100,
    source:
      entry.entry_type === "morning_routine_completion"
        ? "morning-routine-completion"
        : entry.entry_type === "manual_adjustment"
          ? "manual-adjustment"
          : "chore-completion",
    occurredAt: entry.occurred_at,
    allowanceRequestId: entry.metadata.allowanceRequestId,
    assignmentTemplateId: entry.metadata.assignmentTemplateId,
    choreCompletionId: entry.chore_completion_id ?? undefined,
    choreId: entry.chore_id ?? undefined,
    choreTitle: entry.metadata.choreTitle,
    label: entry.metadata.label,
    note: entry.metadata.note,
    routineCategory: entry.metadata.routineCategory,
    routineCompletionDate: entry.metadata.routineCompletionDate,
  }));
}

function getRemoteRoutineCompletionKey(date: string, memberId: string, actionItemId: string) {
  return `${date}:${memberId}:remote-routine:${actionItemId}`;
}

async function loadRemoteTemporaryRoutines(householdId: string): Promise<RemoteTemporaryRoutineLoad> {
  const supabase = createBrowserSupabaseClient();
  const { data: members, error: membersError } = await supabase
    .from("household_members")
    .select("id, external_key")
    .eq("household_id", householdId)
    .eq("status", "active")
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
        category: (metadata.category as ResponsibilityCategory | undefined) ?? "personal-hygiene",
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

async function saveRemoteActionItemCompletion({
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
    throw new Error("Create household members in setup before completing a routine.");
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

function MorningRoutineFireworks() {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsVisible(false);
    }, 1800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (!isVisible) {
    return null;
  }

  const bursts = [
    { color: "#22c55e", left: "18%", top: "22%", size: 132 },
    { color: "#38bdf8", left: "50%", top: "14%", size: 156 },
    { color: "#f97316", left: "80%", top: "24%", size: 128 },
  ];

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.14),rgba(255,255,255,0))] animate-[fireworks-fade_1800ms_ease-out_forwards]" />
      {bursts.map((burst, burstIndex) => (
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2"
          key={`${burst.left}-${burst.top}`}
          style={{
            left: burst.left,
            top: burst.top,
          }}
        >
          {Array.from({ length: 14 }).map((_, particleIndex) => {
            const angle = (360 / 14) * particleIndex;

            return (
              <span
                className="absolute left-0 top-0 block h-1.5 rounded-full animate-[fireworks-burst_1200ms_cubic-bezier(0.18,0.8,0.32,1)_forwards]"
                key={`${burstIndex}-${particleIndex}`}
                style={{
                  animationDelay: `${burstIndex * 120}ms`,
                  backgroundColor: burst.color,
                  boxShadow: `0 0 18px ${burst.color}`,
                  transform: `rotate(${angle}deg) translateY(-${burst.size / 2}px)`,
                  transformOrigin: "0 0",
                  width: `${18 + (particleIndex % 4) * 6}px`,
                }}
              />
            );
          })}
        </div>
      ))}
      <style jsx>{`
        @keyframes fireworks-burst {
          0% {
            opacity: 0;
            transform: scale(0.2);
          }
          12% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: scale(1.15);
          }
        }

        @keyframes fireworks-fade {
          0% {
            opacity: 0;
          }
          20% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

function BaselineScheduleModal({
  blocks,
  defaultSelectedMemberIds,
  members,
  onClose,
  onSave,
  selectedDate,
}: {
  blocks: ScheduleBlock[];
  defaultSelectedMemberIds: string[];
  members: HouseholdMember[];
  onClose: () => void;
  onSave: (assignedMemberIds: string[]) => void | Promise<void>;
  selectedDate: string;
}) {
  const [selectedMemberIds, setSelectedMemberIds] = useState(
    defaultSelectedMemberIds.filter(Boolean),
  );
  const [isSaving, setIsSaving] = useState(false);

  function toggleMember(memberId: string) {
    setSelectedMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((candidate) => candidate !== memberId)
        : [...current, memberId],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedMemberIds.length === 0) {
      return;
    }

    setIsSaving(true);

    try {
      await onSave(selectedMemberIds);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto bg-[#17202a]/45 px-4 py-6"
      role="dialog"
    >
      <div className="mx-auto flex max-h-[calc(100vh-3rem)] w-full max-w-3xl flex-col overflow-hidden border border-[#cbd5df] bg-white p-5 shadow-xl">
        <div className="mb-4 flex shrink-0 items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Add to day schedule</h2>
            <p className="mt-1 text-sm text-[#4c5965]">
              Adding {blocks.length} baseline block{blocks.length === 1 ? "" : "s"} to{" "}
              {formatDateLabel(selectedDate)}.
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

        <div className="min-h-0 overflow-y-auto pr-1">
          <div className="mb-4 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#657381]">
              Selected Day
            </p>
            <p className="mt-1 font-semibold text-[#17202a]">{formatDateLabel(selectedDate)}</p>
          </div>

          <form className="grid gap-4" onSubmit={submit}>
            <section className="grid gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
                Baseline blocks
              </h3>
              <ol className="grid gap-2">
                {blocks.map((block) => (
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
            </section>

            <fieldset className="grid gap-2 text-sm">
              <legend className="font-semibold">Family members</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {members.map((member) => (
                  <label
                    className="flex items-center gap-3 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3"
                    key={member.id}
                  >
                    <input
                      checked={selectedMemberIds.includes(member.id)}
                      onChange={() => toggleMember(member.id)}
                      type="checkbox"
                    />
                    <span>
                      <span className="block font-semibold text-[#17202a]">
                        {member.preferredName}
                      </span>
                      <span className="block text-xs uppercase tracking-[0.12em] text-[#657381]">
                        {member.role}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <button
              className="justify-self-end border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isSaving || selectedMemberIds.length === 0}
              type="submit"
            >
              {isSaving ? "Saving..." : `Add to ${formatDateLabel(selectedDate)}`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
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
  defaultDate,
  defaultDayOfWeek,
  initialResponsibility,
  members,
  onClose,
  onSave,
}: {
  defaultAssigneeId: string;
  defaultDate: string;
  defaultDayOfWeek: DayOfWeek;
  initialResponsibility?: LocalResponsibilityItem;
  members: HouseholdMember[];
  onClose: () => void;
  onSave: (input: ResponsibilityDraftInput) => void | Promise<void>;
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
  const [scheduleMode, setScheduleMode] = useState<"weekly" | "open">("weekly");
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = Boolean(initialResponsibility);
  const showsWeeklyFields = isEditing || scheduleMode === "weekly";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSaving(true);

    try {
      if (!showsWeeklyFields) {
        await onSave({
          mode: "open",
          assigneeId,
          availableFrom: defaultDate,
          category,
          title,
        });
        return;
      }

      await onSave({
        mode: "weekly",
        assigneeId,
        category,
        daysOfWeek,
        endTime,
        startTime,
        title,
      });
    } finally {
      setIsSaving(false);
    }
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
              {showsWeeklyFields
                ? "Choose who owns it, when it appears, and where it is grouped."
                : `This will show in Responsibilities starting ${formatDateLabel(defaultDate)} and stay there until it is checked off.`}
            </p>
          </div>
          <button
            className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <form className="grid gap-3" onSubmit={submit}>
          {isEditing ? null : (
            <fieldset className="grid gap-2 text-sm">
              <legend className="font-semibold">How it appears</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-start gap-3 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3">
                  <input
                    checked={scheduleMode === "weekly"}
                    name="responsibility-schedule-mode"
                    onChange={() => setScheduleMode("weekly")}
                    type="radio"
                  />
                  <span>
                    <span className="block font-semibold text-[#17202a]">Repeats weekly</span>
                    <span className="block text-sm text-[#657381]">
                      Use this for responsibilities that happen on set days and times.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3">
                  <input
                    checked={scheduleMode === "open"}
                    name="responsibility-schedule-mode"
                    onChange={() => setScheduleMode("open")}
                    type="radio"
                  />
                  <span>
                    <span className="block font-semibold text-[#17202a]">Open until complete</span>
                    <span className="block text-sm text-[#657381]">
                      Use this for things like “Call your Grandma” that can be done any time later.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>
          )}

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

          {showsWeeklyFields ? (
            <>
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
                  disabled={isSaving || daysOfWeek.length === 0}
                  type="submit"
                >
                  {isSaving ? "Saving..." : isEditing ? "Save" : "Add"}
                </button>
              </div>
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm text-[#4c5965]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#657381]">
                  Starts Showing
                </p>
                <p className="mt-1 font-semibold text-[#17202a]">{formatDateLabel(defaultDate)}</p>
              </div>
              <button
                className="self-end border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSaving}
                type="submit"
              >
                {isSaving ? "Saving..." : "Add"}
              </button>
            </div>
          )}
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function createLocalScheduleEvent({
  assignedMemberIds,
  block,
  createdAt,
  date,
}: {
  assignedMemberIds: string[];
  block: ScheduleBlock;
  createdAt: string;
  date: string;
}) {
  return {
    id: createId(
      `baseline-flow-${date}-${block.id}-${assignedMemberIds.join("-")}-${createdAt}`,
    ),
    assignedMemberIds,
    baselineBlockId: block.id,
    calendarBehavior: "draft" as const,
    category: block.category,
    createdAt,
    date,
    endTime: block.endTime,
    source: "baseline-flow",
    startTime: block.startTime,
    title: block.title,
  };
}

function getLocalScheduleEventKey(
  event: Pick<
    LocalScheduledEvent,
    "assignedMemberIds" | "baselineBlockId" | "date" | "endTime" | "startTime" | "title"
  >,
) {
  return getScheduledBaselineEventKey({
    assignedIds: event.assignedMemberIds,
    baselineBlockId: event.baselineBlockId ?? "manual",
    date: event.date,
    endTime: event.endTime,
    startTime: event.startTime,
    title: event.title,
  });
}

function getScheduledBaselineEventKey({
  assignedIds,
  baselineBlockId,
  date,
  endTime,
  startTime,
  title,
}: {
  assignedIds: string[];
  baselineBlockId: string;
  date: string;
  endTime: string;
  startTime: string;
  title: string;
}) {
  return [
    date,
    startTime,
    endTime,
    title,
    baselineBlockId,
    [...assignedIds].sort().join(","),
  ].join("|");
}

function sourceLabel(source: string) {
  if (source === "sportsengine-calendar") {
    return "Sports";
  }

  if (source === "family-calendar") {
    return "Family";
  }

  if (source === "baseline-flow") {
    return "Baseline";
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

function formatOrdinal(value: number) {
  const remainder = value % 100;

  if (remainder >= 11 && remainder <= 13) {
    return `${value}th`;
  }

  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

function formatPlural(value: number, singular: string) {
  return value === 1 ? singular : `${singular}s`;
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

function DashboardSetupGate({ title }: { title: string }) {
  return (
    <main className="min-h-screen bg-[#eef2f6] px-5 py-10 text-[#17202a] sm:px-8 lg:px-10">
      <section className="mx-auto max-w-3xl border border-[#cbd5df] bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#2c7a7b]">Setup</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#4c5965]">
          Sign in and select a household before using the dashboard.
        </p>
        <Link className="mt-5 inline-flex border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white" href="/admin">
          Go to setup
        </Link>
      </section>
    </main>
  );
}

function AllowanceRequestModal({
  childMembers,
  errorMessage,
  isEditing,
  onClose,
  onSave,
  request,
  showChildPicker,
  startingDraft,
}: {
  childMembers: HouseholdMember[];
  errorMessage: string;
  isEditing: boolean;
  onClose: () => void;
  onSave: (input: AllowanceRequestDraftInput) => Promise<void>;
  request?: AllowanceRequest;
  showChildPicker: boolean;
  startingDraft: AllowanceRequestDraftInput;
}) {
  const [draft, setDraft] = useState(startingDraft);
  const [isSaving, setIsSaving] = useState(false);
  const selectedChild =
    childMembers.find((member) => member.id === draft.childId) ?? childMembers[0] ?? null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      await onSave(draft);
    } catch {
      return;
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto bg-[#17202a]/45 px-4 py-6"
      role="dialog"
    >
      <div className="mx-auto flex max-h-[calc(100vh-3rem)] w-full max-w-4xl flex-col overflow-hidden border border-[#cbd5df] bg-white shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#d7e0e7] px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
              {isEditing ? "Editing Pending Request" : "Creating New Request"}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[#17202a]">
              {isEditing ? "Edit credit request" : "Request bank credit"}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-[#4c5965]">
              {isEditing
                ? "Adjust the work, amount, or note before a parent approves the credit."
                : "Enter the work that was done and the requested dollar amount before it goes to parent approval."}
            </p>
          </div>
          <button
            className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 py-4">
          {errorMessage ? (
            <p className="mb-4 border border-[#f2b8a0] bg-[#fff7ed] px-3 py-2 text-sm text-[#8a3b12]">
              {errorMessage}
            </p>
          ) : null}

          <form className="grid gap-4" onSubmit={submit}>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
              {showChildPicker ? (
                <label className="grid gap-1 text-sm">
                  <span className="font-semibold">Child</span>
                  <select
                    className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        childId: event.target.value,
                      }))
                    }
                    value={draft.childId}
                  >
                    {childMembers.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.preferredName}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="grid gap-1 text-sm">
                  <span className="font-semibold">Child</span>
                  <div className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2 font-semibold text-[#17202a]">
                    {selectedChild?.preferredName ?? "Child"}
                  </div>
                </div>
              )}
              <label className="grid gap-1 text-sm">
                <span className="font-semibold">Date</span>
                <input
                  className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      occurrenceDate: event.target.value,
                    }))
                  }
                  type="date"
                  value={draft.occurrenceDate}
                />
              </label>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_170px_200px]">
              <label className="grid gap-1 text-sm">
                <span className="font-semibold">Work</span>
                <input
                  className="border border-[#d7e0e7] bg-white px-3 py-2"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Lawnwork"
                  required
                  value={draft.title}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-semibold">Amount</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#657381]">
                    $
                  </span>
                  <input
                    className="w-full border border-[#d7e0e7] bg-white py-2 pl-7 pr-3"
                    inputMode="decimal"
                    min="0.01"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        amount: event.target.value,
                      }))
                    }
                    required
                    step="0.01"
                    value={draft.amount}
                  />
                </div>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-semibold">Category</span>
                <select
                  className="border border-[#d7e0e7] bg-white px-3 py-2"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                  value={draft.category}
                >
                  {choreCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Note</span>
              <textarea
                className="min-h-28 border border-[#d7e0e7] bg-white px-3 py-2"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                placeholder="Optional details"
                value={draft.note}
              />
            </label>

            <div className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm text-[#4c5965]">
              {request ? (
                <p>
                  This request still needs a parent approval after saving changes. The current
                  pending amount is <span className="font-semibold text-[#17202a]">{formatCurrency(request.amount)}</span>.
                </p>
              ) : (
                <p>Requests stay pending until a household parent approves them.</p>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold"
                onClick={onClose}
                type="button"
              >
                Cancel
              </button>
              <button
                className="border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSaving}
                type="submit"
              >
                {isSaving ? "Saving..." : isEditing ? "Update request" : "Save request"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function AllowanceEntryModal({
  entry,
  errorMessage,
  onClose,
  onDelete,
  onSave,
  startingDraft,
}: {
  entry: AllowanceEntry;
  errorMessage: string;
  onClose: () => void;
  onDelete: () => void | Promise<void>;
  onSave: (input: AllowanceEntryDraftInput) => void | Promise<void>;
  startingDraft: AllowanceEntryDraftInput;
}) {
  const [draft, setDraft] = useState(startingDraft);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const canRename = canRenameAllowanceEntry(entry);
  const sourceDescription =
    entry.source === "manual-adjustment"
      ? "This changes the parent-approved credit shown in the bank."
      : "This changes only this one credit entry. It does not update the chore template or morning routine default.";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      await onSave(draft);
    } catch {
      return;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this bank entry? This only removes this one credit.")) {
      return;
    }

    setIsDeleting(true);

    try {
      await onDelete();
    } catch {
      return;
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto bg-[#17202a]/45 px-4 py-6"
      role="dialog"
    >
      <div className="mx-auto flex max-h-[calc(100vh-3rem)] w-full max-w-3xl flex-col overflow-hidden border border-[#cbd5df] bg-white shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#d7e0e7] px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
              Parent Bank Controls
            </p>
            <h2 className="mt-1 text-xl font-semibold text-[#17202a]">Edit bank entry</h2>
            <p className="mt-1 max-w-3xl text-sm text-[#4c5965]">{sourceDescription}</p>
          </div>
          <button
            className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isDeleting || isSaving}
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 py-4">
          {errorMessage ? (
            <p className="mb-4 border border-[#f2b8a0] bg-[#fff7ed] px-3 py-2 text-sm text-[#8a3b12]">
              {errorMessage}
            </p>
          ) : null}

          <form className="grid gap-4" onSubmit={submit}>
            {canRename ? (
              <label className="grid gap-1 text-sm">
                <span className="font-semibold">Work</span>
                <input
                  className="border border-[#d7e0e7] bg-white px-3 py-2"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  required
                  value={draft.title}
                />
              </label>
            ) : (
              <div className="grid gap-1 text-sm">
                <span className="font-semibold">Work</span>
                <div className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2 font-semibold text-[#17202a]">
                  {entry.choreTitle ?? entry.label ?? "Allowance credit"}
                </div>
              </div>
            )}

            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Amount</span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#657381]">
                  $
                </span>
                <input
                  className="w-full border border-[#d7e0e7] bg-white py-2 pl-7 pr-3"
                  inputMode="decimal"
                  min="0.01"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                  required
                  step="0.01"
                  value={draft.amount}
                />
              </div>
            </label>

            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Note</span>
              <textarea
                className="min-h-28 border border-[#d7e0e7] bg-white px-3 py-2"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                placeholder="Optional details"
                value={draft.note}
              />
            </label>

            <div className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm text-[#4c5965]">
              <p>{sourceDescription}</p>
            </div>

            <div className="flex flex-wrap justify-between gap-2">
              <button
                className="border border-[#dc546a] bg-white px-3 py-2 text-sm font-semibold text-[#b03046] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isDeleting || isSaving}
                onClick={() => {
                  void handleDelete();
                }}
                type="button"
              >
                {isDeleting ? "Deleting..." : "Delete entry"}
              </button>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold"
                  onClick={onClose}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isDeleting || isSaving}
                  type="submit"
                >
                  {isSaving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function BirthdayCountdownPanel({
  member,
  referenceDate,
}: {
  member?: HouseholdMember;
  referenceDate: string;
}) {
  const countdown = member ? getBirthdayCountdown(member, referenceDate) : null;

  return (
    <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">Birthday Countdown</h2>
      {member && countdown ? (
        <p className="mt-3 text-sm leading-6 text-[#4c5965]">
          <span className="font-semibold text-[#17202a]">{member.preferredName}</span>
          {countdown.daysUntilBirthday === 0
            ? ` is ${countdown.age} years old today. Happy birthday!`
            : ` is ${countdown.age} years old, ${countdown.daysUntilBirthday} ${formatPlural(
                countdown.daysUntilBirthday,
                "day",
              )} until your ${formatOrdinal(countdown.nextAge)}!`}
        </p>
      ) : (
        <EmptyState text="Add a birthday in household setup to show the countdown." />
      )}
    </section>
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
  lateStatus = "missed",
  meta,
  onChange,
  onEdit,
  onRemove,
  sourceLabel,
  title,
  valueLabel,
}: {
  checked: boolean;
  isPastDue?: boolean;
  lateStatus?: "carryover" | "missed";
  meta: string;
  onChange: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
  sourceLabel: string;
  title: string;
  valueLabel?: string;
}) {
  const itemClass = checked
    ? "border-[#b7d8c3] bg-[#f1faf3]"
    : isPastDue
      ? lateStatus === "carryover"
        ? "border-[#c8d1dc] bg-[#f4f7fa]"
        : "border-[#e0b9a7] bg-[#fff4ed]"
      : "border-[#d7e0e7] bg-[#f8fafc]";
  const lateBadgeClass =
    lateStatus === "carryover"
      ? "border-[#c8d1dc] text-[#526474]"
      : "border-[#e0b9a7] text-[#8a3f2f]";
  const lateBadgeLabel = lateStatus === "carryover" ? "Still open" : "Missed";

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
              {valueLabel ? ` · ${valueLabel}` : ""}
            </span>
          </span>
        </label>
        <span className="grid justify-items-end gap-2">
          {isPastDue ? (
            <span className={`border bg-white px-2 py-1 text-xs font-semibold ${lateBadgeClass}`}>
              {lateBadgeLabel}
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

function EventRow({
  event,
  members,
  onRemove,
}: {
  event: FixedEvent;
  members: HouseholdMember[];
  onRemove?: () => void;
}) {
  const assignedMemberNames = getAssignedMemberNames(event, members);

  return (
    <li className="grid gap-2 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm sm:grid-cols-[120px_1fr_auto]">
      <time className="font-semibold text-[#1f6f8b]">
        {formatTimeRange(event.startTime, event.endTime)}
      </time>
      <div>
        <p className="font-semibold">{event.title}</p>
        {assignedMemberNames.length > 0 ? (
          <p className="mt-1 text-xs text-[#657381]">{assignedMemberNames.join(", ")}</p>
        ) : null}
        {event.locationNote ? <p className="mt-1 text-xs text-[#657381]">{event.locationNote}</p> : null}
      </div>
      <span className="grid justify-items-end gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
          {sourceLabel(event.source)}
        </span>
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
    </li>
  );
}

function OtherEventRow({
  event,
  members,
  onRemove,
}: {
  event: FixedEvent;
  members: HouseholdMember[];
  onRemove?: () => void;
}) {
  const assignedMemberNames = getAssignedMemberNames(event, members);
  const eventOwnerLabel =
    assignedMemberNames.length > 0 ? assignedMemberNames.join(", ") : "Household";

  return (
    <li className="grid gap-2 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm sm:grid-cols-[120px_1fr_auto]">
      <time className="font-semibold text-[#1f6f8b]">
        {formatTimeRange(event.startTime, event.endTime)}
      </time>
      <div>
        <p className="font-semibold">{event.title}</p>
        <p className="mt-1 text-xs text-[#657381]">{eventOwnerLabel}</p>
        {event.locationNote ? <p className="mt-1 text-xs text-[#657381]">{event.locationNote}</p> : null}
      </div>
      <span className="grid justify-items-end gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
          {sourceLabel(event.source)}
        </span>
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
