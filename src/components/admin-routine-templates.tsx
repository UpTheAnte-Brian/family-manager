"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import {
  getRoutineTemplateCategoryLabel,
  resolveRoutineTemplateCategory,
  routineTemplateCategoryOptions,
  type RoutineTemplateCategory,
} from "@/lib/routines/categories";
import { starterMorningRoutineTemplate } from "@/lib/routines/defaults";
import {
  planRoutineTemplateSync,
  type ExistingRoutineTemplateStepInstance,
  type PlannedRoutineTemplateStepInstance,
  type RoutineTemplateStepDraft as RoutineStepDraft,
} from "@/lib/routines/template-sync";
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
  assignedRemoteMemberId?: string;
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
  category: RoutineTemplateCategory;
  id: string;
  name: string;
  stepCount: number;
  assignedMemberIds: string[];
  assignedMemberNames: string[];
  actionItemIds: string[];
  daysOfWeek: DayOfWeek[];
  steps: RoutineStepDraft[];
};

const dayOptions: DayOfWeek[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const defaultRoutineSteps: RoutineStepDraft[] = starterMorningRoutineTemplate.steps;
const defaultRoutineCategory: RoutineTemplateCategory = "morning-routine";

export function AdminRoutineTemplates({ members }: AdminRoutineTemplatesProps) {
  const { household, status: householdStatus } = useCurrentHousehold();
  const childMembers = useMemo(() => members.filter((member) => member.role === "child"), [members]);
  const [remoteMembers, setRemoteMembers] = useState<RemoteHouseholdMemberRow[]>([]);
  const [templates, setTemplates] = useState<RoutineTemplateSummary[]>([]);
  const [templateName, setTemplateName] = useState(starterMorningRoutineTemplate.name);
  const [selectedMemberIds, setSelectedMemberIds] = useState(() => childMembers.map((member) => member.id));
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>(dayOptions);
  const [selectedCategory, setSelectedCategory] = useState<RoutineTemplateCategory>(defaultRoutineCategory);
  const [steps, setSteps] = useState<RoutineStepDraft[]>(defaultRoutineSteps);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const householdId = household?.householdId;
  const editingTemplate = editingTemplateId
    ? templates.find((template) => template.id === editingTemplateId)
    : undefined;

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
      const remoteMemberIds = selectedMemberIds.map((memberId) => remoteMemberIdByExternalKey.get(memberId)!);

      if (editingTemplate) {
        await updateRoutineTemplate({
          actionItemIds: editingTemplate.actionItemIds,
          category: selectedCategory,
          daysOfWeek: selectedDays,
          householdId,
          memberIds: remoteMemberIds,
          steps: cleanSteps,
          templateId: editingTemplate.id,
          templateName: cleanName,
        });
        setStatusMessage(`Updated ${cleanName}.`);
      } else {
        await createRoutineTemplate({
          category: selectedCategory,
          daysOfWeek: selectedDays,
          householdId,
          memberIds: remoteMemberIds,
          steps: cleanSteps,
          templateName: cleanName,
        });
        setStatusMessage("Routine template saved.");
      }

      resetRoutineTemplateForm();
      setEditorMode(null);
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
      if (editingTemplateId === template.id) {
        resetRoutineTemplateForm();
      }
      setStatusMessage(`Deleted ${template.name}.`);
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not delete routine template.");
    }
  }

  function editTemplate(template: RoutineTemplateSummary) {
    setEditingTemplateId(template.id);
    setTemplateName(template.name);
    setSelectedMemberIds(template.assignedMemberIds);
    setSelectedDays(template.daysOfWeek.length > 0 ? template.daysOfWeek : dayOptions);
    setSelectedCategory(template.category);
    setSteps(template.steps.length > 0 ? template.steps.map((step) => ({ ...step })) : defaultRoutineSteps);
    setEditorMode("edit");
    setErrorMessage("");
    setStatusMessage("");
  }

  function createTemplate() {
    resetRoutineTemplateForm();
    setEditorMode("create");
    setErrorMessage("");
    setStatusMessage("");
  }

  function closeEditor() {
    resetRoutineTemplateForm();
    setEditorMode(null);
    setErrorMessage("");
  }

  function resetRoutineTemplateForm() {
    setEditingTemplateId(null);
    setTemplateName(starterMorningRoutineTemplate.name);
    setSelectedMemberIds(childMembers.map((member) => member.id));
    setSelectedDays(dayOptions);
    setSelectedCategory(defaultRoutineCategory);
    setSteps(defaultRoutineSteps.map((step) => ({ ...step })));
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
            Create reusable routine templates and apply those recurring steps to one or more kids.
          </p>
        </div>
        <span className="text-sm font-semibold text-[#2f6f73]">
          {templates.length} template{templates.length === 1 ? "" : "s"}
        </span>
      </div>

      {householdStatus === "ready" && householdId ? (
        <>
          <div className="grid gap-4">
            <div className="flex flex-col gap-3 rounded-sm border border-[#d7e0e7] bg-[#f8fafc] p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
                    Source of truth
                  </p>
                  <p className="mt-2 text-sm text-[#4c5965]">
                    Saved routine templates are the recurring routine steps the dashboard loads for
                    matching selected days and assigned kids. Editing a template updates those recurring
                    steps directly instead of creating a separate copy.
                  </p>
                </div>
                <button
                  className="border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white"
                  onClick={createTemplate}
                  type="button"
                >
                  Create routine template
                </button>
              </div>
            </div>

            {errorMessage && !editorMode ? (
              <p className="border border-[#f2b8a0] bg-[#fff7ed] px-3 py-2 text-sm text-[#8a3b12]">
                {errorMessage}
              </p>
            ) : null}
            {statusMessage && !editorMode ? (
              <p className="border border-[#b7d7ce] bg-[#f0faf7] px-3 py-2 text-sm text-[#2f6f73]">
                {statusMessage}
              </p>
            ) : null}

            {templates.length > 0 ? (
              <ol className="grid gap-3 md:grid-cols-2">
                {templates.map((template) => (
                  <li
                    className="grid gap-3 border border-[#d7e0e7] bg-[#f8fafc] p-4"
                    key={template.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#17202a]">{template.name}</p>
                        <p className="mt-1 text-sm text-[#657381]">
                          {template.stepCount} step{template.stepCount === 1 ? "" : "s"} ·{" "}
                          {template.assignedMemberNames.join(", ") || "No children"} ·{" "}
                          {getRoutineTemplateCategoryLabel(template.category)}
                        </p>
                        <p className="mt-1 text-sm text-[#657381]">
                          {template.daysOfWeek.join(", ")}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#1f6f8b]"
                          onClick={() => editTemplate(template)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#4c5965]"
                          onClick={() => void removeTemplate(template)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <ol className="grid gap-2">
                      {template.steps.map((step) => (
                        <li
                          className="grid gap-1 border border-[#d7e0e7] bg-white px-3 py-3 text-sm"
                          key={step.id}
                        >
                          <span className="font-semibold text-[#17202a]">{step.title}</span>
                          <span className="text-[#657381]">
                            {formatTimeRange(step.startTime, step.endTime)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="border border-dashed border-[#cbd5df] bg-white px-3 py-4 text-sm text-[#4c5965]">
                No household routine templates are saved yet.
              </p>
            )}

            {editorMode ? (
              <div
                aria-modal="true"
                className="fixed inset-0 z-50 overflow-y-auto bg-[#17202a]/45 px-4 py-6"
                role="dialog"
              >
                <div className="mx-auto flex max-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col overflow-hidden border border-[#cbd5df] bg-white shadow-xl">
                  <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#d7e0e7] px-5 py-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
                        {editorMode === "edit" ? "Editing Existing Template" : "Creating New Template"}
                      </p>
                      <h3 className="mt-1 text-xl font-semibold text-[#17202a]">
                        {editorMode === "edit" ? "Edit routine template" : "Create routine template"}
                      </h3>
                      <p className="mt-1 max-w-3xl text-sm text-[#4c5965]">
                        {editorMode === "edit"
                          ? "Changes here update the recurring routine steps already assigned through this template."
                          : "Build a reusable routine, then assign those recurring steps to one or more kids."}
                      </p>
                    </div>
                    <button
                      className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2 text-sm font-semibold"
                      onClick={closeEditor}
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
                    {statusMessage ? (
                      <p className="mb-4 border border-[#b7d7ce] bg-[#f0faf7] px-3 py-2 text-sm text-[#2f6f73]">
                        {statusMessage}
                      </p>
                    ) : null}

                    <form className="grid gap-4" onSubmit={saveRoutineTemplate}>
                      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
                        <label className="grid gap-1 text-sm">
                          <span className="font-semibold">Template name</span>
                          <input
                            className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                            onChange={(event) => setTemplateName(event.target.value)}
                            value={templateName}
                          />
                        </label>
                        <fieldset className="grid gap-2">
                          <legend className="text-sm font-semibold">Apply to</legend>
                          <div className="flex flex-wrap gap-2">
                            {childMembers.map((member) => (
                              <label
                                className="flex items-center gap-2 border border-[#d7e0e7] bg-[#f8fafc] px-2 py-1 text-sm font-semibold text-[#4c5965]"
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
                        <legend className="text-sm font-semibold">Routine bucket</legend>
                        <div className="flex flex-wrap gap-2">
                          {routineTemplateCategoryOptions.map((category) => (
                            <label
                              className="flex items-center gap-2 border border-[#d7e0e7] bg-[#f8fafc] px-2 py-1 text-sm font-semibold text-[#4c5965]"
                              key={category}
                            >
                              <input
                                checked={selectedCategory === category}
                                onChange={() => setSelectedCategory(category)}
                                type="radio"
                              />
                              {getRoutineTemplateCategoryLabel(category)}
                            </label>
                          ))}
                        </div>
                        <p className="text-xs text-[#657381]">
                          {selectedCategory === "morning-routine"
                            ? "Morning routines can trigger the per-day child credit configured in Setup."
                            : "Night routines stay separate on the dashboard and do not affect the morning credit."}
                        </p>
                      </fieldset>

                      <fieldset className="grid gap-2">
                        <legend className="text-sm font-semibold">Days</legend>
                        <div className="flex flex-wrap gap-2">
                          {dayOptions.map((day) => (
                            <label
                              className="flex items-center gap-2 border border-[#d7e0e7] bg-[#f8fafc] px-2 py-1 text-sm font-semibold text-[#4c5965]"
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
                          <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
                            Steps
                          </h4>
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

                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold"
                          onClick={closeEditor}
                          type="button"
                        >
                          Cancel
                        </button>
                        <button
                          className="border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isSaving}
                          type="submit"
                        >
                          {isSaving
                            ? "Saving..."
                            : editorMode === "edit"
                              ? "Update routine template"
                              : "Save routine template"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
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
    .eq("status", "active")
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
  const memberExternalKeyById = new Map((members ?? []).map((member) => [member.id, member.external_key]));
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
      category: RoutineTemplateCategory;
      daysOfWeek: Set<DayOfWeek>;
      name: string;
      stepsById: Map<string, RoutineStepDraft>;
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
        category: resolveRoutineTemplateCategory({
          category: item.metadata.category,
          endTime: item.end_time,
          startTime: item.start_time,
          templateName: item.metadata.routineTemplateName,
          title: item.title,
        }),
        daysOfWeek: new Set<DayOfWeek>(),
        name: item.metadata.routineTemplateName ?? "Routine template",
        stepsById: new Map<string, RoutineStepDraft>(),
      };

    group.actionItemIds.add(item.id);

    for (const day of normalizeDaysOfWeek(item.days_of_week)) {
      group.daysOfWeek.add(day);
    }

    const stepId = item.metadata.stepId ?? `${item.title}-${item.start_time ?? ""}-${item.end_time ?? ""}`;
    if (!group.stepsById.has(stepId)) {
      group.stepsById.set(stepId, {
        id: stepId,
        title: item.title,
        startTime: normalizeTimeForInput(item.start_time),
        endTime: normalizeTimeForInput(item.end_time),
      });
    }

    if (
      resolveRoutineTemplateCategory({
        category: item.metadata.category,
        endTime: item.end_time,
        startTime: item.start_time,
        templateName: item.metadata.routineTemplateName,
        title: item.title,
      }) === "night-routine"
    ) {
      group.category = "night-routine";
    }

    for (const memberId of assignmentsByActionItemId.get(item.id) ?? []) {
      group.assignedMemberIds.add(memberId);
    }

    templateGroups.set(templateId, group);
  }

  return {
    members: members ?? [],
    templates: [...templateGroups.entries()]
      .map(([id, group]) => ({
        category: group.category,
        id,
        name: group.name,
        stepCount: group.stepsById.size,
        assignedMemberIds: [...group.assignedMemberIds]
          .map((memberId) => memberExternalKeyById.get(memberId))
          .filter((externalKey): externalKey is string => Boolean(externalKey))
          .sort(compareStrings),
        assignedMemberNames: [...group.assignedMemberIds]
          .map((memberId) => memberNameById.get(memberId))
          .filter((name): name is string => Boolean(name))
          .sort(compareStrings),
        actionItemIds: [...group.actionItemIds],
        daysOfWeek: [...group.daysOfWeek],
        steps: [...group.stepsById.values()].sort(compareRoutineSteps),
      }))
      .sort((first, second) => compareStrings(first.name, second.name)),
  };
}

async function createRoutineTemplate({
  category,
  daysOfWeek,
  householdId,
  memberIds,
  steps,
  templateId = crypto.randomUUID(),
  templateName,
}: {
  category: RoutineTemplateCategory;
  daysOfWeek: DayOfWeek[];
  householdId: string;
  memberIds: string[];
  steps: RoutineStepDraft[];
  templateId?: string;
  templateName: string;
}) {
  await createRoutineTemplateActionItems({
    entries: memberIds.flatMap((memberId) =>
      steps.map((step) => ({
        category,
        daysOfWeek,
        endTime: step.endTime,
        memberId,
        startTime: step.startTime,
        stepId: step.id,
        templateName,
        title: step.title,
      })),
    ),
    householdId,
    templateId,
  });
}

async function createRoutineTemplateActionItems({
  entries,
  householdId,
  templateId,
}: {
  entries: PlannedRoutineTemplateStepInstance[];
  householdId: string;
  templateId: string;
}) {
  if (entries.length === 0) {
    return;
  }

  const supabase = createBrowserSupabaseClient();
  const rows = entries.map((entry) => ({
    household_id: householdId,
    item_kind: "routine",
    title: entry.title,
    source: "manual",
    days_of_week: entry.daysOfWeek,
    start_time: entry.startTime,
    end_time: entry.endTime,
    metadata: {
      kind: "routine-template-step",
      routineTemplateId: templateId,
      routineTemplateName: entry.templateName,
      stepId: entry.stepId,
      assignedRemoteMemberId: entry.memberId,
      category: entry.category,
    },
  }));

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

async function updateRoutineTemplate({
  actionItemIds,
  category,
  daysOfWeek,
  householdId,
  memberIds,
  steps,
  templateId,
  templateName,
}: {
  actionItemIds: string[];
  category: RoutineTemplateCategory;
  daysOfWeek: DayOfWeek[];
  householdId: string;
  memberIds: string[];
  steps: RoutineStepDraft[];
  templateId: string;
  templateName: string;
}) {
  const supabase = createBrowserSupabaseClient();
  const { data: actionItems, error: actionItemsError } = await supabase
    .from("household_action_items")
    .select("id, title, days_of_week, start_time, end_time, metadata")
    .eq("household_id", householdId)
    .in("id", actionItemIds)
    .returns<RoutineTemplateActionItemRow[]>();

  if (actionItemsError) {
    throw actionItemsError;
  }

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

  const memberIdByActionItemId = new Map(
    (assignments ?? [])
      .filter((assignment) => assignment.household_member_id)
      .map((assignment) => [assignment.assignable_id, assignment.household_member_id!]),
  );
  const existing = (actionItems ?? []).flatMap((item) => {
    const memberId = item.metadata.assignedRemoteMemberId ?? memberIdByActionItemId.get(item.id);
    const stepId = item.metadata.stepId;

    if (!memberId || !stepId) {
      return [];
    }

    return [
      {
        actionItemId: item.id,
        category: resolveRoutineTemplateCategory({
          category: item.metadata.category,
          endTime: item.end_time,
          startTime: item.start_time,
          templateName: item.metadata.routineTemplateName,
          title: item.title,
        }),
        daysOfWeek: normalizeDaysOfWeek(item.days_of_week),
        endTime: normalizeTimeForInput(item.end_time),
        memberId,
        startTime: normalizeTimeForInput(item.start_time),
        stepId,
        templateName: item.metadata.routineTemplateName ?? templateName,
        title: item.title,
      } satisfies ExistingRoutineTemplateStepInstance,
    ];
  });
  const syncPlan = planRoutineTemplateSync({
    category,
    daysOfWeek,
    existing,
    memberIds,
    steps,
    templateName,
  });

  for (const item of syncPlan.update) {
    const { error } = await supabase
      .from("household_action_items")
      .update({
        title: item.title,
        days_of_week: item.daysOfWeek,
        start_time: item.startTime,
        end_time: item.endTime,
        metadata: {
          kind: "routine-template-step",
          routineTemplateId: templateId,
          routineTemplateName: item.templateName,
          stepId: item.stepId,
          assignedRemoteMemberId: item.memberId,
          category: item.category,
        },
      })
      .eq("household_id", householdId)
      .eq("id", item.actionItemId);

    if (error) {
      throw error;
    }
  }

  await createRoutineTemplateActionItems({
    entries: syncPlan.create,
    householdId,
    templateId,
  });

  await deleteRoutineTemplate({
    actionItemIds: syncPlan.removeActionItemIds,
    householdId,
  });
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

function compareRoutineSteps(first: RoutineStepDraft, second: RoutineStepDraft) {
  const startComparison = compareStrings(first.startTime, second.startTime);

  if (startComparison !== 0) {
    return startComparison;
  }

  return compareStrings(first.title, second.title);
}

function normalizeDaysOfWeek(daysOfWeek: string[] | null | undefined): DayOfWeek[] {
  return dayOptions.filter((day) => daysOfWeek?.includes(day));
}

function normalizeTimeForInput(value: string | null) {
  return value?.slice(0, 5) ?? "";
}

function formatTimeRange(startTime: string, endTime: string) {
  return `${formatClockTime(startTime)}-${formatClockTime(endTime)}`;
}

function formatClockTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const normalizedHours = hours % 12 || 12;

  return `${normalizedHours}:${String(minutes).padStart(2, "0")} ${suffix}`;
}
