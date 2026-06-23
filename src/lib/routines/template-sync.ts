import type { RoutineTemplateCategory } from "@/lib/routines/categories";
import type { DayOfWeek } from "@/lib/planner/types";

export type RoutineTemplateStepDraft = {
  id: string;
  title: string;
  durationMinutes: number;
  orderIndex?: number;
};

export type ExistingRoutineTemplateStepInstance = {
  actionItemId: string;
  category: RoutineTemplateCategory;
  daysOfWeek: DayOfWeek[];
  durationMinutes: number;
  memberId: string;
  offsetMinutes: number;
  orderIndex?: number;
  stepId: string;
  templateName: string;
  title: string;
};

export type PlannedRoutineTemplateStepInstance = {
  actionItemId?: string;
  category: RoutineTemplateCategory;
  daysOfWeek: DayOfWeek[];
  durationMinutes: number;
  memberId: string;
  offsetMinutes: number;
  orderIndex: number;
  stepId: string;
  templateName: string;
  title: string;
};

export function planRoutineTemplateSync({
  category,
  daysOfWeek,
  existing,
  memberIds,
  steps,
  templateName,
}: {
  category: RoutineTemplateCategory;
  daysOfWeek: DayOfWeek[];
  existing: ExistingRoutineTemplateStepInstance[];
  memberIds: string[];
  steps: RoutineTemplateStepDraft[];
  templateName: string;
}) {
  const desired = memberIds.flatMap((memberId) =>
    steps.map((step, index) => {
      const priorStepsDuration = steps
        .slice(0, index)
        .reduce((total, currentStep) => total + Math.max(1, Math.trunc(currentStep.durationMinutes || 0)), 0);
      const normalizedDurationMinutes = Math.max(1, Math.trunc(step.durationMinutes || 0));
      return {
        category,
        daysOfWeek,
        durationMinutes: normalizedDurationMinutes,
        memberId,
        offsetMinutes: priorStepsDuration,
        orderIndex: index,
        stepId: step.id,
        templateName,
        title: step.title,
      };
    }),
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
      existingItem.durationMinutes !== item.durationMinutes ||
      existingItem.offsetMinutes !== item.offsetMinutes ||
      existingItem.orderIndex !== item.orderIndex ||
      existingItem.category !== item.category ||
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
