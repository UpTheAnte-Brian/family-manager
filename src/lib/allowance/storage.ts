import type { AllowanceEntry, WeeklyChore, WeeklyChoreAssignmentTemplate } from "@/lib/planner/types";

export const allowanceStorageKey = "family-manager:allowance:v1";

export type AllowanceStorageState = {
  entries: AllowanceEntry[];
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(amount: number) {
  return currencyFormatter.format(roundCurrencyAmount(amount));
}

export function roundCurrencyAmount(amount: number) {
  return Math.round(amount * 100) / 100;
}

export function normalizeCurrencyAmount(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const amount = typeof value === "string" ? Number(value) : value;

  if (!Number.isFinite(amount)) {
    return undefined;
  }

  const normalized = roundCurrencyAmount(amount);
  return normalized > 0 ? normalized : undefined;
}

export function getChoreAllowanceAmount(chore?: Pick<WeeklyChore, "allowanceAmount"> | null) {
  return normalizeCurrencyAmount(chore?.allowanceAmount);
}

export function toAllowanceCents(amount: number) {
  return Math.round(roundCurrencyAmount(amount) * 100);
}

export function fromAllowanceCents(amountCents: number) {
  return roundCurrencyAmount(amountCents / 100);
}

export function getAllowanceBalance(entries: AllowanceEntry[], childId: string) {
  return roundCurrencyAmount(
    entries
      .filter((entry) => entry.childId === childId)
      .reduce((total, entry) => total + entry.amount, 0),
  );
}

export function removeAllowanceEntriesForCompletion(entries: AllowanceEntry[], choreCompletionId: string) {
  return entries.filter((entry) => entry.choreCompletionId !== choreCompletionId);
}

export function createChoreAllowanceEntry({
  assignment,
  childId,
  chore,
  choreCompletionId,
  id,
  occurredAt,
}: {
  assignment: Pick<WeeklyChoreAssignmentTemplate, "choreId" | "id">;
  childId: string;
  chore?: Pick<WeeklyChore, "allowanceAmount" | "title">;
  choreCompletionId: string;
  id: string;
  occurredAt: string;
}): AllowanceEntry | null {
  const amount = getChoreAllowanceAmount(chore);

  if (!amount) {
    return null;
  }

  return {
    id,
    childId,
    amount,
    source: "chore-completion",
    occurredAt,
    assignmentTemplateId: assignment.id,
    choreCompletionId,
    choreId: assignment.choreId,
    choreTitle: chore?.title,
  };
}
