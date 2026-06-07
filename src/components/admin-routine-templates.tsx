"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import type { DayOfWeek, HouseholdMember } from "@/lib/planner/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useCurrentHousehold } from "@/lib/supabase/household";

type AdminRoutineTemplatesProps = {
  members: HouseholdMember[];
};

type RemoteHouseholdMemberRow = {
  id: string;
  external_key: string;
  preferred_name: string;
  role: string;
};

type RoutineTemplateMetadata = {
  kind?: string;
  routineTemplateId?: string;
  routineTemplateName?: string;
  stepId?: string;
  category?: string;
};

type RoutineTemplateActionItemRow = {
  id: string;
  title: string;
  days_of_week: string[];
  start_time: string | null;
  end_time: string | null;
  metadata: RoutineTemplateMetadata;
};

type RoutineTemplateAssignmentRow = {
  assignable_id: string;
  household_member_id: string | null;
};

type RoutineTemplateSummary = {
  id: string;
  name: string;
  stepCount: number;
  assignedMemberNames: string[];
  actionItemIds: string[];
};

type RoutineStepDraft = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
};

const dayOptions: DayOfWeek[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const weekdayOptions: DayOfWeek[] = ["MO", "TU", "WE", "TH", "FR"];
const defaultRoutineSteps: RoutineStepDraft[] = [
  { id: "make-bed", title: "Make bed", startTime: "08:30", endTime: "08:40" },
  { id: "brush-teeth", title: "Brush teeth", startTime: "08:40", endTime: "08:45" },
  { id: "dirty-clothes", title: "Put dirty clothes in hamper", startTime: "08:45", endTime: "08:50" },
  { id: "breakfast-dishes", title: "Clear breakfast dishes", startTime: "08:50", endTime: "09:00" },
];

export function AdminRoutineTemplates({ members }: AdminRoutineTemplatesProps) {
  const { household, status: householdStatus } = useCurrentHousehold();
  const childMembers = useMemo(() => members.filter((member) => member.role === "child"), [members]);
  const [remoteMembers, setRemoteMembers] = useState<RemoteHouseholdMemberRow[]>([]);
  const [templates, setTemplates] = useState<RoutineTemplateSummary[]>([]);
  const [templateName, setTemplateName] = useState("Morning routine");
  const [selectedMemberIds, setSelectedMemberIds] = useState(() => childMembers.map((member) => member.id));
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>(weekdayOptions);
  const [steps, setSteps] = useState<RoutineStepDraft[]>(defaultRoutineSteps);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const householdId = household?.householdId;

  useEffect(() => {
    if (!householdId || householdStatus !== "ready") {
      return;
    }

    let isActive = true;
    const currentHouseholdId = householdId;

    async function loadRoutineTemplates() {
      try {
        const nextState = await loadRemoteRoutineTemplateState(currentHouseholdId);

        if (!isActive) {
          return;
        }

        setRemoteMembers(nextState.members);
        setTemplates(nextState.templates);
        setErrorMessage("");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "Could not load routine templates.");
      }
    }

    void loadRoutineTemplates();

    return () => {
      isActive = false;
    };
  }, [householdId, householdStatus, refreshVersion]);

  async function saveRoutineTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!householdId) {
      setErrorMessage("Sign in and create a household before adding routines.");
      return;
    }

    const cleanName = templateName.trim();
    const cleanSteps = steps
      .map((step) => ({
        ...step,
        title: step.title.trim(),
      }))
      .filter((step) => step.title && step.startTime && step.endTime);

    if (!cleanName) {
      setErrorMessage("Add a template name.");
      return;
    }

    if (selectedMemberIds.length === 0) {
      setErrorMessage("Choose at least one child.");
      return;
    }

    if (selectedDays.length === 0) {
      setErrorMessage("Choose at least one day.");
      return;
    }

    if (cleanSteps.length === 0) {
      setErrorMessage("Add at least one routine step.");
      return;
    }

    const remoteMemberIdByExternalKey = new Map(
      remoteMembers.map((member) => [member.external_key, member.id]),
    );
    const missingMembers = selectedMemberIds.filter((memberId) => !remoteMemberIdByExternalKey.has(memberId));

    if (missingMembers.length > 0) {
      setErrorMessage("Open Setup and save household members before applying routines.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      await createRoutineTemplate({
        daysOfWeek: selectedDays,
        householdId,
        memberIds: selectedMemberIds.map((memberId) => remoteMemberIdByExternalKey.get(memberId)!),
        steps: cleanSteps,
        templateName: cleanName,
      });
      setStatusMessage("Routine template saved.");
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save routine template.");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeTemplate(template: RoutineTemplateSummary) {
    if (!householdId) {
      return;
    }

    setErrorMessage("");
    setStatusMessage("");

    try {
      await deleteRoutineTemplate({
        actionItemIds: template.actionItemIds,
        householdId,
      });
      setStatusMessage(`Deleted ${template.name}.`);
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not delete routine template.");
    }
  }

  function toggleMember(memberId: string) {
    setSelectedMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((candidate) => candidate !== memberId)
        : [...current, memberId],
    );
  }

  function toggleDay(day: DayOfWeek) {
    setSelectedDays((current) =>
      current.includes(day)
        ? current.filter((candidate) => candidate !== day)
        : [...current, day],
    );
  }

  function updateStep(stepId: string, patch: Partial<RoutineStepDraft>) {
    setSteps((current) =>
      current.map((step) =>
        step.id === stepId
          ? {
              ...step,
              ...patch,
            }
          : step,
      ),
    );
  }

  function addStep() {
    setSteps((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        title: "",
        startTime: "09:00",
        endTime: "09:10",
      },
    ]);
  }

  function removeStep(stepId: string) {
    setSteps((current) => (current.length === 1 ? current : current.filter((step) => step.id !== stepId)));
  }

  return (
    <section className="grid gap-4 border border-[#cbd5df] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Routine templates</h2>
          <p className="mt-1 text-sm leading-6 text-[#4c5965]">
            Create a reusable morning routine and apply those recurring steps to one or more kids.
          </p>
        </div>
        <span className="text-sm font-semibold text-[#2f6f73]">
          {templates.length} template{templates.length === 1 ? "" : "s"}
        </span>
      </div>

      {householdStatus === "ready" && householdId ? (
        <>
          <form className="grid gap-4 border border-[#d7e0e7] bg-[#f8fafc] p-3" onSubmit={saveRoutineTemplate}>
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
              <label className="grid gap-1 text-sm">
                <span className="font-semibold">Template name</span>
                <input
                  className="border border-[#d7e0e7] bg-white px-3 py-2"
                  onChange={(event) => setTemplateName(event.target.value)}
                  value={templateName}
                />
              </label>
              <fieldset className="grid gap-2">
                <legend className="text-sm font-semibold">Apply to</legend>
                <div className="flex flex-wrap gap-2">
                  {childMembers.map((member) => (
                    <label
                      className="flex items-center gap-2 border border-[#d7e0e7] bg-white px-2 py-1 text-sm font-semibold text-[#4c5965]"
                      key={member.id}
                    >
                      <input
                        checked={selectedMemberIds.includes(member.id)}
                        onChange={() => toggleMember(member.id)}
                        type="checkbox"
                      />
                      {member.preferredName}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-semibold">Days</legend>
              <div className="flex flex-wrap gap-2">
                {dayOptions.map((day) => (
                  <label
                    className="flex items-center gap-2 border border-[#d7e0e7] bg-white px-2 py-1 text-sm font-semibold text-[#4c5965]"
                    key={day}
                  >
                    <input
                      checked={selectedDays.includes(day)}
                      onChange={() => toggleDay(day)}
                      type="checkbox"
                    />
                    {day}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Steps</h3>
                <button
                  className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#1f6f8b]"
                  onClick={addStep}
                  type="button"
                >
                  Add step
                </button>
              </div>
              <div className="grid gap-2">
                {steps.map((step) => (
                  <div className="grid gap-2 md:grid-cols-[1fr_130px_130px_90px]" key={step.id}>
                    <input
                      aria-label="Step title"
                      className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm"
                      onChange={(event) => updateStep(step.id, { title: event.target.value })}
                      value={step.title}
                    />
                    <input
                      aria-label="Step start"
                      className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm"
                      onChange={(event) => updateStep(step.id, { startTime: event.target.value })}
                      type="time"
                      value={step.startTime}
                    />
                    <input
                      aria-label="Step end"
                      className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm"
                      onChange={(event) => updateStep(step.id, { endTime: event.target.value })}
                      type="time"
                      value={step.endTime}
                    />
                    <button
                      className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#4c5965]"
                      onClick={() => removeStep(step.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {errorMessage ? (
              <p className="border border-[#f2b8a0] bg-[#fff7ed] px-3 py-2 text-sm text-[#8a3b12]">
                {errorMessage}
              </p>
            ) : null}
            {statusMessage ? (
              <p className="border border-[#b7d7ce] bg-[#f0faf7] px-3 py-2 text-sm text-[#2f6f73]">
                {statusMessage}
              </p>
            ) : null}

            <div className="flex justify-end">
              <button
                className="border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving}
                type="submit"
              >
                {isSaving ? "Saving..." : "Save routine template"}
              </button>
            </div>
          </form>

          {templates.length > 0 ? (
            <ol className="grid gap-2 md:grid-cols-2">
              {templates.map((template) => (
                <li className="grid gap-2 border border-[#d7e0e7] bg-[#f8fafc] px-3 py-3" key={template.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{template.name}</p>
                      <p className="mt-1 text-xs text-[#657381]">
                        {template.stepCount} step{template.stepCount === 1 ? "" : "s"} ·{" "}
                        {template.assignedMemberNames.join(", ") || "No children"}
                      </p>
                    </div>
                    <button
                      className="border border-[#d7e0e7] bg-white px-3 py-2 text-xs font-semibold text-[#4c5965]"
                      onClick={() => void removeTemplate(template)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="border border-dashed border-[#cbd5df] bg-white px-3 py-4 text-sm text-[#4c5965]">
              No household routine templates are saved yet.
            </p>
          )}
        </>
      ) : (
        <p className="border border-dashed border-[#cbd5df] bg-[#f8fafc] px-3 py-4 text-sm text-[#4c5965]">
          Sign in and create a household before adding routine templates.{" "}
          <Link className="font-semibold text-[#1f6f8b] underline" href="/setup">
            Go to login
          </Link>
        </p>
      )}
    </section>
  );
}

async function loadRemoteRoutineTemplateState(householdId: string) {
  const supabase = createBrowserSupabaseClient();
  const { data: members, error: membersError } = await supabase
    .from("household_members")
    .select("id, external_key, preferred_name, role")
    .eq("household_id", householdId)
    .returns<RemoteHouseholdMemberRow[]>();

  if (membersError) {
    throw membersError;
  }

  const { data: actionItems, error: actionItemsError } = await supabase
    .from("household_action_items")
    .select("id, title, days_of_week, start_time, end_time, metadata")
    .eq("household_id", householdId)
    .eq("item_kind", "routine")
    .eq("status", "active")
    .eq("metadata->>kind", "routine-template-step")
    .returns<RoutineTemplateActionItemRow[]>();

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
          .returns<RoutineTemplateAssignmentRow[]>();

  if (assignmentsError) {
    throw assignmentsError;
  }

  const memberNameById = new Map((members ?? []).map((member) => [member.id, member.preferred_name]));
  const assignmentsByActionItemId = new Map<string, string[]>();

  for (const assignment of assignments ?? []) {
    if (!assignment.household_member_id) {
      continue;
    }

    assignmentsByActionItemId.set(assignment.assignable_id, [
      ...(assignmentsByActionItemId.get(assignment.assignable_id) ?? []),
      assignment.household_member_id,
    ]);
  }

  const templateGroups = new Map<
    string,
    {
      actionItemIds: Set<string>;
      assignedMemberIds: Set<string>;
      name: string;
      stepIds: Set<string>;
    }
  >();

  for (const item of actionItems ?? []) {
    const templateId = item.metadata.routineTemplateId;

    if (!templateId) {
      continue;
    }

    const group =
      templateGroups.get(templateId) ??
      {
        actionItemIds: new Set<string>(),
        assignedMemberIds: new Set<string>(),
        name: item.metadata.routineTemplateName ?? "Routine template",
        stepIds: new Set<string>(),
      };

    group.actionItemIds.add(item.id);
    group.stepIds.add(item.metadata.stepId ?? item.title);

    for (const memberId of assignmentsByActionItemId.get(item.id) ?? []) {
      group.assignedMemberIds.add(memberId);
    }

    templateGroups.set(templateId, group);
  }

  return {
    members: members ?? [],
    templates: [...templateGroups.entries()]
      .map(([id, group]) => ({
        id,
        name: group.name,
        stepCount: group.stepIds.size,
        assignedMemberNames: [...group.assignedMemberIds]
          .map((memberId) => memberNameById.get(memberId))
          .filter((name): name is string => Boolean(name))
          .sort(compareStrings),
        actionItemIds: [...group.actionItemIds],
      }))
      .sort((first, second) => compareStrings(first.name, second.name)),
  };
}

async function createRoutineTemplate({
  daysOfWeek,
  householdId,
  memberIds,
  steps,
  templateName,
}: {
  daysOfWeek: DayOfWeek[];
  householdId: string;
  memberIds: string[];
  steps: RoutineStepDraft[];
  templateName: string;
}) {
  const supabase = createBrowserSupabaseClient();
  const templateId = crypto.randomUUID();
  const rows = memberIds.flatMap((memberId) =>
    steps.map((step) => ({
      household_id: householdId,
      item_kind: "routine",
      title: step.title,
      source: "manual",
      days_of_week: daysOfWeek,
      start_time: step.startTime,
      end_time: step.endTime,
      metadata: {
        kind: "routine-template-step",
        routineTemplateId: templateId,
        routineTemplateName: templateName,
        stepId: step.id,
        assignedRemoteMemberId: memberId,
        category: "morning-routine",
      },
    })),
  );

  const { data: actionItems, error: actionItemsError } = await supabase
    .from("household_action_items")
    .insert(rows)
    .select("id, metadata")
    .returns<Array<{ id: string; metadata: { assignedRemoteMemberId?: string } }>>();

  if (actionItemsError) {
    throw actionItemsError;
  }

  const assignmentRows = (actionItems ?? []).map((item) => ({
    household_id: householdId,
    assignable_type: "action_item",
    assignable_id: item.id,
    assignee_type: "member",
    household_member_id: item.metadata.assignedRemoteMemberId,
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
}

async function deleteRoutineTemplate({
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

function compareStrings(first: string, second: string) {
  if (first < second) {
    return -1;
  }

  if (first > second) {
    return 1;
  }

  return 0;
}
