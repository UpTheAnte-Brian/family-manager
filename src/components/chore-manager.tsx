"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ChoreCompletion,
  DayOfWeek,
  HouseholdMember,
  PlannerData,
  RoutineChore,
  WeeklyChore,
  WeeklyChoreAssignmentTemplate,
} from "@/lib/planner/types";

type ChoreState = {
  weeklyChores: WeeklyChore[];
  weeklyAssignmentTemplates: WeeklyChoreAssignmentTemplate[];
  completions: ChoreCompletion[];
};

type ChoreManagerProps = {
  chores: PlannerData["chores"];
  members: HouseholdMember[];
};

const storageKey = "family-manager:chores:v1";
const dayOptions: DayOfWeek[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export function ChoreManager({ chores, members }: ChoreManagerProps) {
  const childMembers = useMemo(
    () => members.filter((member) => member.role === "child"),
    [members],
  );
  const [state, setState] = useState<ChoreState>(() => {
    const initialState = {
      weeklyChores: chores.weeklyChores,
      weeklyAssignmentTemplates: chores.weeklyAssignmentTemplates,
      completions: chores.completions,
    };

    if (typeof window === "undefined") {
      return initialState;
    }

    const saved = window.localStorage.getItem(storageKey);

    if (!saved) {
      return initialState;
    }

    try {
      return JSON.parse(saved) as ChoreState;
    } catch {
      window.localStorage.removeItem(storageKey);
      return initialState;
    }
  });
  const [editingChoreId, setEditingChoreId] = useState<string | null>(null);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  const choresById = useMemo(
    () => new Map(state.weeklyChores.map((chore) => [chore.id, chore])),
    [state.weeklyChores],
  );

  const summaries = childMembers.map((child) => {
    const assignments = state.weeklyAssignmentTemplates
      .filter((assignment) => assignment.childId === child.id)
      .map((assignment) => ({
        ...assignment,
        chore: choresById.get(assignment.choreId),
        completions: state.completions.filter(
          (completion) => completion.assignmentTemplateId === assignment.id,
        ),
      }));

    return {
      child,
      assignedCount: assignments.length,
      completedCount: assignments.filter((assignment) => assignment.completions.length > 0).length,
      targetCount: chores.weeklyTargetPerChild,
      assignments,
    };
  });

  function logCompletion(assignment: WeeklyChoreAssignmentTemplate) {
    const completion: ChoreCompletion = {
      id: createId("completion"),
      assignmentTemplateId: assignment.id,
      childId: assignment.childId,
      choreId: assignment.choreId,
      completedAt: new Date().toISOString(),
    };

    setState((current) => ({
      ...current,
      completions: [...current.completions, completion],
    }));
  }

  function undoLatestCompletion(assignmentId: string) {
    setState((current) => {
      const latest = [...current.completions]
        .filter((completion) => completion.assignmentTemplateId === assignmentId)
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];

      if (!latest) {
        return current;
      }

      return {
        ...current,
        completions: current.completions.filter((completion) => completion.id !== latest.id),
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
    setEditingChoreId(null);
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
    setEditingAssignmentId(null);
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Chores</h2>
          <p className="text-sm text-[#6d665c]">
            Morning routines are daily; weekly chores target {chores.weeklyTargetPerChild} per kid.
          </p>
        </div>
        <p className="text-sm text-[#6d665c]">
          {state.weeklyAssignmentTemplates.length} weekly assignments
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {summaries.map((summary) => (
          <article
            className="border border-[#ded6c8] bg-[#fffaf2] p-4 shadow-sm"
            key={summary.child.id}
          >
            <header className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{summary.child.preferredName}</h3>
                <p className="text-sm text-[#6d665c]">
                  {summary.completedCount}/{summary.assignedCount} assigned chores touched
                </p>
              </div>
              <span className="border border-[#ded6c8] bg-white px-2 py-1 text-xs font-medium uppercase tracking-[0.12em] text-[#7b5f39]">
                target {summary.targetCount}
              </span>
            </header>

            <ol className="space-y-2">
              {summary.assignments.map((assignment) => (
                <WeeklyAssignmentRow
                  assignment={assignment}
                  key={assignment.id}
                  onEdit={() => setEditingAssignmentId(assignment.id)}
                  onLog={() => logCompletion(assignment)}
                  onUndo={() => undoLatestCompletion(assignment.id)}
                />
              ))}
            </ol>
          </article>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <article className="border border-[#ded6c8] bg-[#fffaf2] p-4 shadow-sm">
          <h3 className="mb-3 text-lg font-semibold">Morning Routine</h3>
          <ul className="space-y-2 text-sm">
            {chores.routineChores.map((chore) => (
              <RoutineChoreRow chore={chore} childMembers={childMembers} key={chore.id} />
            ))}
          </ul>
        </article>

        <article className="border border-[#ded6c8] bg-[#fffaf2] p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Chore Bank</h3>
            <button
              className="border border-[#7b5f39] bg-white px-3 py-1 text-sm font-medium text-[#7b5f39]"
              onClick={() => setEditingChoreId("new")}
              type="button"
            >
              Add
            </button>
          </div>
          <ul className="space-y-2 text-sm">
            {state.weeklyChores.map((chore) => (
              <li
                className="flex items-start justify-between gap-3 border-b border-[#e6ddcf] pb-2 last:border-b-0"
                key={chore.id}
              >
                <div>
                  <p className="font-medium">{chore.title}</p>
                  <p className="text-xs text-[#6d665c]">
                    {chore.category} · {chore.estimatedMinutes} min ·{" "}
                    {chore.eligibleAssigneeIds.length} kids
                  </p>
                </div>
                <button
                  className="text-sm font-medium text-[#7b5f39]"
                  onClick={() => setEditingChoreId(chore.id)}
                  type="button"
                >
                  Edit
                </button>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <article className="border border-[#ded6c8] bg-[#fffaf2] p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Weekly Assignment Slots</h3>
          <button
            className="border border-[#7b5f39] bg-white px-3 py-1 text-sm font-medium text-[#7b5f39]"
            onClick={() => setEditingAssignmentId("new")}
            type="button"
          >
            Add
          </button>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {state.weeklyAssignmentTemplates.map((assignment) => {
            const child = childMembers.find((candidate) => candidate.id === assignment.childId);
            const chore = choresById.get(assignment.choreId);

            return (
              <button
                className="border border-[#eadfce] bg-white p-3 text-left"
                key={assignment.id}
                onClick={() => setEditingAssignmentId(assignment.id)}
                type="button"
              >
                <p className="font-medium">
                  {assignment.dayOfWeek} · {child?.preferredName ?? assignment.childId}
                </p>
                <p className="text-[#6d665c]">{chore?.title ?? assignment.choreId}</p>
                <p className="text-xs text-[#6d665c]">
                  {assignment.startTime}-{assignment.endTime}
                </p>
              </button>
            );
          })}
        </div>
      </article>

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

      {editingAssignmentId ? (
        <AssignmentEditor
          assignment={
            editingAssignmentId === "new"
              ? undefined
              : state.weeklyAssignmentTemplates.find(
                  (assignment) => assignment.id === editingAssignmentId,
                )
          }
          childMembers={childMembers}
          chores={state.weeklyChores}
          onCancel={() => setEditingAssignmentId(null)}
          onSave={upsertAssignment}
        />
      ) : null}
    </section>
  );
}

function WeeklyAssignmentRow({
  assignment,
  onEdit,
  onLog,
  onUndo,
}: {
  assignment: WeeklyChoreAssignmentTemplate & {
    chore?: WeeklyChore;
    completions: ChoreCompletion[];
  };
  onEdit: () => void;
  onLog: () => void;
  onUndo: () => void;
}) {
  const latest = [...assignment.completions].sort((a, b) =>
    b.completedAt.localeCompare(a.completedAt),
  )[0];

  return (
    <li className="grid grid-cols-[52px_1fr] gap-3 border-t border-[#eadfce] pt-2 text-sm">
      <span className="font-medium text-[#7b5f39]">{assignment.dayOfWeek}</span>
      <div className="space-y-2">
        <div>
          <p>{assignment.chore?.title ?? assignment.choreId}</p>
          <p className="text-xs text-[#6d665c]">
            {assignment.startTime}-{assignment.endTime}
          </p>
          <p className="text-xs text-[#6d665c]">
            {assignment.completions.length} completed
            {latest ? ` · last ${formatDateTime(latest.completedAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="border border-[#7b5f39] bg-[#7b5f39] px-2 py-1 text-xs font-medium text-white"
            onClick={onLog}
            type="button"
          >
            Done
          </button>
          <button
            className="border border-[#cfc4b2] bg-white px-2 py-1 text-xs font-medium text-[#7b5f39]"
            onClick={onEdit}
            type="button"
          >
            Edit
          </button>
          {latest ? (
            <button
              className="border border-[#cfc4b2] bg-white px-2 py-1 text-xs font-medium text-[#7b5f39]"
              onClick={onUndo}
              type="button"
            >
              Undo
            </button>
          ) : null}
        </div>
      </div>
    </li>
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
  const [category, setCategory] = useState(chore?.category ?? "house-reset");
  const [estimatedMinutes, setEstimatedMinutes] = useState(String(chore?.estimatedMinutes ?? 10));
  const [eligibleAssigneeIds, setEligibleAssigneeIds] = useState<string[]>(
    chore?.eligibleAssigneeIds ?? childMembers.map((child) => child.id),
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
      requiresAdultCheck: chore?.requiresAdultCheck,
    });
  }

  return (
    <EditorShell onCancel={onCancel} title={chore ? "Edit Chore" : "Add Chore"}>
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Name</span>
        <input
          className="border border-[#cfc4b2] bg-white px-3 py-2"
          onChange={(event) => setTitle(event.target.value)}
          value={title}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Category</span>
          <select
            className="border border-[#cfc4b2] bg-white px-3 py-2"
            onChange={(event) => setCategory(event.target.value)}
            value={category}
          >
            <option value="house-reset">House reset</option>
            <option value="kitchen">Kitchen</option>
            <option value="pets">Pets</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Minutes</span>
          <input
            className="border border-[#cfc4b2] bg-white px-3 py-2"
            min="1"
            onChange={(event) => setEstimatedMinutes(event.target.value)}
            type="number"
            value={estimatedMinutes}
          />
        </label>
      </div>
      <fieldset className="grid gap-2 text-sm">
        <legend className="font-medium">Eligible kids</legend>
        <div className="flex flex-wrap gap-2">
          {childMembers.map((child) => (
            <label
              className="flex items-center gap-2 border border-[#e6ddcf] bg-white px-3 py-2"
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
      <EditorActions onCancel={onCancel} onSave={submit} />
    </EditorShell>
  );
}

function AssignmentEditor({
  assignment,
  childMembers,
  chores,
  onCancel,
  onSave,
}: {
  assignment?: WeeklyChoreAssignmentTemplate;
  childMembers: HouseholdMember[];
  chores: WeeklyChore[];
  onCancel: () => void;
  onSave: (assignment: WeeklyChoreAssignmentTemplate) => void;
}) {
  const [childId, setChildId] = useState(assignment?.childId ?? childMembers[0]?.id ?? "");
  const [choreId, setChoreId] = useState(assignment?.choreId ?? chores[0]?.id ?? "");
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(assignment?.dayOfWeek ?? "MO");
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
    <EditorShell onCancel={onCancel} title={assignment ? "Edit Assignment" : "Add Assignment"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Kid</span>
          <select
            className="border border-[#cfc4b2] bg-white px-3 py-2"
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
          <span className="font-medium">Chore</span>
          <select
            className="border border-[#cfc4b2] bg-white px-3 py-2"
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
          <span className="font-medium">Day</span>
          <select
            className="border border-[#cfc4b2] bg-white px-3 py-2"
            onChange={(event) => setDayOfWeek(event.target.value as DayOfWeek)}
            value={dayOfWeek}
          >
            {dayOptions.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Start</span>
          <input
            className="border border-[#cfc4b2] bg-white px-3 py-2"
            onChange={(event) => setStartTime(event.target.value)}
            type="time"
            value={startTime}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">End</span>
          <input
            className="border border-[#cfc4b2] bg-white px-3 py-2"
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
    <div className="fixed inset-0 z-50 flex items-end bg-black/30 p-4 sm:items-center sm:justify-center">
      <section className="w-full max-w-2xl border border-[#ded6c8] bg-[#fffaf2] p-4 shadow-xl">
        <header className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button className="text-sm font-medium text-[#7b5f39]" onClick={onCancel} type="button">
            Close
          </button>
        </header>
        <div className="space-y-4">{children}</div>
      </section>
    </div>
  );
}

function EditorActions({ onCancel, onSave }: { onCancel: () => void; onSave: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <button
        className="border border-[#cfc4b2] bg-white px-4 py-2 text-sm font-medium text-[#7b5f39]"
        onClick={onCancel}
        type="button"
      >
        Cancel
      </button>
      <button
        className="border border-[#7b5f39] bg-[#7b5f39] px-4 py-2 text-sm font-medium text-white"
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
    <li className="flex items-start justify-between gap-3 border-b border-[#e6ddcf] pb-2 last:border-b-0">
      <div>
        <p className="font-medium">{chore.title}</p>
        <p className="text-xs text-[#6d665c]">
          {chore.schedule.startTime}-{chore.schedule.endTime} · {assignedKids}
        </p>
      </div>
      <span className="text-xs uppercase tracking-[0.12em] text-[#7b5f39]">Daily</span>
    </li>
  );
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
