"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ChoreCompletion,
  FixedEvent,
  HouseholdMember,
  PlannedDay,
  PlannerData,
  RoutineChore,
  WeeklyChore,
  WeeklyChoreAssignmentTemplate,
} from "@/lib/planner/types";

type DashboardState = {
  selectedMemberId: string;
  routineCompletions: Record<string, boolean>;
  choreCompletions: ChoreCompletion[];
};

type ProfileDashboardProps = {
  members: HouseholdMember[];
  chores: PlannerData["chores"];
  day: PlannedDay;
  stats: {
    dayCount: number;
    fixedEventCount: number;
  };
  seasonLabel: string;
};

type AssignmentWithChore = WeeklyChoreAssignmentTemplate & {
  chore?: WeeklyChore;
};

const storageKey = "family-manager:dashboard:v1";

export function ProfileDashboard({
  chores,
  day,
  members,
  seasonLabel,
  stats,
}: ProfileDashboardProps) {
  const defaultMemberId = members[0]?.id ?? "";
  const [state, setState] = useState<DashboardState>(() => {
    const initialState = {
      selectedMemberId: defaultMemberId,
      routineCompletions: {},
      choreCompletions: chores.completions,
    };

    if (typeof window === "undefined") {
      return initialState;
    }

    const saved = window.localStorage.getItem(storageKey);

    if (!saved) {
      return initialState;
    }

    try {
      return {
        ...initialState,
        ...JSON.parse(saved),
      } as DashboardState;
    } catch {
      window.localStorage.removeItem(storageKey);
      return initialState;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state]);

  const selectedMember =
    members.find((member) => member.id === state.selectedMemberId) ?? members[0];
  const childMembers = members.filter((member) => member.role === "child");
  const choresById = useMemo(
    () => new Map(chores.weeklyChores.map((chore) => [chore.id, chore])),
    [chores.weeklyChores],
  );
  const routineItems = getRoutineItems(chores.routineChores, selectedMember, day);
  const assignments = getAssignments(chores.weeklyAssignmentTemplates, choresById, selectedMember, day);
  const events = getRelevantEvents(day.fixedEvents, selectedMember);
  const completedRoutineCount = routineItems.filter((routine) =>
    state.routineCompletions[getRoutineKey(day.date, selectedMember.id, routine.id)],
  ).length;
  const completedAssignmentCount = assignments.filter((assignment) =>
    hasCompletion(state.choreCompletions, assignment.id, day.date),
  ).length;
  const reminderItems = getReminderItems(selectedMember, events, assignments);

  function selectMember(memberId: string) {
    setState((current) => ({
      ...current,
      selectedMemberId: memberId,
    }));
  }

  function toggleRoutine(routine: RoutineChore) {
    const key = getRoutineKey(day.date, selectedMember.id, routine.id);

    setState((current) => ({
      ...current,
      routineCompletions: {
        ...current.routineCompletions,
        [key]: !current.routineCompletions[key],
      },
    }));
  }

  function toggleAssignment(assignment: AssignmentWithChore) {
    setState((current) => {
      const existing = current.choreCompletions.find(
        (completion) =>
          completion.assignmentTemplateId === assignment.id &&
          completion.completedAt.startsWith(day.date),
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
            id: createId(`${assignment.id}-${day.date}`),
            assignmentTemplateId: assignment.id,
            childId: assignment.childId,
            choreId: assignment.choreId,
            completedAt: `${day.date}T${assignment.endTime}:00`,
            completedBy: selectedMember.id,
          },
        ],
      };
    });
  }

  return (
    <main className="min-h-screen bg-[#eef2f6] text-[#17202a]">
      <section className="border-b border-[#cbd5df] bg-[#f8fafc]">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[1fr_420px] lg:px-10">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
              {seasonLabel}
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-normal sm:text-5xl">
              Household console
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-[#4c5965]">
              A shared iPad dashboard for the person standing in front of it: routines,
              schedule changes, chores, and reminders for today.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
            <Stat label="People" value={members.length} />
            <Stat label="Kids" value={childMembers.length} />
            <Stat label="Seed days" value={stats.dayCount} />
            <Stat label="Events" value={stats.fixedEventCount} />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-5 sm:px-8 lg:grid-cols-[280px_1fr] lg:px-10">
        <aside className="space-y-4">
          <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Who is here?</h2>
            <div className="mt-3 grid gap-2">
              {members.map((member) => (
                <button
                  aria-pressed={member.id === selectedMember.id}
                  className={
                    member.id === selectedMember.id
                      ? "border border-[#1f6f8b] bg-[#e4f2f6] px-3 py-3 text-left text-sm font-semibold text-[#123d4d]"
                      : "border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-left text-sm font-medium text-[#33414f]"
                  }
                  key={member.id}
                  onClick={() => selectMember(member.id)}
                  type="button"
                >
                  <span className="block">{member.preferredName}</span>
                  <span className="mt-1 block text-xs font-medium capitalize text-[#657381]">
                    {member.relationship} · {member.role}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Today</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <Fact label="Date" value={`${day.date} (${day.dayOfWeek})`} />
              <Fact label="Baseline" value={day.template.label} />
              <Fact label="Events" value={String(day.fixedEvents.length)} />
              <Fact label="Schedule blocks" value={String(day.blocks.length)} />
            </dl>
          </section>

          <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Operating Mode</h2>
            <ul className="mt-3 space-y-2 text-sm text-[#4c5965]">
              <li>Manual profile switching is active.</li>
              <li>Checklist state is saved in this browser.</li>
              <li>Supabase sync and Mac Mini service are planned next layers.</li>
            </ul>
          </section>
        </aside>

        <div className="space-y-5">
          <section className="border border-[#cbd5df] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
                  {selectedMember.role === "child" ? "Kid dashboard" : "Parent dashboard"}
                </p>
                <h2 className="mt-2 text-3xl font-semibold">{selectedMember.preferredName}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#4c5965]">
                  {getProfileSummary(selectedMember, events.length, assignments.length)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm sm:min-w-[260px]">
                <ProgressCard label="Routine" value={completedRoutineCount} total={routineItems.length} />
                <ProgressCard
                  label="Chores"
                  value={completedAssignmentCount}
                  total={assignments.length}
                />
              </div>
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
            <Panel title={selectedMember.role === "child" ? "Morning Routine" : "House Operations"}>
              {routineItems.length > 0 ? (
                <Checklist>
                  {routineItems.map((routine) => {
                    const key = getRoutineKey(day.date, selectedMember.id, routine.id);
                    const checked = Boolean(state.routineCompletions[key]);

                    return (
                      <ChecklistItem
                        checked={checked}
                        key={routine.id}
                        meta={`${routine.schedule.startTime}-${routine.schedule.endTime}`}
                        onChange={() => toggleRoutine(routine)}
                        title={routine.title}
                      />
                    );
                  })}
                </Checklist>
              ) : (
                <EmptyState text="No personal routine items are assigned yet. Use this space for parent handoffs, meal checks, and pickup decisions." />
              )}
            </Panel>

            <Panel title="Remember">
              <ul className="grid gap-2 text-sm">
                {reminderItems.map((item) => (
                  <li className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3" key={item}>
                    {item}
                  </li>
                ))}
              </ul>
            </Panel>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
            <Panel title="Today Schedule">
              {events.length > 0 ? (
                <ol className="grid gap-2">
                  {events.map((event) => (
                    <EventRow event={event} key={event.id} />
                  ))}
                </ol>
              ) : (
                <EmptyState text="No fixed calendar events are attached to this profile today." />
              )}
            </Panel>

            <Panel title="Responsibilities">
              {assignments.length > 0 ? (
                <Checklist>
                  {assignments.map((assignment) => {
                    const checked = hasCompletion(state.choreCompletions, assignment.id, day.date);

                    return (
                      <ChecklistItem
                        checked={checked}
                        key={assignment.id}
                        meta={`${assignment.startTime}-${assignment.endTime}`}
                        onChange={() => toggleAssignment(assignment)}
                        title={assignment.chore?.title ?? assignment.choreId}
                      />
                    );
                  })}
                </Checklist>
              ) : (
                <EmptyState text="No weekly chore assignment is scheduled for this profile today." />
              )}
            </Panel>
          </section>

          <Panel title="Baseline Flow">
            <ol className="grid gap-2 md:grid-cols-2">
              {day.blocks.slice(0, 8).map((block) => (
                <li
                  className="grid gap-1 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm"
                  key={block.id}
                >
                  <span className="font-semibold text-[#17202a]">{block.title}</span>
                  <span className="text-[#657381]">
                    {block.startTime}-{block.endTime} · {block.noiseLevel}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </section>
    </main>
  );
}

function getRoutineItems(
  routines: RoutineChore[],
  member: HouseholdMember,
  day: PlannedDay,
) {
  if (member.role !== "child") {
    return [];
  }

  return routines.filter(
    (routine) =>
      routine.defaultAssigneeIds.includes(member.id) &&
      routine.schedule.daysOfWeek.includes(day.dayOfWeek),
  );
}

function getAssignments(
  assignments: WeeklyChoreAssignmentTemplate[],
  choresById: Map<string, WeeklyChore>,
  member: HouseholdMember,
  day: PlannedDay,
): AssignmentWithChore[] {
  if (member.role !== "child") {
    return [];
  }

  return assignments
    .filter((assignment) => assignment.childId === member.id && assignment.dayOfWeek === day.dayOfWeek)
    .map((assignment) => ({
      ...assignment,
      chore: choresById.get(assignment.choreId),
    }));
}

function getRelevantEvents(events: FixedEvent[], member: HouseholdMember) {
  if (member.role === "parent") {
    return events;
  }

  const name = member.preferredName.toLowerCase();

  return events.filter((event) => {
    const title = event.title.toLowerCase();

    return (
      title.includes(name) ||
      event.category === "sports" ||
      event.category === "school-camp" ||
      event.source === "sportsengine-calendar"
    );
  });
}

function getReminderItems(
  member: HouseholdMember,
  events: FixedEvent[],
  assignments: AssignmentWithChore[],
) {
  const sportsToday = events.some((event) => event.category === "sports");

  if (member.role === "child") {
    return [
      "Check backpack, shoes, and water bottle before leaving.",
      sportsToday ? "Sports gear may be needed today." : "No sports gear is flagged from the seed calendar.",
      assignments.length > 0
        ? "One house responsibility is scheduled today."
        : "No weekly chore is scheduled today.",
    ];
  }

  return [
    "Review pickup, meal, and activity coverage for the day.",
    events.length > 0 ? "Calendar imports have fixed events today." : "No fixed calendar events in seed data today.",
    "Supabase sync, Mac Mini jobs, and identity recognition are future phases.",
  ];
}

function getProfileSummary(member: HouseholdMember, eventCount: number, assignmentCount: number) {
  if (member.role === "child") {
    return `${member.preferredName}'s view filters the house plan down to morning steps, today-specific reminders, ${eventCount} relevant calendar item${eventCount === 1 ? "" : "s"}, and ${assignmentCount} chore assignment${assignmentCount === 1 ? "" : "s"}.`;
  }

  return `${member.preferredName}'s view focuses on household coordination: ${eventCount} fixed calendar item${eventCount === 1 ? "" : "s"}, operating context, and the current local-first roadmap.`;
}

function hasCompletion(completions: ChoreCompletion[], assignmentId: string, date: string) {
  return completions.some(
    (completion) =>
      completion.assignmentTemplateId === assignmentId && completion.completedAt.startsWith(date),
  );
}

function getRoutineKey(date: string, memberId: string, routineId: string) {
  return `${date}:${memberId}:${routineId}`;
}

function createId(seed: string) {
  return seed
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-[#cbd5df] bg-white px-4 py-3 shadow-sm">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">{label}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold text-[#17202a]">{label}</dt>
      <dd className="mt-1 text-[#4c5965]">{value}</dd>
    </div>
  );
}

function ProgressCard({ label, total, value }: { label: string; total: number; value: number }) {
  return (
    <div className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3">
      <p className="text-2xl font-semibold">
        {value}/{total}
      </p>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">{label}</p>
    </div>
  );
}

function Panel({ children, title }: Readonly<{ children: React.ReactNode; title: string }>) {
  return (
    <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Checklist({ children }: Readonly<{ children: React.ReactNode }>) {
  return <ul className="grid gap-2">{children}</ul>;
}

function ChecklistItem({
  checked,
  meta,
  onChange,
  title,
}: {
  checked: boolean;
  meta: string;
  onChange: () => void;
  title: string;
}) {
  return (
    <li>
      <label className="grid cursor-pointer grid-cols-[24px_1fr] gap-3 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm">
        <input checked={checked} className="mt-1 h-4 w-4" onChange={onChange} type="checkbox" />
        <span>
          <span className={checked ? "block font-semibold text-[#657381] line-through" : "block font-semibold"}>
            {title}
          </span>
          <span className="mt-1 block text-xs text-[#657381]">{meta}</span>
        </span>
      </label>
    </li>
  );
}

function EventRow({ event }: { event: FixedEvent }) {
  return (
    <li className="grid gap-2 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3 text-sm sm:grid-cols-[120px_1fr_80px]">
      <time className="font-semibold text-[#1f6f8b]">
        {event.startTime}-{event.endTime}
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

function EmptyState({ text }: { text: string }) {
  return <p className="border border-dashed border-[#cbd5df] bg-[#f8fafc] px-3 py-4 text-sm text-[#4c5965]">{text}</p>;
}
