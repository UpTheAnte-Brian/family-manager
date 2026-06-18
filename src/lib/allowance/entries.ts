import { normalizeCurrencyAmount } from "@/lib/allowance/storage";
import type { AllowanceEntry } from "@/lib/planner/types";

export type AllowanceEntryDraftInput = {
  amount: number | string;
  note: string;
  title: string;
};

export function canRenameAllowanceEntry(entry: Pick<AllowanceEntry, "source">) {
  return entry.source === "manual-adjustment";
}

export function applyAllowanceEntryDraft(
  entry: AllowanceEntry,
  draft: AllowanceEntryDraftInput,
): AllowanceEntry {
  const amount = normalizeCurrencyAmount(draft.amount);

  if (!amount) {
    throw new Error("Enter an amount greater than $0.00.");
  }

  const note = draft.note.trim();

  if (!canRenameAllowanceEntry(entry)) {
    return {
      ...entry,
      amount,
      note: note || undefined,
    };
  }

  const title = draft.title.trim();

  if (!title) {
    throw new Error("Enter the work that should appear in the bank.");
  }

  return {
    ...entry,
    amount,
    choreTitle: title,
    label: title,
    note: note || undefined,
  };
}
