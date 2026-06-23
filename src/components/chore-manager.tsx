"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  allowanceStorageKey,
  createChoreAllowanceEntry,
  formatCurrency,
  normalizeCurrencyAmount,
  removeAllowanceEntriesForCompletion,
  type AllowanceStorageState,
} from "@/lib/allowance/storage";
import {
  choreCategories,
  getChoreCategoryLabel,
  normalizeChoreCategory,
  type ChoreCategoryId,
} from "@/lib/chores/categories";
import { createRemoteChoreCompletion, deleteRemoteChoreCompletion } from "@/lib/chores/completions";
import { choreStorageKey, type ChoreStorageState } from "@/lib/chores/storage";
import { ConsolePageHeader } from "@/components/console-page-header";
import {
  formatDurationMinutes,
  normalizeDurationMinutes,
  normalizeOffsetMinutes,
} from "@/lib/routines/schedule";
import { useLocalStorageState } from "@/lib/storage/local";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useCurrentHousehold } from "@/lib/supabase/household";
import type {
  ChoreCompletion,
  DayOfWeek,
  HouseholdMember,
  PlannerData,
  RoutineChore,
  WeeklyChore,
  WeeklyChoreAssignmentTemplate,
} from "@/lib/planner/types";

type ChoreManagerProps = {
  chores: PlannerData["chores"];
  members: HouseholdMember[];
};

type AssignmentWithStatus = WeeklyChoreAssignmentTemplate & {
  child?: HouseholdMember;
  chore?: WeeklyChore;
  isComplete: boolean;
  completion?: ChoreCompletion;
};

type RemoteChoreRow = {
  id: string;
  external_key: string | null;
  title: string;
  category_id: string;
  metadata: {
    allowanceAmount?: number;
    definitionOfDone?: string;
    eligibleAssigneeIds?: string[];
    estimatedMinutes?: number;
    moneyTalk?: string;
    requiresAdultCheck?: boolean;
  };
};

type RemoteAssignmentTemplateRow = {
  id: string;
  chore_id: string;
  day_of_week: DayOfWeek;
  metadata: {
    endTime?: string;
    startTime?: string;
  };
};

type RemoteAssignmentRow = {
  assignable_id: string;
  household_member_id: string | null;
};

type RemoteCompletionRow = {
  id: string;
  assignment_template_id: string | null;
  chore_id: string;
  occurrence_date: string;
  completed_at: string;
  completed_by_member_id: string | null;
};

type RemoteRoutineActionItemRow = {
  id: string;
  title: string;
  days_of_week: DayOfWeek[];
  start_time: string | null;
  end_time: string | null;
  metadata: {
    category?: string;
    countsTowardWeeklyTarget?: boolean;
    durationMinutes?: number;
    offsetMinutes?: number;
    stepId?: string;
  };
};

type RemoteMemberRow = {
  id: string;
  external_key: string;
  preferred_name: string;
  role: string;
};

const dayOptions: DayOfWeek[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const dayLabels: Record<DayOfWeek, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
};
const warehouseSeedChores: WeeklyChore[] = [
  {
    id: "pick-rocks-grass",
    title: "Pick rocks out of the grass",
    category: "yard",
    estimatedMinutes: 20,
    definitionOfDone: "Bucket with the rocks in it and the total count.",
    eligibleAssigneeIds: [],
    moneyTalk: "2 cents / rock. No cheating.",
    requiresAdultCheck: true,
  },
  {
    id: "pick-up-dog-poop",
    title: "Pick up dog poop",
    category: "pets",
    estimatedMinutes: 10,
    eligibleAssigneeIds: [],
    requiresAdultCheck: true,
  },
  {
    id: "blow-off-trampoline",
    title: "Blow off the trampoline",
    category: "yard",
    estimatedMinutes: 10,
    eligibleAssigneeIds: [],
  },
  {
    id: "water-flowers",
    title: "Water the flowers",
    category: "yard",
    estimatedMinutes: 15,
    eligibleAssigneeIds: [],
  },
];
export function ChoreManager({ chores, members }: ChoreManagerProps) {
  const childMembers = useMemo(
    () => members.filter((member) => member.role === "child"),
    [members],
  );
  const assignableMembers = useMemo(() => members, [members]);
  const initialState = useMemo<ChoreStorageState>(
    () => ({
      routineChores: chores.routineChores,
      weeklyChores: mergeChoreSeeds(chores.weeklyChores, warehouseSeedChores, assignableMembers),
      weeklyAssignmentTemplates: chores.weeklyAssignmentTemplates,
      completions: chores.completions,
    }),
    [
      chores.completions,
      chores.routineChores,
      chores.weeklyAssignmentTemplates,
      chores.weeklyChores,
      assignableMembers,
    ],
  );
  const [state, setState] = useLocalStorageState(choreStorageKey, initialState);
  const [, setAllowanceState] = useLocalStorageState<AllowanceStorageState>(
    allowanceStorageKey,
    { entries: [] },
  );
  const { household, status: householdStatus } = useCurrentHousehold();
  const [remoteState, setRemoteState] = useState<ChoreStorageState | null>(null);
  const [remoteMembers, setRemoteMembers] = useState<RemoteMemberRow[]>([]);
  const [remoteStatusMessage, setRemoteStatusMessage] = useState("");
  const [remoteErrorMessage, setRemoteErrorMessage] = useState("");
  const [remoteSyncVersion, setRemoteSyncVersion] = useState(0);
  const householdId = household?.householdId;
  const isRemoteHouseholdReady = householdStatus === "ready" && Boolean(householdId);
  const effectiveState = isRemoteHouseholdReady && remoteState ? remoteState : state;
  const [selectedDate, setSelectedDate] = useState(() => formatDateKey(new Date()));
  const [selectedChoreId, setSelectedChoreId] = useState(
    effectiveState.weeklyChores[0]?.id ?? initialState.weeklyChores[0]?.id ?? "",
  );
  const [editingChoreId, setEditingChoreId] = useState<string | null>(null);
  const [assignmentModal, setAssignmentModal] = useState<
    | { mode: "add"; choreId?: string; childId?: string; dayOfWeek?: DayOfWeek }
    | { mode: "edit"; assignmentId: string }
    | null
  >(null);

  useEffect(() => {
    if (!isRemoteHouseholdReady || !householdId) {
      return;
    }

    let isActive = true;

    async function loadRemoteChores() {
      try {
        setRemoteErrorMessage("");
        const nextState = await loadRemoteChoreState(householdId!);

        if (!isActive) {
          return;
        }

        setRemoteMembers(nextState.members);
        setRemoteState(nextState.state);
        setState(nextState.state);
        setSelectedChoreId((current) => current || (nextState.state.weeklyChores[0]?.id ?? ""));
      } catch (error) {
        if (!isActive) {
          return;
        }

        setRemoteErrorMessage(error instanceof Error ? error.message : "Could not load Supabase chores.");
      }
    }

    void loadRemoteChores();

    return () => {
      isActive = false;
    };
  }, [householdId, isRemoteHouseholdReady, remoteSyncVersion, setState]);

  const choresById = useMemo(
    () => new Map(effectiveState.weeklyChores.map((chore) => [chore.id, chore])),
    [effectiveState.weeklyChores],
  );
  const memberById = useMemo(
    () => new Map(assignableMembers.map((member) => [member.id, member])),
    [assignableMembers],
  );
  const selectedDay = getDayOfWeekForDate(selectedDate);
  const assignments = useMemo<AssignmentWithStatus[]>(
    () =>
      effectiveState.weeklyAssignmentTemplates
        .map((assignment) => {
          const completion = effectiveState.completions.find(
            (candidate) =>
              candidate.assignmentTemplateId === assignment.id &&
              candidate.childId === assignment.childId &&
              candidate.completedAt.startsWith(selectedDate),
          );

          return {
            ...assignment,
            child: memberById.get(assignment.childId),
            chore: choresById.get(assignment.choreId),
            completion,
            isComplete: Boolean(completion),
          };
        })
        .sort((first, second) =>
          compareStrings(
            `${first.dayOfWeek}-${first.startTime}-${first.child?.preferredName ?? ""}`,
            `${second.dayOfWeek}-${second.startTime}-${second.child?.preferredName ?? ""}`,
          ),
        ),
    [memberById, choresById, effectiveState.completions, effectiveState.weeklyAssignmentTemplates, selectedDate],
  );
  const selectedChore =
    choresById.get(selectedChoreId) ?? effectiveState.weeklyChores[0] ?? initialState.weeklyChores[0];
  const selectedChoreAssignments = assignments.filter(
    (assignment) => assignment.choreId === selectedChore?.id,
  );
  const selectedChoreMembers = selectedChore
    ? getEligibleMembersForChore(
        selectedChore,
        assignableMembers,
        selectedChoreAssignments.map((assignment) => assignment.childId),
      )
    : [];
  const todaysAssignments = assignments.filter((assignment) => assignment.dayOfWeek === selectedDay);
  const scheduledChoreIds = new Set(effectiveState.weeklyAssignmentTemplates.map((assignment) => assignment.choreId));
  const backlogChores = effectiveState.weeklyChores.filter((chore) => !scheduledChoreIds.has(chore.id));
  const childSummaries = assignableMembers.map((child) => {
    const childAssignments = assignments.filter((assignment) => assignment.childId === child.id);
    const todayChildAssignments = childAssignments.filter(
      (assignment) => assignment.dayOfWeek === selectedDay,
    );

    return {
      child,
      assignedCount: childAssignments.length,
      doneToday: todayChildAssignments.filter((assignment) => assignment.isComplete).length,
      dueToday: todayChildAssignments.length,
    };
  });

  async function toggleCompletion(assignment: WeeklyChoreAssignmentTemplate) {
    if (isRemoteHouseholdReady && householdId) {
      await runRemoteAction(async () => {
        const existing = effectiveState.completions.find(
          (completion) =>
            completion.assignmentTemplateId === assignment.id &&
            completion.childId === assignment.childId &&
            completion.completedAt.startsWith(selectedDate),
        );

        if (existing) {
          await deleteRemoteChoreCompletion(householdId, existing.id);
          return "Completion cleared.";
        }

        const createdCompletion = await createRemoteChoreCompletion({
          assignment,
          chore: choresById.get(assignment.choreId),
          earnsAllowance: memberById.get(assignment.childId)?.role === "child",
          householdId,
          occurrenceDate: selectedDate,
          remoteMemberId: getRemoteMemberId(remoteMembers, assignment.childId),
        });
        return createdCompletion.allowanceTracked
          ? "Completion saved to Supabase."
          : "Completion saved. Allowance sync will start after the allowance migration is deployed.";
      });
      return;
    }

    setState((current) => {
      const existing = current.completions.find(
        (completion) =>
          completion.assignmentTemplateId === assignment.id &&
          completion.childId === assignment.childId &&
          completion.completedAt.startsWith(selectedDate),
      );

      if (existing) {
        setAllowanceState((currentAllowance) => ({
          entries: removeAllowanceEntriesForCompletion(currentAllowance.entries, existing.id),
        }));

        return {
          ...current,
          completions: current.completions.filter((completion) => completion.id !== existing.id),
        };
      }

      const completionId = createId(`${assignment.id}-${selectedDate}`);
      const completedAt = `${selectedDate}T${assignment.endTime}:00`;
      const allowanceEntry = createChoreAllowanceEntry({
        assignment,
        childId: assignment.childId,
        chore: choresById.get(assignment.choreId),
        choreCompletionId: completionId,
        id: createId(`${assignment.id}-${selectedDate}-allowance`),
        occurredAt: completedAt,
      });

      if (allowanceEntry && memberById.get(assignment.childId)?.role === "child") {
        setAllowanceState((currentAllowance) => ({
          entries: [...currentAllowance.entries, allowanceEntry],
        }));
      }

      return {
        ...current,
        completions: [
          ...current.completions,
          {
            id: completionId,
            assignmentTemplateId: assignment.id,
            childId: assignment.childId,
            choreId: assignment.choreId,
            completedAt,
            completedBy: assignment.childId,
          },
        ],
      };
    });
  }

  async function upsertChore(chore: WeeklyChore) {
    if (isRemoteHouseholdReady && householdId) {
      await runRemoteAction(async () => {
        const savedChore = await saveRemoteChore(householdId, chore);
        setSelectedChoreId(savedChore.id);
        setEditingChoreId(null);
        return "Chore saved to Supabase.";
      });
      return;
    }

    setState((current) => {
      const exists = current.weeklyChores.some((candidate) => candidate.id === chore.id);

      return {
        ...current,
        weeklyChores: exists
          ? current.weeklyChores.map((candidate) => (candidate.id === chore.id ? chore : candidate))
          : [...current.weeklyChores, chore],
      };
    });
    setSelectedChoreId(chore.id);
    setEditingChoreId(null);
  }

  async function upsertAssignment(assignment: WeeklyChoreAssignmentTemplate) {
    if (isRemoteHouseholdReady && householdId) {
      await runRemoteAction(async () => {
        const savedChore = await ensureRemoteChore(householdId, choresById, assignment.choreId);
        const savedAssignment = await saveRemoteChoreAssignment({
          assignment: {
            ...assignment,
            choreId: savedChore.id,
          },
          householdId,
          remoteMemberId: getRemoteMemberId(remoteMembers, assignment.childId),
        });
        setSelectedChoreId(savedAssignment.choreId);
        setAssignmentModal(null);
        return isUuid(assignment.choreId)
          ? "Assignment saved to Supabase."
          : "Chore and assignment saved to Supabase.";
      });
      return;
    }

    setState((current) => {
      const exists = current.weeklyAssignmentTemplates.some(
        (candidate) => candidate.id === assignment.id,
      );

      return {
        ...current,
        weeklyAssignmentTemplates: exists
          ? current.weeklyAssignmentTemplates.map((candidate) =>
              candidate.id === assignment.id ? assignment : candidate,
            )
          : [...current.weeklyAssignmentTemplates, assignment],
      };
    });
    setSelectedChoreId(assignment.choreId);
    setAssignmentModal(null);
  }

  async function runRemoteAction(action: () => Promise<string>) {
    setRemoteErrorMessage("");
    setRemoteStatusMessage("");

    try {
      const message = await action();
      setRemoteStatusMessage(message);
      setRemoteSyncVersion((current) => current + 1);
    } catch (error) {
      setRemoteErrorMessage(error instanceof Error ? error.message : "Could not save chore data.");
    }
  }

  return (
    <main className="min-h-screen bg-[#eef2f6] text-[#17202a]">
      <ConsolePageHeader
        activePage="chores"
        aside={
          <label className="grid gap-1 text-sm font-semibold text-[#4c5965]">
            Date
            <input
              className="border border-[#cbd5df] bg-white px-3 py-2 text-[#17202a]"
              onChange={(event) => setSelectedDate(event.target.value)}
              type="date"
              value={selectedDate}
            />
          </label>
        }
        description="Schedule repeat work, keep a warehouse of productive odd jobs, and track each kid's completion separately even when siblings share the same chore."
        eyebrow="Household work board"
        title="Chores"
      />

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-5 sm:px-8 lg:px-10">
        {remoteErrorMessage ? (
          <p className="border border-[#f2b8a0] bg-[#fff7ed] px-3 py-2 text-sm text-[#8a3b12]">
            {remoteErrorMessage}
          </p>
        ) : null}
        {remoteStatusMessage ? (
          <p className="border border-[#b7d7ce] bg-[#f0faf7] px-3 py-2 text-sm text-[#2f6f73]">
            {remoteStatusMessage}
          </p>
        ) : null}
        <div className="grid gap-3 md:grid-cols-3">
          {childSummaries.map((summary) => (
            <section className="border border-[#cbd5df] bg-white p-4 shadow-sm" key={summary.child.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{summary.child.preferredName}</h2>
                  <p className="mt-1 text-sm text-[#657381]">
                    {summary.assignedCount} weekly slots
                  </p>
                </div>
                <span className="border border-[#bcd8dc] bg-[#e8f4f3] px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
                  {summary.doneToday}/{summary.dueToday} today
                </span>
              </div>
            </section>
          ))}
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="grid gap-5">
            <Panel
              action={
                <button
                  className="border border-[#1f6f8b] bg-[#1f6f8b] px-3 py-2 text-sm font-semibold text-white"
                  onClick={() => setEditingChoreId("new")}
                  type="button"
                >
                  Add chore
                </button>
              }
              title="Chore Tiles"
            >
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {effectiveState.weeklyChores.map((chore) => (
                  <ChoreTile
                    assignments={assignments.filter((assignment) => assignment.choreId === chore.id)}
                    childMembers={assignableMembers}
                    chore={chore}
                    isSelected={selectedChore?.id === chore.id}
                    key={chore.id}
                    onAssign={() => setAssignmentModal({ mode: "add", choreId: chore.id, dayOfWeek: selectedDay })}
                    onEdit={() => setEditingChoreId(chore.id)}
                    onSelect={() => setSelectedChoreId(chore.id)}
                    selectedDay={selectedDay}
                  />
                ))}
              </div>
            </Panel>

            <Panel
              action={
                <button
                  className="border border-[#1f6f8b] bg-[#1f6f8b] px-3 py-2 text-sm font-semibold text-white"
                  onClick={() => setAssignmentModal({ mode: "add", dayOfWeek: selectedDay })}
                  type="button"
                >
                  Add slot
                </button>
              }
              title={`${dayLabels[selectedDay]} Assignments`}
            >
              {todaysAssignments.length > 0 ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {todaysAssignments.map((assignment) => (
                    <AssignmentCard
                      assignment={assignment}
                      key={assignment.id}
                      onEdit={() => setAssignmentModal({ mode: "edit", assignmentId: assignment.id })}
          onToggle={() => void toggleCompletion(assignment)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState text="No chores are assigned for this day yet." />
              )}
            </Panel>
          </section>

          <aside className="grid content-start gap-5">
            {selectedChore ? (
              <Panel
                action={
                  <button
                    className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2 text-sm font-semibold"
                    onClick={() => setEditingChoreId(selectedChore.id)}
                    type="button"
                  >
                    Edit
                  </button>
                }
                title="Selected Chore"
              >
                <div className="grid gap-4">
                  <div>
                    <h2 className="text-2xl font-semibold">{selectedChore.title}</h2>
                    <p className="mt-1 text-sm text-[#657381]">
                      {getChoreCategoryLabel(selectedChore.category)} · {selectedChore.estimatedMinutes} min
                      {selectedChore.allowanceAmount
                        ? ` · ${formatCurrency(selectedChore.allowanceAmount)}`
                        : ""}
                      {selectedChore.requiresAdultCheck ? " · adult check" : ""}
                    </p>
                  </div>

                  {selectedChore.definitionOfDone || selectedChore.moneyTalk ? (
                    <div className="grid gap-3 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm">
                      {selectedChore.definitionOfDone ? (
                        <div>
                          <p className="font-semibold text-[#17202a]">Definition of done</p>
                          <p className="mt-1 text-[#4c5965]">{selectedChore.definitionOfDone}</p>
                        </div>
                      ) : null}
                      {selectedChore.moneyTalk ? (
                        <div>
                          <p className="font-semibold text-[#17202a]">Money talk</p>
                          <p className="mt-1 text-[#4c5965]">{selectedChore.moneyTalk}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <section className="grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
                        Member status
                      </h3>
                      <button
                        className="text-sm font-semibold text-[#1f6f8b]"
                        onClick={() =>
                          setAssignmentModal({
                            mode: "add",
                            choreId: selectedChore.id,
                            dayOfWeek: selectedDay,
                          })
                        }
                        type="button"
                      >
                        Assign
                      </button>
                    </div>
                    <div className="grid gap-2">
                      {selectedChoreMembers.map((child) => {
                        const childAssignments = selectedChoreAssignments.filter(
                          (assignment) => assignment.childId === child.id,
                        );
                        const dayAssignment = childAssignments.find(
                          (assignment) => assignment.dayOfWeek === selectedDay,
                        );

                        return (
                          <button
                            className="w-full border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-left hover:border-[#1f6f8b] hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#bcd8dc]"
                            key={child.id}
                            onClick={() =>
                              setAssignmentModal(
                                dayAssignment
                                  ? { mode: "edit", assignmentId: dayAssignment.id }
                                  : {
                                      mode: "add",
                                      childId: child.id,
                                      choreId: selectedChore.id,
                                      dayOfWeek: selectedDay,
                                    },
                              )
                            }
                            type="button"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-semibold">{child.preferredName}</p>
                                <p className="text-xs text-[#657381]">
                                  {childAssignments.length > 0
                                    ? childAssignments.map((assignment) => dayLabels[assignment.dayOfWeek]).join(", ")
                                    : "No assignment"}
                                </p>
                              </div>
                              <StatusPill
                                isComplete={dayAssignment?.isComplete ?? false}
                                label={
                                  dayAssignment
                                    ? dayAssignment.isComplete
                                      ? "Done"
                                      : "Open"
                                    : "Unassigned"
                                }
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </div>
              </Panel>
            ) : null}

            <Panel title="Warehouse">
              {backlogChores.length > 0 ? (
                <div className="grid gap-2">
                  {backlogChores.map((chore) => (
                    <button
                      className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-left"
                      key={chore.id}
                      onClick={() => setSelectedChoreId(chore.id)}
                      type="button"
                    >
                      <span className="block font-semibold">{chore.title}</span>
                      <span className="mt-1 block text-xs text-[#657381]">
                        {getChoreCategoryLabel(chore.category)} · {chore.estimatedMinutes} min
                        {chore.allowanceAmount ? ` · ${formatCurrency(chore.allowanceAmount)}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState text="Every captured chore currently has at least one assignment slot." />
              )}
            </Panel>

            <Panel
              action={
                <Link
                  className="border border-[#1f6f8b] bg-[#1f6f8b] px-3 py-2 text-sm font-semibold text-white"
                  href="/admin"
                >
                  Manage in Admin
                </Link>
              }
              title="Morning Routine"
            >
              {effectiveState.routineChores.length > 0 ? (
                <ul className="grid gap-2">
                  {effectiveState.routineChores.map((chore) => (
                    <RoutineChoreRow chore={chore} childMembers={childMembers} key={chore.id} />
                  ))}
                </ul>
              ) : (
                <EmptyState text="No routine steps are saved for this household yet." />
              )}
              <p className="mt-3 border border-dashed border-[#cbd5df] bg-[#f8fafc] px-3 py-3 text-sm text-[#4c5965]">
                Routine templates are managed in{" "}
                <Link className="font-semibold text-[#1f6f8b] underline" href="/admin">
                  Admin setup
                </Link>
                . This preview is read-only so the dashboard and setup flow keep a single source of truth.
              </p>
            </Panel>
          </aside>
        </div>
      </section>

      {editingChoreId ? (
        <ChoreEditor
          chore={
            editingChoreId === "new"
              ? undefined
              : effectiveState.weeklyChores.find((chore) => chore.id === editingChoreId)
          }
          childMembers={assignableMembers}
          onCancel={() => setEditingChoreId(null)}
          onSave={(chore) => void upsertChore(chore)}
        />
      ) : null}

      {assignmentModal ? (
        <AssignmentEditor
          assignment={
            assignmentModal.mode === "edit"
              ? effectiveState.weeklyAssignmentTemplates.find(
                  (assignment) => assignment.id === assignmentModal.assignmentId,
                )
              : undefined
          }
          childMembers={assignableMembers}
          chores={effectiveState.weeklyChores}
          defaultChildId={assignmentModal.mode === "add" ? assignmentModal.childId : undefined}
          defaultChoreId={assignmentModal.mode === "add" ? assignmentModal.choreId : undefined}
          defaultDayOfWeek={assignmentModal.mode === "add" ? assignmentModal.dayOfWeek : undefined}
          onCancel={() => setAssignmentModal(null)}
          onSave={(assignment) => void upsertAssignment(assignment)}
        />
      ) : null}
    </main>
  );
}

function ChoreTile({
  assignments,
  childMembers,
  chore,
  isSelected,
  onAssign,
  onEdit,
  onSelect,
  selectedDay,
}: {
  assignments: AssignmentWithStatus[];
  childMembers: HouseholdMember[];
  chore: WeeklyChore;
  isSelected: boolean;
  onAssign: () => void;
  onEdit: () => void;
  onSelect: () => void;
  selectedDay: DayOfWeek;
}) {
  const todayAssignments = assignments.filter((assignment) => assignment.dayOfWeek === selectedDay);
  const completedToday = todayAssignments.filter((assignment) => assignment.isComplete).length;
  const visibleMembers = getEligibleMembersForChore(
    chore,
    childMembers,
    assignments.map((assignment) => assignment.childId),
  );

  return (
    <article
      className={`border bg-white p-4 shadow-sm ${
        isSelected ? "border-[#1f6f8b] ring-2 ring-[#bcd8dc]" : "border-[#cbd5df]"
      }`}
    >
      <button className="block w-full text-left" onClick={onSelect} type="button">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">{chore.title}</h3>
            <p className="mt-1 text-sm text-[#657381]">
              {getChoreCategoryLabel(chore.category)} · {chore.estimatedMinutes} min
              {chore.allowanceAmount ? ` · ${formatCurrency(chore.allowanceAmount)}` : ""}
            </p>
          </div>
          <StatusPill
            isComplete={todayAssignments.length > 0 && completedToday === todayAssignments.length}
            label={
              todayAssignments.length > 0
                ? `${completedToday}/${todayAssignments.length}`
                : "Backlog"
            }
          />
        </div>
        <div className="mt-4 grid gap-2">
          {visibleMembers.map((child) => {
            const childAssignments = assignments.filter((assignment) => assignment.childId === child.id);
            const dayAssignment = childAssignments.find(
              (assignment) => assignment.dayOfWeek === selectedDay,
            );

            return (
              <div className="flex items-center justify-between gap-3 text-sm" key={child.id}>
                <span className="font-medium">{child.preferredName}</span>
                <span className={dayAssignment?.isComplete ? "text-[#2f6f73]" : "text-[#657381]"}>
                  {dayAssignment
                    ? dayAssignment.isComplete
                      ? "Done today"
                      : "Due today"
                    : childAssignments.length > 0
                      ? childAssignments.map((assignment) => dayLabels[assignment.dayOfWeek]).join(", ")
                      : "No slot"}
                </span>
              </div>
            );
          })}
        </div>
      </button>
      <div className="mt-4 flex gap-2">
        <button
          className="border border-[#1f6f8b] bg-[#1f6f8b] px-3 py-2 text-sm font-semibold text-white"
          onClick={onAssign}
          type="button"
        >
          Assign
        </button>
        <button
          className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2 text-sm font-semibold"
          onClick={onEdit}
          type="button"
        >
          Edit
        </button>
      </div>
    </article>
  );
}

function AssignmentCard({
  assignment,
  onEdit,
  onToggle,
}: {
  assignment: AssignmentWithStatus;
  onEdit: () => void;
  onToggle: () => void;
}) {
  return (
    <article className="border border-[#d7e0e7] bg-[#f8fafc] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{assignment.chore?.title ?? assignment.choreId}</h3>
          <p className="mt-1 text-sm text-[#657381]">
            {assignment.child?.preferredName ?? assignment.childId} ·{" "}
            {formatTimeRange(assignment.startTime, assignment.endTime)}
            {assignment.chore?.allowanceAmount
              ? ` · ${formatCurrency(assignment.chore.allowanceAmount)}`
              : ""}
          </p>
        </div>
        <StatusPill isComplete={assignment.isComplete} label={assignment.isComplete ? "Done" : "Open"} />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          className={`border px-3 py-2 text-sm font-semibold ${
            assignment.isComplete
              ? "border-[#bcd8dc] bg-white text-[#2f6f73]"
              : "border-[#1f6f8b] bg-[#1f6f8b] text-white"
          }`}
          onClick={onToggle}
          type="button"
        >
          {assignment.isComplete ? "Undo done" : "Mark done"}
        </button>
        <button
          className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold"
          onClick={onEdit}
          type="button"
        >
          Edit
        </button>
      </div>
    </article>
  );
}

function ChoreEditor({
  chore,
  childMembers,
  onCancel,
  onSave,
}: {
  chore?: WeeklyChore;
  childMembers: HouseholdMember[];
  onCancel: () => void;
  onSave: (chore: WeeklyChore) => void;
}) {
  const [title, setTitle] = useState(chore?.title ?? "");
  const [category, setCategory] = useState<ChoreCategoryId>(
    normalizeChoreCategory(chore?.category),
  );
  const [estimatedMinutes, setEstimatedMinutes] = useState(String(chore?.estimatedMinutes ?? 10));
  const [allowanceAmount, setAllowanceAmount] = useState(
    chore?.allowanceAmount ? String(chore.allowanceAmount) : "",
  );
  const [definitionOfDone, setDefinitionOfDone] = useState(chore?.definitionOfDone ?? "");
  const [requiresAdultCheck, setRequiresAdultCheck] = useState(Boolean(chore?.requiresAdultCheck));
  const [eligibleAssigneeIds, setEligibleAssigneeIds] = useState<string[]>(
    chore?.eligibleAssigneeIds.length ? chore.eligibleAssigneeIds : childMembers.map((child) => child.id),
  );
  const [moneyTalk, setMoneyTalk] = useState(chore?.moneyTalk ?? "");

  function submit() {
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      return;
    }

    onSave({
      id: chore?.id ?? createId(trimmedTitle),
      externalKey: chore?.externalKey,
      title: trimmedTitle,
      category,
      estimatedMinutes: Number(estimatedMinutes) || 10,
      eligibleAssigneeIds,
      requiresAdultCheck,
      allowanceAmount: normalizeCurrencyAmount(allowanceAmount),
      definitionOfDone: definitionOfDone.trim() || undefined,
      moneyTalk: moneyTalk.trim() || undefined,
    });
  }

  return (
    <EditorShell onCancel={onCancel} title={chore ? "Edit chore" : "Add chore"}>
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">Name</span>
        <input
          className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Water flowers, sweep garage, wipe patio table..."
          value={title}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Category</span>
          <select
            className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
            onChange={(event) => setCategory(event.target.value as ChoreCategoryId)}
            value={category}
          >
            {choreCategories.map((categoryOption) => (
              <option key={categoryOption.id} value={categoryOption.id}>
                {categoryOption.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Minutes</span>
          <input
            className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
            min="1"
            onChange={(event) => setEstimatedMinutes(event.target.value)}
            type="number"
            value={estimatedMinutes}
          />
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">Allowance payout</span>
        <input
          className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
          inputMode="decimal"
          min="0"
          onChange={(event) => setAllowanceAmount(event.target.value)}
          placeholder="0.50"
          step="0.01"
          type="number"
          value={allowanceAmount}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">Definition of done</span>
        <textarea
          className="min-h-24 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
          onChange={(event) => setDefinitionOfDone(event.target.value)}
          placeholder="What proves the chore is actually finished?"
          value={definitionOfDone}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">Money talk</span>
        <input
          className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
          onChange={(event) => setMoneyTalk(event.target.value)}
          placeholder="2 cents / rock. No cheating."
          value={moneyTalk}
        />
      </label>
      <fieldset className="grid gap-2 text-sm">
        <legend className="font-semibold">Eligible household members</legend>
        <div className="flex flex-wrap gap-2">
          {childMembers.map((child) => (
            <label
              className="flex items-center gap-2 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
              key={child.id}
            >
              <input
                checked={eligibleAssigneeIds.includes(child.id)}
                onChange={() =>
                  setEligibleAssigneeIds((current) =>
                    current.includes(child.id)
                      ? current.filter((id) => id !== child.id)
                      : [...current, child.id],
                  )
                }
                type="checkbox"
              />
              {child.preferredName}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          checked={requiresAdultCheck}
          onChange={(event) => setRequiresAdultCheck(event.target.checked)}
          type="checkbox"
        />
        Needs adult check
      </label>
      <EditorActions onCancel={onCancel} onSave={submit} />
    </EditorShell>
  );
}

function AssignmentEditor({
  assignment,
  childMembers,
  chores,
  defaultChildId,
  defaultChoreId,
  defaultDayOfWeek,
  onCancel,
  onSave,
}: {
  assignment?: WeeklyChoreAssignmentTemplate;
  childMembers: HouseholdMember[];
  chores: WeeklyChore[];
  defaultChildId?: string;
  defaultChoreId?: string;
  defaultDayOfWeek?: DayOfWeek;
  onCancel: () => void;
  onSave: (assignment: WeeklyChoreAssignmentTemplate) => void;
}) {
  const initialChoreId = assignment?.choreId ?? defaultChoreId ?? chores[0]?.id ?? "";
  const initialStartTime = assignment?.startTime ?? "16:00";
  const initialEndTime =
    assignment?.endTime ??
    addMinutesToTime(
      initialStartTime,
      chores.find((chore) => chore.id === initialChoreId)?.estimatedMinutes ?? 15,
    );
  const [childId, setChildId] = useState(
    assignment?.childId ?? defaultChildId ?? childMembers[0]?.id ?? "",
  );
  const [choreId, setChoreId] = useState(initialChoreId);
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(
    assignment?.dayOfWeek ?? defaultDayOfWeek ?? "MO",
  );
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [durationMinutes, setDurationMinutes] = useState(
    getDurationMinutes(initialStartTime, initialEndTime) ??
      chores.find((chore) => chore.id === initialChoreId)?.estimatedMinutes ??
      15,
  );
  const selectedChore = chores.find((chore) => chore.id === choreId);
  const availableAssignees = getEligibleMembersForChore(selectedChore, childMembers, [childId]);

  function submit() {
    if (!childId || !choreId) {
      return;
    }

    onSave({
      id: assignment?.id ?? createId(`${childId}-${choreId}-${dayOfWeek}`),
      childId,
      choreId,
      dayOfWeek,
      startTime,
      endTime,
    });
  }

  return (
    <EditorShell onCancel={onCancel} title={assignment ? "Edit assignment" : "Assign chore"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Assignee</span>
          <select
            className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
            onChange={(event) => setChildId(event.target.value)}
            value={childId}
          >
            {availableAssignees.map((child) => (
              <option key={child.id} value={child.id}>
                {child.preferredName}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Chore</span>
          <select
            className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
            onChange={(event) => {
              const nextChoreId = event.target.value;
              const nextDuration = chores.find((chore) => chore.id === nextChoreId)?.estimatedMinutes ?? durationMinutes;

              setChoreId(nextChoreId);
              setDurationMinutes(nextDuration);
              setEndTime(addMinutesToTime(startTime, nextDuration));
            }}
            value={choreId}
          >
            {chores.map((chore) => (
              <option key={chore.id} value={chore.id}>
                {chore.title}
              </option>
            ))}
          </select>
          <span className="text-xs text-[#657381]">
            {selectedChore
              ? [
                  `${selectedChore.estimatedMinutes} min`,
                  selectedChore.allowanceAmount ? formatCurrency(selectedChore.allowanceAmount) : null,
                  selectedChore.requiresAdultCheck ? "adult check" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : ""}
          </span>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Day</span>
          <select
            className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
            onChange={(event) => setDayOfWeek(event.target.value as DayOfWeek)}
            value={dayOfWeek}
          >
            {dayOptions.map((day) => (
              <option key={day} value={day}>
                {dayLabels[day]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Start</span>
          <input
            className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
            onChange={(event) => {
              const nextStartTime = event.target.value;

              setStartTime(nextStartTime);
              setEndTime(addMinutesToTime(nextStartTime, durationMinutes));
            }}
            type="time"
            value={startTime}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">End</span>
          <input
            className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
            onChange={(event) => {
              const nextEndTime = event.target.value;

              setEndTime(nextEndTime);
              setDurationMinutes(getDurationMinutes(startTime, nextEndTime) ?? durationMinutes);
            }}
            type="time"
            value={endTime}
          />
        </label>
      </div>
      <EditorActions onCancel={onCancel} onSave={submit} />
    </EditorShell>
  );
}

function Panel({
  action,
  children,
  title,
}: Readonly<{
  action?: React.ReactNode;
  children: React.ReactNode;
  title: string;
}>) {
  return (
    <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function EditorShell({
  children,
  onCancel,
  title,
}: Readonly<{
  children: React.ReactNode;
  onCancel: () => void;
  title: string;
}>) {
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-[#17202a]/45 px-4 py-6"
      role="dialog"
    >
      <section className="w-full max-w-3xl border border-[#cbd5df] bg-white p-5 shadow-xl">
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-[#4c5965]">
              Changes sync through Supabase when this device is signed in to a household; otherwise they are saved in this browser.
            </p>
          </div>
          <button
            className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2 text-sm font-semibold"
            onClick={onCancel}
            type="button"
          >
            Close
          </button>
        </header>
        <div className="grid gap-4">{children}</div>
      </section>
    </div>
  );
}

function EditorActions({ onCancel, onSave }: { onCancel: () => void; onSave: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <button
        className="border border-[#d7e0e7] bg-[#f8fafc] px-4 py-2 text-sm font-semibold"
        onClick={onCancel}
        type="button"
      >
        Cancel
      </button>
      <button
        className="border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white"
        onClick={onSave}
        type="button"
      >
        Save
      </button>
    </div>
  );
}

function RoutineChoreRow({
  chore,
  childMembers,
}: {
  chore: RoutineChore;
  childMembers: HouseholdMember[];
}) {
  const assignedKids = chore.defaultAssigneeIds
    .map((id) => childMembers.find((child) => child.id === id)?.preferredName)
    .filter(Boolean)
    .join(", ");

  return (
    <li className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm">
      <div>
        <p className="font-semibold">{chore.title}</p>
        <p className="mt-1 text-xs text-[#657381]">
          {getRoutineScheduleLabel(chore)} · {assignedKids}
        </p>
      </div>
    </li>
  );
}

function getRoutineScheduleLabel(chore: RoutineChore) {
  const durationLabel =
    formatDurationMinutes(
      normalizeDurationMinutes(chore.schedule.durationMinutes) ??
        getDurationMinutes(chore.schedule.startTime, chore.schedule.endTime),
    ) || null;

  if (durationLabel) {
    return durationLabel;
  }

  return formatTimeRange(normalizeRemoteTime(chore.schedule.startTime), normalizeRemoteTime(chore.schedule.endTime));
}

function getRoutineChoreSortKey(chore: RoutineChore) {
  if (typeof chore.schedule.offsetMinutes === "number") {
    return `0-${String(chore.schedule.offsetMinutes).padStart(4, "0")}-${chore.title}`;
  }

  return `1-${normalizeRemoteTime(chore.schedule.startTime)}-${chore.title}`;
}

function StatusPill({ isComplete, label }: { isComplete: boolean; label: string }) {
  return (
    <span
      className={`border px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
        isComplete
          ? "border-[#bcd8dc] bg-[#e8f4f3] text-[#2f6f73]"
          : "border-[#d7e0e7] bg-[#f8fafc] text-[#657381]"
      }`}
    >
      {label}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="border border-dashed border-[#cbd5df] bg-[#f8fafc] p-4 text-sm text-[#657381]">{text}</p>;
}

async function loadRemoteChoreState(householdId: string) {
  const supabase = createBrowserSupabaseClient();
  const { data: members, error: membersError } = await supabase
    .from("household_members")
    .select("id, external_key, preferred_name, role")
    .eq("household_id", householdId)
    .eq("status", "active")
    .returns<RemoteMemberRow[]>();

  if (membersError) {
    throw membersError;
  }

  const memberExternalKeyById = new Map((members ?? []).map((member) => [member.id, member.external_key]));
  const { data: remoteChores, error: choresError } = await supabase
    .from("chores")
    .select("id, external_key, title, category_id, metadata")
    .eq("household_id", householdId)
    .eq("chore_kind", "weekly")
    .eq("status", "active")
    .returns<RemoteChoreRow[]>();

  if (choresError) {
    throw choresError;
  }

  const weeklyChores = (remoteChores ?? []).map(mapRemoteChore);
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
          .returns<RemoteAssignmentTemplateRow[]>();

  if (templatesError) {
    throw templatesError;
  }

  const templateIds = (templates ?? []).map((template) => template.id);
  const { data: templateAssignments, error: templateAssignmentsError } =
    templateIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("household_assignments")
          .select("assignable_id, household_member_id")
          .eq("household_id", householdId)
          .eq("assignable_type", "chore_assignment_template")
          .in("assignable_id", templateIds)
          .returns<RemoteAssignmentRow[]>();

  if (templateAssignmentsError) {
    throw templateAssignmentsError;
  }

  const templateAssignmentByTemplateId = new Map(
    (templateAssignments ?? []).map((assignment) => [assignment.assignable_id, assignment.household_member_id]),
  );
  const weeklyAssignmentTemplates = (templates ?? [])
    .map((template) => {
      const childId = templateAssignmentByTemplateId.get(template.id);
      const externalChildId = childId ? memberExternalKeyById.get(childId) : undefined;

      if (!externalChildId) {
        return null;
      }

      return {
        id: template.id,
        childId: externalChildId,
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
          .select("id, assignment_template_id, chore_id, occurrence_date, completed_at, completed_by_member_id")
          .eq("household_id", householdId)
          .in("assignment_template_id", templateIds)
          .returns<RemoteCompletionRow[]>();

  if (completionsError) {
    throw completionsError;
  }

  const choreCompletions: ChoreCompletion[] = (completions ?? []).flatMap((completion) => {
      const childId = completion.completed_by_member_id
        ? memberExternalKeyById.get(completion.completed_by_member_id)
        : undefined;

      if (!childId || !completion.assignment_template_id) {
        return [];
      }

      return [{
        id: completion.id,
        assignmentTemplateId: completion.assignment_template_id,
        childId,
        choreId: completion.chore_id,
        completedAt: completion.completed_at,
        completedBy: childId,
      }];
    });

  const routineChores = await loadRemoteRoutineChores(householdId, memberExternalKeyById);

  return {
    members: members ?? [],
    state: {
      routineChores,
      weeklyChores: mergeChoreSeeds(weeklyChores, warehouseSeedChores, []),
      weeklyAssignmentTemplates,
      completions: choreCompletions,
    },
  };
}

async function loadRemoteRoutineChores(
  householdId: string,
  memberExternalKeyById: Map<string, string>,
) {
  const supabase = createBrowserSupabaseClient();
  const { data: routineItems, error: routineItemsError } = await supabase
    .from("household_action_items")
    .select("id, title, days_of_week, start_time, end_time, metadata")
    .eq("household_id", householdId)
    .eq("item_kind", "routine")
    .eq("status", "active")
    .returns<RemoteRoutineActionItemRow[]>();

  if (routineItemsError) {
    throw routineItemsError;
  }

  const actionItemIds = (routineItems ?? []).map((item) => item.id);
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

  const assignmentsByItemId = new Map<string, string[]>();
  for (const assignment of assignments ?? []) {
    if (!assignment.household_member_id) {
      continue;
    }

    const externalKey = memberExternalKeyById.get(assignment.household_member_id);

    if (!externalKey) {
      continue;
    }

    assignmentsByItemId.set(assignment.assignable_id, [
      ...(assignmentsByItemId.get(assignment.assignable_id) ?? []),
      externalKey,
    ]);
  }

  const grouped = new Map<string, RoutineChore>();
  for (const item of routineItems ?? []) {
    const startTime = normalizeRemoteTime(item.start_time);
    const endTime = normalizeRemoteTime(item.end_time);
    const durationMinutes =
      normalizeDurationMinutes(item.metadata.durationMinutes) ?? getDurationMinutes(startTime, endTime);
    const offsetMinutes = normalizeOffsetMinutes(item.metadata.offsetMinutes);
    const groupKey = [
      item.metadata.stepId ?? item.title,
      item.title,
      durationMinutes ?? startTime,
      offsetMinutes ?? endTime,
      item.days_of_week.join(","),
    ].join("|");
    const existing = grouped.get(groupKey);
    const assigneeIds = assignmentsByItemId.get(item.id) ?? [];

    grouped.set(groupKey, {
      id: existing?.id ?? item.id,
      title: item.title,
      category: normalizeChoreCategory(item.metadata.category),
      defaultAssigneeIds: [...new Set([...(existing?.defaultAssigneeIds ?? []), ...assigneeIds])],
      schedule: {
        daysOfWeek: item.days_of_week,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        durationMinutes: durationMinutes ?? undefined,
        offsetMinutes: offsetMinutes ?? undefined,
      },
      countsTowardWeeklyTarget: item.metadata.countsTowardWeeklyTarget ?? false,
    });
  }

  return [...grouped.values()].sort((first, second) =>
    compareStrings(getRoutineChoreSortKey(first), getRoutineChoreSortKey(second)),
  );
}

function mapRemoteChore(chore: RemoteChoreRow): WeeklyChore {
  return {
    id: chore.id,
    externalKey: chore.external_key ?? undefined,
    title: chore.title,
    category: normalizeChoreCategory(chore.category_id),
    estimatedMinutes: chore.metadata.estimatedMinutes ?? 10,
    definitionOfDone: chore.metadata.definitionOfDone,
    eligibleAssigneeIds: chore.metadata.eligibleAssigneeIds ?? [],
    moneyTalk: chore.metadata.moneyTalk,
    requiresAdultCheck: chore.metadata.requiresAdultCheck,
    allowanceAmount: normalizeCurrencyAmount(chore.metadata.allowanceAmount),
  };
}

async function saveRemoteChore(householdId: string, chore: WeeklyChore) {
  const supabase = createBrowserSupabaseClient();
  const externalKey = chore.externalKey ?? (isUuid(chore.id) ? null : chore.id);
  const targetChoreId = isUuid(chore.id)
    ? chore.id
    : externalKey
      ? await findRemoteChoreIdByExternalKey(supabase, householdId, externalKey)
      : null;
  const row = {
    household_id: householdId,
    external_key: externalKey,
    title: chore.title,
    chore_kind: "weekly",
    status: "active",
    category_id: chore.category,
    metadata: {
      estimatedMinutes: chore.estimatedMinutes,
      definitionOfDone: chore.definitionOfDone ?? null,
      eligibleAssigneeIds: chore.eligibleAssigneeIds,
      moneyTalk: chore.moneyTalk ?? null,
      requiresAdultCheck: chore.requiresAdultCheck ?? false,
      allowanceAmount: chore.allowanceAmount ?? null,
    },
  };

  const query = targetChoreId
    ? supabase.from("chores").update(row).eq("household_id", householdId).eq("id", targetChoreId)
    : supabase.from("chores").insert(row);
  const { data, error } = await query.select("id, external_key, title, category_id, metadata").single<RemoteChoreRow>();

  if (error) {
    throw error;
  }

  return mapRemoteChore(data);
}

async function saveRemoteChoreAssignment({
  assignment,
  householdId,
  remoteMemberId,
}: {
  assignment: WeeklyChoreAssignmentTemplate;
  householdId: string;
  remoteMemberId: string;
}) {
  const supabase = createBrowserSupabaseClient();
  const row = {
    household_id: householdId,
    chore_id: assignment.choreId,
    day_of_week: assignment.dayOfWeek,
    status: "active",
    metadata: {
      startTime: assignment.startTime,
      endTime: assignment.endTime,
    },
  };
  const query = isUuid(assignment.id)
    ? supabase
        .from("chore_assignment_templates")
        .update(row)
        .eq("household_id", householdId)
        .eq("id", assignment.id)
    : supabase.from("chore_assignment_templates").insert(row);
  const { data: template, error: templateError } = await query
    .select("id, chore_id, day_of_week, metadata")
    .single<RemoteAssignmentTemplateRow>();

  if (templateError) {
    throw templateError;
  }

  const { error: deleteError } = await supabase
    .from("household_assignments")
    .delete()
    .eq("household_id", householdId)
    .eq("assignable_type", "chore_assignment_template")
    .eq("assignable_id", template.id);

  if (deleteError) {
    throw deleteError;
  }

  const { error: assignmentError } = await supabase.from("household_assignments").insert({
    household_id: householdId,
    assignable_type: "chore_assignment_template",
    assignable_id: template.id,
    assignee_type: "member",
    household_member_id: remoteMemberId,
  });

  if (assignmentError) {
    throw assignmentError;
  }

  return {
    id: template.id,
    childId: assignment.childId,
    choreId: template.chore_id,
    dayOfWeek: template.day_of_week,
    startTime: template.metadata.startTime ?? assignment.startTime,
    endTime: template.metadata.endTime ?? assignment.endTime,
  };
}

function getRemoteMemberId(remoteMembers: RemoteMemberRow[], externalKey: string) {
  const member = remoteMembers.find((candidate) => candidate.external_key === externalKey);

  if (!member) {
    throw new Error("Open Setup and save household members before assigning chores.");
  }

  return member.id;
}

function normalizeRemoteTime(value: string | null | undefined) {
  return value?.slice(0, 5) ?? "08:30";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mergeChoreSeeds(
  configuredChores: WeeklyChore[],
  seedChores: WeeklyChore[],
  childMembers: HouseholdMember[],
) {
  const childIds = childMembers.map((child) => child.id);
  const seedById = new Map(seedChores.map((chore) => [chore.id, chore]));
  const mergedConfigured = configuredChores.map((chore) => {
    const seed = seedById.get(chore.externalKey ?? chore.id);

    return {
      ...chore,
      definitionOfDone: chore.definitionOfDone ?? seed?.definitionOfDone,
      eligibleAssigneeIds:
        chore.eligibleAssigneeIds.length > 0
          ? chore.eligibleAssigneeIds
          : seed?.eligibleAssigneeIds.length
            ? seed.eligibleAssigneeIds
            : childIds,
      moneyTalk: chore.moneyTalk ?? seed?.moneyTalk,
    };
  });
  const configuredKeys = new Set(
    mergedConfigured.flatMap((chore) =>
      [chore.id, chore.externalKey].filter((value): value is string => Boolean(value)),
    ),
  );
  const normalizedSeeds = seedChores
    .filter((chore) => !configuredKeys.has(chore.id))
    .map((chore) => ({
      ...chore,
      eligibleAssigneeIds:
        chore.eligibleAssigneeIds.length > 0 ? chore.eligibleAssigneeIds : childIds,
    }));

  return [...mergedConfigured, ...normalizedSeeds];
}

async function ensureRemoteChore(
  householdId: string,
  choresById: Map<string, WeeklyChore>,
  choreId: string,
) {
  const chore = choresById.get(choreId);

  if (!chore) {
    throw new Error("Pick a valid chore before saving the assignment.");
  }

  return isUuid(chore.id) ? chore : saveRemoteChore(householdId, chore);
}

async function findRemoteChoreIdByExternalKey(
  supabase: ReturnType<typeof createBrowserSupabaseClient>,
  householdId: string,
  externalKey: string,
) {
  const { data, error } = await supabase
    .from("chores")
    .select("id")
    .eq("household_id", householdId)
    .eq("external_key", externalKey)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw error;
  }

  return data?.id ?? null;
}

function getEligibleMembersForChore(
  chore: WeeklyChore | undefined,
  members: HouseholdMember[],
  includedMemberIds: string[] = [],
) {
  const eligibleIds = new Set(
    chore?.eligibleAssigneeIds.length
      ? chore.eligibleAssigneeIds
      : members.map((member) => member.id),
  );

  for (const memberId of includedMemberIds) {
    eligibleIds.add(memberId);
  }

  return members.filter((member) => eligibleIds.has(member.id));
}

function getDurationMinutes(startTime?: string, endTime?: string) {
  if (!startTime || !endTime) {
    return null;
  }

  const startMinutes = parseTimeMinutes(startTime);
  const endMinutes = parseTimeMinutes(endTime);

  if (startMinutes === null || endMinutes === null) {
    return null;
  }

  const duration = endMinutes - startMinutes;
  return duration > 0 ? duration : null;
}

function addMinutesToTime(startTime: string, minutesToAdd: number) {
  const startMinutes = parseTimeMinutes(startTime);

  if (startMinutes === null) {
    return startTime;
  }

  const normalizedMinutes = ((startMinutes + minutesToAdd) % (24 * 60) + 24 * 60) % (24 * 60);
  const hours = String(Math.floor(normalizedMinutes / 60)).padStart(2, "0");
  const minutes = String(normalizedMinutes % 60).padStart(2, "0");

  return `${hours}:${minutes}`;
}

function parseTimeMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function createId(value: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${slugify(value)}-${crypto.randomUUID().slice(0, 8)}`;
  }

  return `${slugify(value)}-${Date.now()}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function compareStrings(first: string, second: string) {
  return first.localeCompare(second, undefined, { numeric: true, sensitivity: "base" });
}

function formatTimeRange(startTime: string, endTime: string) {
  return `${startTime}-${endTime}`;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDayOfWeekForDate(date: string): DayOfWeek {
  const dayCodes: DayOfWeek[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const [year, month, day] = date.split("-").map(Number);

  return dayCodes[new Date(year, month - 1, day).getDay()];
}
