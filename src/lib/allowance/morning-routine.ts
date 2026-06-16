import { normalizeCurrencyAmount } from "@/lib/allowance/storage";
import type { AllowanceEntry, HouseholdMember } from "@/lib/planner/types";

export const morningRoutineAllowanceCategory = "morning-routine";
export const morningRoutineAllowanceEntryType = "morning_routine_completion";
export const morningRoutineAllowanceLabel = "Morning routine complete";

export function getMorningRoutineAllowanceAmount(
  member?: Pick<HouseholdMember, "morningRoutineAllowanceAmount"> | null,
) {
  return normalizeCurrencyAmount(member?.morningRoutineAllowanceAmount);
}

export function createMorningRoutineAllowanceEntry({
  amount,
  childId,
  completionDate,
  id,
  occurredAt,
}: {
  amount: number | null | undefined;
  childId: string;
  completionDate: string;
  id: string;
  occurredAt: string;
}): AllowanceEntry | null {
  const normalizedAmount = normalizeCurrencyAmount(amount);

  if (!normalizedAmount) {
    return null;
  }

  return {
    id,
    childId,
    amount: normalizedAmount,
    source: "morning-routine-completion",
    occurredAt,
    choreTitle: morningRoutineAllowanceLabel,
    label: morningRoutineAllowanceLabel,
    routineCategory: morningRoutineAllowanceCategory,
    routineCompletionDate: completionDate,
  };
}

export function hasMorningRoutineAllowanceEntry(
  entries: AllowanceEntry[],
  childId: string,
  completionDate: string,
) {
  return entries.some((entry) => isMorningRoutineAllowanceEntry(entry, childId, completionDate));
}

export function removeMorningRoutineAllowanceEntries(
  entries: AllowanceEntry[],
  childId: string,
  completionDate: string,
) {
  return entries.filter((entry) => !isMorningRoutineAllowanceEntry(entry, childId, completionDate));
}

export function getMorningRoutineOccurredAt(
  completionDate: string,
  items: Array<Pick<{ endTime: string }, "endTime">>,
) {
  const latestEndTime =
    items
      .map((item) => normalizeTime(item.endTime))
      .filter((time): time is string => Boolean(time))
      .sort((first, second) => second.localeCompare(first))[0] ?? "09:00";

  return `${completionDate}T${latestEndTime}:00`;
}

function isMorningRoutineAllowanceEntry(
  entry: Pick<AllowanceEntry, "childId" | "routineCategory" | "routineCompletionDate" | "source">,
  childId: string,
  completionDate: string,
) {
  return (
    entry.childId === childId &&
    entry.source === "morning-routine-completion" &&
    entry.routineCategory === morningRoutineAllowanceCategory &&
    entry.routineCompletionDate === completionDate
  );
}

function normalizeTime(value: string) {
  return /^\d{2}:\d{2}$/.test(value) ? value : null;
}
