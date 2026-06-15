"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import type { DayOfWeek, DayTemplate, NoiseLevel, ScheduleBlock } from "@/lib/planner/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { useCurrentHousehold } from "@/lib/supabase/household";

type AdminBaselineTemplatesProps = {
  defaultTemplates: DayTemplate[];
};

type BaselineTemplateMetadata = {
  baselineTemplateId?: string;
  baselineTemplateName?: string;
  category?: string;
  kind?: string;
  location?: ScheduleBlock["location"];
  noiseLevel?: NoiseLevel;
  startsOn?: string;
  stepId?: string;
  endsOn?: string;
};

type BaselineTemplateActionItemRow = {
  id: string;
  title: string;
  days_of_week: string[];
  start_time: string | null;
  end_time: string | null;
  metadata: BaselineTemplateMetadata;
};

type BaselineBlockDraft = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  category: string;
  noiseLevel: NoiseLevel;
  location: ScheduleBlock["location"];
};

type BaselineTemplateSummary = {
  id: string;
  actionItemIds: string[];
  blocks: BaselineBlockDraft[];
  daysOfWeek: DayOfWeek[];
  endsOn: string;
  name: string;
  startsOn: string;
};

const dayOptions: DayOfWeek[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const noiseLevelOptions: NoiseLevel[] = ["low", "medium", "high", "variable"];
const locationOptions: ScheduleBlock["location"][] = ["home", "home-or-away", "away"];

export function AdminBaselineTemplates({ defaultTemplates }: AdminBaselineTemplatesProps) {
  const { household, status: householdStatus } = useCurrentHousehold();
  const starterTemplate = useMemo(() => getStarterTemplate(defaultTemplates), [defaultTemplates]);
  const [templates, setTemplates] = useState<BaselineTemplateSummary[]>([]);
  const [templateName, setTemplateName] = useState(starterTemplate.label);
  const [startsOn, setStartsOn] = useState(starterTemplate.appliesTo.dateRange.startsOn);
  const [endsOn, setEndsOn] = useState(starterTemplate.appliesTo.dateRange.endsOn);
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>(starterTemplate.appliesTo.daysOfWeek);
  const [blocks, setBlocks] = useState<BaselineBlockDraft[]>(
    starterTemplate.blocks.map(mapBlockToDraft),
  );
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
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

    async function loadTemplates() {
      try {
        const nextTemplates = await loadRemoteBaselineTemplateState(currentHouseholdId);

        if (!isActive) {
          return;
        }

        setTemplates(nextTemplates);
        setErrorMessage("");
      } catch (error) {
        if (!isActive) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "Could not load baseline templates.",
        );
      }
    }

    void loadTemplates();

    return () => {
      isActive = false;
    };
  }, [householdId, householdStatus, refreshVersion]);

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!householdId) {
      setErrorMessage("Sign in and create a household before adding baseline flows.");
      return;
    }

    const cleanName = templateName.trim();
    const cleanBlocks = blocks
      .map((block) => ({
        ...block,
        title: block.title.trim(),
      }))
      .filter((block) => block.title && block.startTime && block.endTime);

    if (!cleanName) {
      setErrorMessage("Add a baseline template name.");
      return;
    }

    if (!startsOn || !endsOn || startsOn > endsOn) {
      setErrorMessage("Choose a valid date range.");
      return;
    }

    if (selectedDays.length === 0) {
      setErrorMessage("Choose at least one day.");
      return;
    }

    if (cleanBlocks.length === 0) {
      setErrorMessage("Add at least one baseline block.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      if (editingTemplate) {
        await updateBaselineTemplate({
          actionItemIds: editingTemplate.actionItemIds,
          blocks: cleanBlocks,
          daysOfWeek: selectedDays,
          endsOn,
          householdId,
          startsOn,
          templateId: editingTemplate.id,
          templateName: cleanName,
        });
        setStatusMessage(`Updated ${cleanName}.`);
      } else {
        await createBaselineTemplate({
          blocks: cleanBlocks,
          daysOfWeek: selectedDays,
          endsOn,
          householdId,
          startsOn,
          templateName: cleanName,
        });
        setStatusMessage("Baseline flow saved.");
      }

      resetTemplateForm();
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save baseline template.");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeTemplate(template: BaselineTemplateSummary) {
    if (!householdId) {
      return;
    }

    setErrorMessage("");
    setStatusMessage("");

    try {
      await deleteBaselineTemplate({
        actionItemIds: template.actionItemIds,
        householdId,
      });

      if (editingTemplateId === template.id) {
        resetTemplateForm();
      }

      setStatusMessage(`Deleted ${template.name}.`);
      setRefreshVersion((current) => current + 1);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not delete baseline template.",
      );
    }
  }

  function editTemplate(template: BaselineTemplateSummary) {
    setEditingTemplateId(template.id);
    setTemplateName(template.name);
    setStartsOn(template.startsOn);
    setEndsOn(template.endsOn);
    setSelectedDays(template.daysOfWeek);
    setBlocks(template.blocks.map((block) => ({ ...block })));
    setErrorMessage("");
    setStatusMessage(`Editing ${template.name}.`);
  }

  function resetTemplateForm() {
    setEditingTemplateId(null);
    setTemplateName(starterTemplate.label);
    setStartsOn(starterTemplate.appliesTo.dateRange.startsOn);
    setEndsOn(starterTemplate.appliesTo.dateRange.endsOn);
    setSelectedDays(starterTemplate.appliesTo.daysOfWeek);
    setBlocks(starterTemplate.blocks.map(mapBlockToDraft));
  }

  function toggleDay(day: DayOfWeek) {
    setSelectedDays((current) =>
      current.includes(day)
        ? current.filter((candidate) => candidate !== day)
        : [...current, day],
    );
  }

  function updateBlock(blockId: string, patch: Partial<BaselineBlockDraft>) {
    setBlocks((current) =>
      current.map((block) => (block.id === blockId ? { ...block, ...patch } : block)),
    );
  }

  function addBlock() {
    setBlocks((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        title: "",
        startTime: "08:00",
        endTime: "08:30",
        category: "personal",
        noiseLevel: "medium",
        location: "home",
      },
    ]);
  }

  function removeBlock(blockId: string) {
    setBlocks((current) => current.filter((block) => block.id !== blockId));
  }

  return (
    <section className="border border-[#cbd5df] bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-[#d7e0e7] pb-4">
        <h2 className="text-xl font-semibold">Baseline flows</h2>
        <p className="text-sm text-[#4c5965]">
          Save reusable day-flow templates in Supabase so the dashboard can load them on any
          device.
        </p>
      </div>

      {householdId && householdStatus === "ready" ? (
        <>
          <form className="mt-4 grid gap-4" onSubmit={saveTemplate}>
            <div className="grid gap-3 lg:grid-cols-[1fr_170px_170px]">
              <label className="grid gap-1 text-sm">
                <span className="font-semibold">Template</span>
                <input
                  className="border border-[#d7e0e7] bg-[#f8fafc] px-3 py-2"
                  onChange={(event) => setTemplateName(event.target.value)}
                  value={templateName}
                />
              </label>
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
              <legend className="font-semibold">Days</legend>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {dayOptions.map((day) => (
                  <label
                    className="flex items-center justify-center gap-2 border border-[#d7e0e7] bg-[#f8fafc] px-2 py-2 text-xs font-semibold"
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

            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
                  Baseline blocks
                </h3>
                <button
                  className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#1f6f8b]"
                  onClick={addBlock}
                  type="button"
                >
                  Add block
                </button>
              </div>

              <div className="grid gap-3">
                {blocks.map((block) => (
                  <div
                    className="grid gap-3 border border-[#d7e0e7] bg-[#f8fafc] p-3"
                    key={block.id}
                  >
                    <div className="grid gap-3 lg:grid-cols-[1fr_120px_120px_auto]">
                      <label className="grid gap-1 text-sm">
                        <span className="font-semibold">Block</span>
                        <input
                          className="border border-[#d7e0e7] bg-white px-3 py-2"
                          onChange={(event) => updateBlock(block.id, { title: event.target.value })}
                          value={block.title}
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="font-semibold">Start</span>
                        <input
                          className="border border-[#d7e0e7] bg-white px-3 py-2"
                          onChange={(event) => updateBlock(block.id, { startTime: event.target.value })}
                          type="time"
                          value={block.startTime}
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="font-semibold">End</span>
                        <input
                          className="border border-[#d7e0e7] bg-white px-3 py-2"
                          onChange={(event) => updateBlock(block.id, { endTime: event.target.value })}
                          type="time"
                          value={block.endTime}
                        />
                      </label>
                      <button
                        className="self-end border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#8a2f2f]"
                        onClick={() => removeBlock(block.id)}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-3">
                      <label className="grid gap-1 text-sm">
                        <span className="font-semibold">Category</span>
                        <input
                          className="border border-[#d7e0e7] bg-white px-3 py-2"
                          onChange={(event) => updateBlock(block.id, { category: event.target.value })}
                          value={block.category}
                        />
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="font-semibold">Noise</span>
                        <select
                          className="border border-[#d7e0e7] bg-white px-3 py-2"
                          onChange={(event) =>
                            updateBlock(block.id, { noiseLevel: event.target.value as NoiseLevel })
                          }
                          value={block.noiseLevel}
                        >
                          {noiseLevelOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1 text-sm">
                        <span className="font-semibold">Location</span>
                        <select
                          className="border border-[#d7e0e7] bg-white px-3 py-2"
                          onChange={(event) =>
                            updateBlock(block.id, {
                              location: event.target.value as ScheduleBlock["location"],
                            })
                          }
                          value={block.location}
                        >
                          {locationOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {editingTemplate ? (
                <button
                  className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold"
                  onClick={resetTemplateForm}
                  type="button"
                >
                  Cancel edit
                </button>
              ) : null}
              <button
                className="border border-[#1f6f8b] bg-[#1f6f8b] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isSaving}
                type="submit"
              >
                {isSaving
                  ? "Saving..."
                  : editingTemplate
                    ? "Update baseline flow"
                    : "Save baseline flow"}
              </button>
            </div>
          </form>

          {statusMessage ? (
            <p className="mt-4 border border-[#b8d8c2] bg-[#f3fbf5] px-3 py-2 text-sm text-[#24523b]">
              {statusMessage}
            </p>
          ) : null}
          {errorMessage ? (
            <p className="mt-4 border border-[#f2b8a0] bg-[#fff7ed] px-3 py-2 text-sm text-[#8a3b12]">
              {errorMessage}
            </p>
          ) : null}

          <div className="mt-6 grid gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#2f6f73]">
              Saved flows
            </h3>
            {templates.length > 0 ? (
              <ol className="grid gap-3">
                {templates.map((template) => (
                  <li
                    className="grid gap-3 border border-[#d7e0e7] bg-[#f8fafc] p-4"
                    key={template.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#17202a]">{template.name}</p>
                        <p className="mt-1 text-sm text-[#657381]">
                          {template.startsOn} to {template.endsOn} · {template.daysOfWeek.join(", ")}
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
                          className="border border-[#d7e0e7] bg-white px-3 py-2 text-sm font-semibold text-[#8a2f2f]"
                          onClick={() => void removeTemplate(template)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <ol className="grid gap-2 md:grid-cols-2">
                      {template.blocks.map((block) => (
                        <li
                          className="grid gap-1 border border-[#d7e0e7] bg-white px-3 py-3 text-sm"
                          key={block.id}
                        >
                          <span className="font-semibold text-[#17202a]">{block.title}</span>
                          <span className="text-[#657381]">
                            {formatTimeRange(block.startTime, block.endTime)} · {block.noiseLevel} ·{" "}
                            {block.location}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="border border-dashed border-[#cbd5df] bg-white px-3 py-4 text-sm text-[#4c5965]">
                No household baseline flows are saved yet.
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="mt-4 border border-dashed border-[#cbd5df] bg-[#f8fafc] px-3 py-4 text-sm text-[#4c5965]">
          Sign in and create a household before adding baseline flows.{" "}
          <Link className="font-semibold text-[#1f6f8b] underline" href="/setup">
            Go to login
          </Link>
        </p>
      )}
    </section>
  );
}

async function loadRemoteBaselineTemplateState(householdId: string) {
  const supabase = createBrowserSupabaseClient();
  const { data: actionItems, error } = await supabase
    .from("household_action_items")
    .select("id, title, days_of_week, start_time, end_time, metadata")
    .eq("household_id", householdId)
    .eq("item_kind", "routine")
    .eq("status", "active")
    .eq("metadata->>kind", "baseline-template-block")
    .returns<BaselineTemplateActionItemRow[]>();

  if (error) {
    throw error;
  }

  const templateGroups = new Map<
    string,
    {
      actionItemIds: Set<string>;
      blocksById: Map<string, BaselineBlockDraft>;
      daysOfWeek: Set<DayOfWeek>;
      endsOn: string;
      name: string;
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
        actionItemIds: new Set<string>(),
        blocksById: new Map<string, BaselineBlockDraft>(),
        daysOfWeek: new Set<DayOfWeek>(),
        endsOn: item.metadata.endsOn ?? "",
        name: item.metadata.baselineTemplateName ?? "Baseline flow",
        startsOn: item.metadata.startsOn ?? "",
      };

    group.actionItemIds.add(item.id);

    for (const day of normalizeDaysOfWeek(item.days_of_week)) {
      group.daysOfWeek.add(day);
    }

    const blockId = item.metadata.stepId ?? item.id;
    if (!group.blocksById.has(blockId)) {
      group.blocksById.set(blockId, {
        id: blockId,
        title: item.title,
        startTime: normalizeTimeForInput(item.start_time),
        endTime: normalizeTimeForInput(item.end_time),
        category: item.metadata.category ?? "personal",
        noiseLevel: item.metadata.noiseLevel ?? "medium",
        location: item.metadata.location ?? "home",
      });
    }

    templateGroups.set(templateId, group);
  }

  return [...templateGroups.entries()]
    .map(([id, group]) => ({
      id,
      actionItemIds: [...group.actionItemIds],
      blocks: [...group.blocksById.values()].sort(compareBlocks),
      daysOfWeek: [...group.daysOfWeek],
      endsOn: group.endsOn,
      name: group.name,
      startsOn: group.startsOn,
    }))
    .sort((first, second) => compareStrings(first.name, second.name));
}

async function createBaselineTemplate({
  blocks,
  daysOfWeek,
  endsOn,
  householdId,
  startsOn,
  templateId = crypto.randomUUID(),
  templateName,
}: {
  blocks: BaselineBlockDraft[];
  daysOfWeek: DayOfWeek[];
  endsOn: string;
  householdId: string;
  startsOn: string;
  templateId?: string;
  templateName: string;
}) {
  const supabase = createBrowserSupabaseClient();
  const rows = blocks.map((block) => ({
    household_id: householdId,
    item_kind: "routine",
    title: block.title,
    source: "manual",
    days_of_week: daysOfWeek,
    start_time: block.startTime,
    end_time: block.endTime,
    metadata: {
      kind: "baseline-template-block",
      baselineTemplateId: templateId,
      baselineTemplateName: templateName,
      stepId: block.id,
      category: block.category,
      noiseLevel: block.noiseLevel,
      location: block.location,
      startsOn,
      endsOn,
    },
  }));

  const { error } = await supabase.from("household_action_items").insert(rows);

  if (error) {
    throw error;
  }
}

async function updateBaselineTemplate({
  actionItemIds,
  blocks,
  daysOfWeek,
  endsOn,
  householdId,
  startsOn,
  templateId,
  templateName,
}: {
  actionItemIds: string[];
  blocks: BaselineBlockDraft[];
  daysOfWeek: DayOfWeek[];
  endsOn: string;
  householdId: string;
  startsOn: string;
  templateId: string;
  templateName: string;
}) {
  await deleteBaselineTemplate({ actionItemIds, householdId });
  await createBaselineTemplate({
    blocks,
    daysOfWeek,
    endsOn,
    householdId,
    startsOn,
    templateId,
    templateName,
  });
}

async function deleteBaselineTemplate({
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
  const { error } = await supabase
    .from("household_action_items")
    .delete()
    .eq("household_id", householdId)
    .in("id", actionItemIds);

  if (error) {
    throw error;
  }
}

function getStarterTemplate(templates: DayTemplate[]) {
  return (
    templates.find((template) => template.id === "summer-weekday-baseline") ??
    templates[0] ?? {
      id: "starter-baseline",
      label: "Baseline flow",
      appliesTo: {
        daysOfWeek: ["MO", "TU", "WE", "TH", "FR"],
        dateRange: {
          startsOn: "",
          endsOn: "",
        },
      },
      blocks: [],
    }
  );
}

function mapBlockToDraft(block: ScheduleBlock): BaselineBlockDraft {
  return {
    id: block.id,
    title: block.title,
    startTime: block.startTime,
    endTime: block.endTime,
    category: block.category,
    noiseLevel: block.noiseLevel,
    location: block.location,
  };
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

function compareBlocks(first: BaselineBlockDraft, second: BaselineBlockDraft) {
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
