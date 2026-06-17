import type { DayOfWeek } from "@/lib/planner/types";

export type RoutineTemplateStepDraft = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
};

export type ExistingRoutineTemplateStepInstance = {
  actionItemId: string;
  daysOfWeek: DayOfWeek[];
  memberId: string;
  startTime: string;
  stepId: string;
  templateName: string;
  title: string;
  endTime: string;
};

export type PlannedRoutineTemplateStepInstance = {
  actionItemId?: string;
  daysOfWeek: DayOfWeek[];
  memberId: string;
  startTime: string;
  stepId: string;
  templateName: string;
  title: string;
  endTime: string;
};

export function planRoutineTemplateSync({
  daysOfWeek,
  existing,
  memberIds,
  steps,
  templateName,
}: {
  daysOfWeek: DayOfWeek[];
  existing: ExistingRoutineTemplateStepInstance[];
  memberIds: string[];
  steps: RoutineTemplateStepDraft[];
  templateName: string;
}) {
  const desired = memberIds.flatMap((memberId) =>
    steps.map((step) => ({
      daysOfWeek,
      memberId,
      startTime: step.startTime,
      stepId: step.id,
      templateName,
      title: step.title,
      endTime: step.endTime,
    })),
  );
  const existingByKey = new Map(
    existing.map((item) => [getRoutineTemplateInstanceKey(item.memberId, item.stepId), item]),
  );
  const desiredKeys = new Set<string>();
  const create: PlannedRoutineTemplateStepInstance[] = [];
  const update: PlannedRoutineTemplateStepInstance[] = [];

  for (const item of desired) {
    const key = getRoutineTemplateInstanceKey(item.memberId, item.stepId);
    const existingItem = existingByKey.get(key);
    desiredKeys.add(key);

    if (!existingItem) {
      create.push(item);
      continue;
    }

    if (
      existingItem.title !== item.title ||
      existingItem.startTime !== item.startTime ||
      existingItem.endTime !== item.endTime ||
      existingItem.templateName !== item.templateName ||
      !haveSameDaysOfWeek(existingItem.daysOfWeek, item.daysOfWeek)
    ) {
      update.push({
        ...item,
        actionItemId: existingItem.actionItemId,
      });
    }
  }

  return {
    create,
    removeActionItemIds: existing
      .filter((item) => !desiredKeys.has(getRoutineTemplateInstanceKey(item.memberId, item.stepId)))
      .map((item) => item.actionItemId),
    update,
  };
}

function getRoutineTemplateInstanceKey(memberId: string, stepId: string) {
  return `${memberId}:${stepId}`;
}

function haveSameDaysOfWeek(first: DayOfWeek[], second: DayOfWeek[]) {
  if (first.length !== second.length) {
    return false;
  }

  const normalizedFirst = [...first].sort();
  const normalizedSecond = [...second].sort();

  return normalizedFirst.every((day, index) => day === normalizedSecond[index]);
}
