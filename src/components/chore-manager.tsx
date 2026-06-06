"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  choreCategories,
  getChoreCategoryLabel,
  normalizeChoreCategory,
  type ChoreCategoryId,
} from "@/lib/chores/categories";
import { choreStorageKey, type ChoreStorageState } from "@/lib/chores/storage";
import { useLocalStorageState } from "@/lib/storage/local";
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
    eligibleAssigneeIds: [],
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
  const initialState = useMemo<ChoreStorageState>(
    () => ({
      routineChores: chores.routineChores,
      weeklyChores: mergeChoreSeeds(chores.weeklyChores, warehouseSeedChores, childMembers),
      weeklyAssignmentTemplates: chores.weeklyAssignmentTemplates,
      completions: chores.completions,
    }),
    [
      chores.completions,
      chores.routineChores,
      chores.weeklyAssignmentTemplates,
      chores.weeklyChores,
      childMembers,
    ],
  );
  const [state, setState] = useLocalStorageState(choreStorageKey, initialState);
  const [selectedDate, setSelectedDate] = useState(() => formatDateKey(new Date()));
  const [selectedChoreId, setSelectedChoreId] = useState(
    state.weeklyChores[0]?.id ?? initialState.weeklyChores[0]?.id ?? "",
  );
  const [editingChoreId, setEditingChoreId] = useState<string | null>(null);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [assignmentModal, setAssignmentModal] = useState<
    | { mode: "add"; choreId?: string; childId?: string; dayOfWeek?: DayOfWeek }
    | { mode: "edit"; assignmentId: string }
    | null
  >(null);

  const choresById = useMemo(
    () => new Map(state.weeklyChores.map((chore) => [chore.id, chore])),
    [state.weeklyChores],
  );
  const childById = useMemo(
    () => new Map(childMembers.map((child) => [child.id, child])),
    [childMembers],
  );
  const selectedDay = getDayOfWeekForDate(selectedDate);
  const assignments = useMemo<AssignmentWithStatus[]>(
    () =>
      state.weeklyAssignmentTemplates
        .map((assignment) => {
          const completion = state.completions.find(
            (candidate) =>
              candidate.assignmentTemplateId === assignment.id &&
              candidate.childId === assignment.childId &&
              candidate.completedAt.startsWith(selectedDate),
          );

          return {
            ...assignment,
            child: childById.get(assignment.childId),
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
    [childById, choresById, selectedDate, state.completions, state.weeklyAssignmentTemplates],
  );
  const selectedChore =
    choresById.get(selectedChoreId) ?? state.weeklyChores[0] ?? initialState.weeklyChores[0];
  const selectedChoreAssignments = assignments.filter(
    (assignment) => assignment.choreId === selectedChore?.id,
  );
  const todaysAssignments = assignments.filter((assignment) => assignment.dayOfWeek === selectedDay);
  const scheduledChoreIds = new Set(state.weeklyAssignmentTemplates.map((assignment) => assignment.choreId));
  const backlogChores = state.weeklyChores.filter((chore) => !scheduledChoreIds.has(chore.id));
  const childSummaries = childMembers.map((child) => {
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

  function toggleCompletion(assignment: WeeklyChoreAssignmentTemplate) {
    setState((current) => {
      const existing = current.completions.find(
        (completion) =>
          completion.assignmentTemplateId === assignment.id &&
          completion.childId === assignment.childId &&
          completion.completedAt.startsWith(selectedDate),
      );

      if (existing) {
        return {
          ...current,
          completions: current.completions.filter((completion) => completion.id !== existing.id),
        };
      }

      return {
        ...current,
        completions: [
          ...current.completions,
          {
            id: createId(`${assignment.id}-${selectedDate}`),
            assignmentTemplateId: assignment.id,
            childId: assignment.childId,
            choreId: assignment.choreId,
            completedAt: `${selectedDate}T${assignment.endTime}:00`,
            completedBy: assignment.childId,
          },
        ],
      };
    });
  }

  function upsertChore(chore: WeeklyChore) {
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

  function upsertRoutineChore(routineChore: RoutineChore) {
    setState((current) => {
      const exists = current.routineChores.some((candidate) => candidate.id === routineChore.id);

      return {
        ...current,
        routineChores: exists
          ? current.routineChores.map((candidate) =>
              candidate.id === routineChore.id ? routineChore : candidate,
            )
          : [...current.routineChores, routineChore],
      };
    });
    setEditingRoutineId(null);
  }

  function upsertAssignment(assignment: WeeklyChoreAssignmentTemplate) {
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

  return (
    <main className="min-h-screen bg-[#eef2f6] text-[#17202a]">
      <section className="border-b border-[#cbd5df] bg-[#f8fafc]">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-5 sm:px-8 lg:px-10">
          <div className="flex flex-wrap gap-4">
            <Link className="text-sm font-semibold text-[#1f6f8b]" href="/">
              Dashboard
            </Link>
            <Link className="text-sm font-semibold text-[#1f6f8b]" href="/calendar">
              Calendar
            </Link>
            <Link className="text-sm font-semibold text-[#1f6f8b]" href="/admin">
              Admin setup
            </Link>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
                Household work board
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-normal sm:text-5xl">Chores</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-[#4c5965]">
                Schedule repeat work, keep a warehouse of productive odd jobs, and track each kid&apos;s
                completion separately even when siblings share the same chore.
              </p>
            </div>
            <label className="grid gap-1 text-sm font-semibold text-[#4c5965]">
              Date
              <input
                className="border border-[#cbd5df] bg-white px-3 py-2 text-[#17202a]"
                onChange={(event) => setSelectedDate(event.target.value)}
                type="date"
                value={selectedDate}
              />
            </label>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-5 sm:px-8 lg:px-10">
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
                {state.weeklyChores.map((chore) => (
                  <ChoreTile
                    assignments={assignments.filter((assignment) => assignment.choreId === chore.id)}
                    childMembers={childMembers}
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
                      onToggle={() => toggleCompletion(assignment)}
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
                      {selectedChore.requiresAdultCheck ? " · adult check" : ""}
                    </p>
                  </div>

                  <section className="grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
                        Kid status
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
                      {childMembers.map((child) => {
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

            <Panel
              action={
                <button
                  className="border border-[#1f6f8b] bg-[#1f6f8b] px-3 py-2 text-sm font-semibold text-white"
                  onClick={() => setEditingChoreId("new")}
                  type="button"
                >
                  Capture
                </button>
              }
              title="Warehouse"
            >
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
                <button
                  className="border border-[#1f6f8b] bg-[#1f6f8b] px-3 py-2 text-sm font-semibold text-white"
                  onClick={() => setEditingRoutineId("new")}
                  type="button"
                >
                  Add step
                </button>
              }
              title="Morning Routine"
            >
              <ul className="grid gap-2">
                {state.routineChores.map((chore) => (
                  <RoutineChoreRow
                    chore={chore}
                    childMembers={childMembers}
                    key={chore.id}
                    onEdit={() => setEditingRoutineId(chore.id)}
                  />
                ))}
              </ul>
            </Panel>
          </aside>
        </div>
      </section>

      {editingChoreId ? (
        <ChoreEditor
          chore={
            editingChoreId === "new"
              ? undefined
              : state.weeklyChores.find((chore) => chore.id === editingChoreId)
          }
          childMembers={childMembers}
          onCancel={() => setEditingChoreId(null)}
          onSave={upsertChore}
        />
      ) : null}

      {assignmentModal ? (
        <AssignmentEditor
          assignment={
            assignmentModal.mode === "edit"
              ? state.weeklyAssignmentTemplates.find(
                  (assignment) => assignment.id === assignmentModal.assignmentId,
                )
              : undefined
          }
          childMembers={childMembers}
          chores={state.weeklyChores}
          defaultChildId={assignmentModal.mode === "add" ? assignmentModal.childId : undefined}
          defaultChoreId={assignmentModal.mode === "add" ? assignmentModal.choreId : undefined}
          defaultDayOfWeek={assignmentModal.mode === "add" ? assignmentModal.dayOfWeek : undefined}
          onCancel={() => setAssignmentModal(null)}
          onSave={upsertAssignment}
        />
      ) : null}

      {editingRoutineId ? (
        <RoutineChoreEditor
          childMembers={childMembers}
          onCancel={() => setEditingRoutineId(null)}
          onSave={upsertRoutineChore}
          routineChore={
            editingRoutineId === "new"
              ? undefined
              : state.routineChores.find((chore) => chore.id === editingRoutineId)
          }
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
          {childMembers.map((child) => {
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
  const [requiresAdultCheck, setRequiresAdultCheck] = useState(Boolean(chore?.requiresAdultCheck));
  const [eligibleAssigneeIds, setEligibleAssigneeIds] = useState<string[]>(
    chore?.eligibleAssigneeIds.length ? chore.eligibleAssigneeIds : childMembers.map((child) => child.id),
  );

  function submit() {
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      return;
    }

    onSave({
      id: chore?.id ?? createId(trimmedTitle),
      title: trimmedTitle,
      category,
      estimatedMinutes: Number(estimatedMinutes) || 10,
      eligibleAssigneeIds,
      requiresAdultCheck,
    });
  }

  return (
    <EditorShell onCancel={onCancel} title={chore ? "Edit chore" : "Capture chore"}>
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
      <fieldset className="grid gap-2 text-sm">
        <legend className="font-semibold">Eligible kids</legend>
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

function RoutineChoreEditor({
  childMembers,
  onCancel,
  onSave,
  routineChore,
}: {
  childMembers: HouseholdMember[];
  onCancel: () => void;
  onSave: (routineChore: RoutineChore) => void;
  routineChore?: RoutineChore;
}) {
  const [title, setTitle] = useState(routineChore?.title ?? "");
  const [defaultAssigneeIds, setDefaultAssigneeIds] = useState<string[]>(
    routineChore?.defaultAssigneeIds ?? childMembers.map((child) => child.id),
  );
  const [daysOfWeek, setDaysOfWeek] = useState<DayOfWeek[]>(
    routineChore?.schedule.daysOfWeek ?? ["MO", "TU", "WE", "TH", "FR"],
  );
  const [startTime, setStartTime] = useState(routineChore?.schedule.startTime ?? "08:30");
  const [endTime, setEndTime] = useState(routineChore?.schedule.endTime ?? "08:40");
  const [category, setCategory] = useState<ChoreCategoryId>(
    normalizeChoreCategory(routineChore?.category),
  );
  const [countsTowardWeeklyTarget, setCountsTowardWeeklyTarget] = useState(
    routineChore?.countsTowardWeeklyTarget ?? false,
  );

  function submit() {
    const trimmedTitle = title.trim();

    if (!trimmedTitle || daysOfWeek.length === 0 || defaultAssigneeIds.length === 0) {
      return;
    }

    onSave({
      id: routineChore?.id ?? createId(`routine-${trimmedTitle}`),
      title: trimmedTitle,
      category,
      defaultAssigneeIds,
      schedule: {
        daysOfWeek,
        startTime,
        endTime,
      },
      countsTowardWeeklyTarget,
    });
  }

  function toggleDay(day: DayOfWeek) {
    setDaysOfWeek((current) =>
      current.includes(day)
        ? current.filter((candidate) => candidate !== day)
        : [...current, day],
    );
  }

  function toggleAssignee(childId: string) {
    setDefaultAssigneeIds((current) =>
      current.includes(childId)
        ? current.filter((candidate) => candidate !== childId)
        : [...current, childId],
    );
  }

  return (
    <EditorShell onCancel={onCancel} title={routineChore ? "Edit routine step" : "Add routine step"}>
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">Step</span>
        <input
          className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Make bed, pack lunch, brush hair..."
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

      <fieldset className="grid gap-2 text-sm">
        <legend className="font-semibold">Days</legend>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {dayOptions.map((day) => (
            <label
              className="flex items-center justify-center gap-2 border border-[#d7e0e7] bg-[#f8fafc] px-2 py-2 text-xs font-semibold"
              key={day}
            >
              <input checked={daysOfWeek.includes(day)} onChange={() => toggleDay(day)} type="checkbox" />
              {dayLabels[day]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-2 text-sm">
        <legend className="font-semibold">Kids</legend>
        <div className="flex flex-wrap gap-2">
          {childMembers.map((child) => (
            <label
              className="flex items-center gap-2 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
              key={child.id}
            >
              <input
                checked={defaultAssigneeIds.includes(child.id)}
                onChange={() => toggleAssignee(child.id)}
                type="checkbox"
              />
              {child.preferredName}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          checked={countsTowardWeeklyTarget}
          onChange={(event) => setCountsTowardWeeklyTarget(event.target.checked)}
          type="checkbox"
        />
        Counts toward weekly chore target
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
  const [childId, setChildId] = useState(
    assignment?.childId ?? defaultChildId ?? childMembers[0]?.id ?? "",
  );
  const [choreId, setChoreId] = useState(assignment?.choreId ?? defaultChoreId ?? chores[0]?.id ?? "");
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(
    assignment?.dayOfWeek ?? defaultDayOfWeek ?? "MO",
  );
  const [startTime, setStartTime] = useState(assignment?.startTime ?? "16:00");
  const [endTime, setEndTime] = useState(assignment?.endTime ?? "16:15");

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
          <span className="font-semibold">Kid</span>
          <select
            className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
            onChange={(event) => setChildId(event.target.value)}
            value={childId}
          >
            {childMembers.map((child) => (
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
            onChange={(event) => setChoreId(event.target.value)}
            value={choreId}
          >
            {chores.map((chore) => (
              <option key={chore.id} value={chore.id}>
                {chore.title}
              </option>
            ))}
          </select>
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
              Changes are saved in this browser for now.
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
  onEdit,
}: {
  chore: RoutineChore;
  childMembers: HouseholdMember[];
  onEdit: () => void;
}) {
  const assignedKids = chore.defaultAssigneeIds
    .map((id) => childMembers.find((child) => child.id === id)?.preferredName)
    .filter(Boolean)
    .join(", ");

  return (
    <li className="flex items-start justify-between gap-3 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm">
      <div>
        <p className="font-semibold">{chore.title}</p>
        <p className="mt-1 text-xs text-[#657381]">
          {formatTimeRange(chore.schedule.startTime, chore.schedule.endTime)} · {assignedKids}
        </p>
      </div>
      <button
        className="border border-[#d7e0e7] bg-white px-2 py-1 text-xs font-semibold text-[#1f6f8b]"
        onClick={onEdit}
        type="button"
      >
        Edit
      </button>
    </li>
  );
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

function mergeChoreSeeds(
  configuredChores: WeeklyChore[],
  seedChores: WeeklyChore[],
  childMembers: HouseholdMember[],
) {
  const configuredIds = new Set(configuredChores.map((chore) => chore.id));
  const childIds = childMembers.map((child) => child.id);
  const normalizedSeeds = seedChores
    .filter((chore) => !configuredIds.has(chore.id))
    .map((chore) => ({
      ...chore,
      eligibleAssigneeIds:
        chore.eligibleAssigneeIds.length > 0 ? chore.eligibleAssigneeIds : childIds,
    }));

  return [...configuredChores, ...normalizedSeeds];
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
