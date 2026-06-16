import {
  morningRoutineAllowanceCategory,
  morningRoutineAllowanceEntryType,
  morningRoutineAllowanceLabel,
} from "@/lib/allowance/morning-routine";
import { fromAllowanceCents, toAllowanceCents } from "@/lib/allowance/storage";
import type { AllowanceEntry } from "@/lib/planner/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function isMissingAllowanceEntriesTableError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? error.code : undefined;
  const message = "message" in error ? error.message : undefined;
  const details = "details" in error ? error.details : undefined;
  const hint = "hint" in error ? error.hint : undefined;
  const status = "status" in error ? error.status : undefined;
  const text = [message, details, hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return (
    code === "PGRST205" ||
    (status === 404 && text.includes("allowance_entries")) ||
    text.includes("public.allowance_entries") ||
    text.includes("allowance_entries")
  );
}

type RemoteAllowanceEntryRow = {
  id: string;
  household_member_id: string;
  amount_cents: number;
  chore_completion_id: string | null;
  chore_id: string | null;
  entry_type: string;
  occurred_at: string;
  metadata: {
    assignmentTemplateId?: string;
    choreTitle?: string;
    label?: string;
    note?: string;
    routineCategory?: string;
    routineCompletionDate?: string;
  };
};

export async function createRemoteMorningRoutineAllowanceEntry({
  amount,
  childId,
  completionDate,
  householdId,
  householdMemberId,
  occurredAt,
}: {
  amount: number;
  childId: string;
  completionDate: string;
  householdId: string;
  householdMemberId: string;
  occurredAt: string;
}) {
  const supabase = createBrowserSupabaseClient();
  const existing = await findRemoteMorningRoutineAllowanceEntry({
    childId,
    completionDate,
    householdId,
    householdMemberId,
  });

  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from("allowance_entries")
    .insert({
      household_id: householdId,
      household_member_id: householdMemberId,
      entry_type: morningRoutineAllowanceEntryType,
      amount_cents: toAllowanceCents(amount),
      occurred_at: occurredAt,
      metadata: {
        label: morningRoutineAllowanceLabel,
        routineCategory: morningRoutineAllowanceCategory,
        routineCompletionDate: completionDate,
      },
    })
    .select(
      "id, household_member_id, amount_cents, chore_completion_id, chore_id, entry_type, occurred_at, metadata",
    )
    .single<RemoteAllowanceEntryRow>();

  if (error) {
    if ("code" in error && error.code === "23505") {
      const duplicate = await findRemoteMorningRoutineAllowanceEntry({
        childId,
        completionDate,
        householdId,
        householdMemberId,
      });

      if (duplicate) {
        return duplicate;
      }
    }

    throw error;
  }

  return mapRemoteAllowanceEntry(data, childId);
}

export async function deleteRemoteMorningRoutineAllowanceEntry({
  completionDate,
  householdId,
  householdMemberId,
}: {
  completionDate: string;
  householdId: string;
  householdMemberId: string;
}) {
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase
    .from("allowance_entries")
    .delete()
    .eq("household_id", householdId)
    .eq("household_member_id", householdMemberId)
    .eq("entry_type", morningRoutineAllowanceEntryType)
    .eq("metadata->>routineCategory", morningRoutineAllowanceCategory)
    .eq("metadata->>routineCompletionDate", completionDate);

  if (error) {
    throw error;
  }
}

async function findRemoteMorningRoutineAllowanceEntry({
  childId,
  completionDate,
  householdId,
  householdMemberId,
}: {
  childId: string;
  completionDate: string;
  householdId: string;
  householdMemberId: string;
}) {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase
    .from("allowance_entries")
    .select(
      "id, household_member_id, amount_cents, chore_completion_id, chore_id, entry_type, occurred_at, metadata",
    )
    .eq("household_id", householdId)
    .eq("household_member_id", householdMemberId)
    .eq("entry_type", morningRoutineAllowanceEntryType)
    .eq("metadata->>routineCategory", morningRoutineAllowanceCategory)
    .eq("metadata->>routineCompletionDate", completionDate)
    .maybeSingle<RemoteAllowanceEntryRow>();

  if (error) {
    throw error;
  }

  return data ? mapRemoteAllowanceEntry(data, childId) : null;
}

function mapRemoteAllowanceEntry(entry: RemoteAllowanceEntryRow, childId: string): AllowanceEntry {
  const source =
    entry.entry_type === morningRoutineAllowanceEntryType
      ? "morning-routine-completion"
      : entry.entry_type === "manual_adjustment"
        ? "manual-adjustment"
        : "chore-completion";

  return {
    id: entry.id,
    childId,
    amount: fromAllowanceCents(entry.amount_cents),
    source,
    occurredAt: entry.occurred_at,
    assignmentTemplateId: entry.metadata.assignmentTemplateId,
    choreCompletionId: entry.chore_completion_id ?? undefined,
    choreId: entry.chore_id ?? undefined,
    choreTitle: entry.metadata.choreTitle,
    label: entry.metadata.label,
    note: entry.metadata.note,
    routineCategory: entry.metadata.routineCategory,
    routineCompletionDate: entry.metadata.routineCompletionDate,
  };
}
