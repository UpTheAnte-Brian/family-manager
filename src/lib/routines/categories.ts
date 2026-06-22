export type RoutineTemplateCategory = "morning-routine" | "night-routine";

export const routineTemplateCategoryOptions: RoutineTemplateCategory[] = [
  "morning-routine",
  "night-routine",
];

export function getRoutineTemplateCategoryLabel(category: RoutineTemplateCategory) {
  return category === "night-routine" ? "Night routine" : "Morning routine";
}

export function resolveRoutineTemplateCategory({
  category,
  endTime,
  startTime,
  templateName,
  title,
}: {
  category?: string;
  endTime?: string | null;
  startTime?: string | null;
  templateName?: string;
  title?: string;
}): RoutineTemplateCategory {
  if (category === "night-routine") {
    return "night-routine";
  }

  if (looksLikeNightRoutine({ endTime, startTime, templateName, title })) {
    return "night-routine";
  }

  return "morning-routine";
}

function looksLikeNightRoutine({
  endTime,
  startTime,
  templateName,
  title,
}: {
  endTime?: string | null;
  startTime?: string | null;
  templateName?: string;
  title?: string;
}) {
  const combinedLabel = `${templateName ?? ""} ${title ?? ""}`;

  return (
    /\b(night|bedtime|evening|pajamas?|pyjamas?)\b/i.test(combinedLabel) ||
    isNightRoutineTime(startTime) ||
    isNightRoutineTime(endTime)
  );
}

function isNightRoutineTime(value?: string | null) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    return false;
  }

  return value >= "18:00";
}
