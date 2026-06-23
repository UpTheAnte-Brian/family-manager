import { fromAllowanceCents, normalizeCurrencyAmount, toAllowanceCents } from "@/lib/allowance/storage";
import type { AllowanceRequestKind } from "@/lib/allowance/request-kind";
import { normalizeChoreCategory, type ChoreCategoryId } from "@/lib/chores/categories";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type AllowanceRequest = {
  id: string;
  childRemoteMemberId: string;
  requestedByRemoteMemberId?: string;
  approvedByRemoteMemberId?: string;
  choreId?: string;
  assignmentTemplateId?: string;
  choreCompletionId?: string;
  allowanceEntryId?: string;
  choreTitle: string;
  category?: ChoreCategoryId;
  kind: AllowanceRequestKind;
  amount: number;
  occurrenceDate: string;
  note?: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  approvedAt?: string;
};

type RemoteAllowanceRequestRow = {
  id: string;
  household_member_id: string;
  requested_by_member_id: string | null;
  approved_by_member_id: string | null;
  chore_id: string | null;
  allowance_entry_id: string | null;
  request_kind: AllowanceRequestKind;
  chore_title: string;
  category_id: string | null;
  requested_amount_cents: number;
  estimated_minutes: number | null;
  occurrence_date: string;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  approved_at: string | null;
  metadata: {
    assignmentTemplateId?: string;
    choreCompletionId?: string;
  } | null;
};

const allowanceRequestSelect =
  "id, household_member_id, requested_by_member_id, approved_by_member_id, chore_id, allowance_entry_id, request_kind, chore_title, category_id, requested_amount_cents, estimated_minutes, occurrence_date, note, status, requested_at, approved_at, metadata";

type SaveAllowanceRequestInput = {
  amount: number;
  assignmentTemplateId?: string;
  category?: ChoreCategoryId;
  childRemoteMemberId: string;
  choreId?: string;
  choreCompletionId?: string;
  choreTitle: string;
  householdId: string;
  kind: AllowanceRequestKind;
  note?: string;
  occurrenceDate: string;
  requestId?: string;
  requestedByRemoteMemberId?: string;
};

export async function createRemoteAllowanceRequest(input: Omit<SaveAllowanceRequestInput, "requestId">) {
  return saveRemoteAllowanceRequestRow(input);
}

export async function updateRemoteAllowanceRequest(
  input: Omit<SaveAllowanceRequestInput, "requestedByRemoteMemberId"> & { requestId: string },
) {
  return saveRemoteAllowanceRequestRow(input);
}

export async function loadRemoteAllowanceRequests({
  householdId,
  remoteChildMemberIds,
}: {
  householdId: string;
  remoteChildMemberIds: string[];
}) {
  if (remoteChildMemberIds.length === 0) {
    return [];
  }

  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase
    .from("allowance_request_entries")
    .select(allowanceRequestSelect)
    .eq("household_id", householdId)
    .in("household_member_id", remoteChildMemberIds)
    .eq("status", "pending")
    .order("requested_at", { ascending: false })
    .returns<RemoteAllowanceRequestRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapRemoteAllowanceRequest);
}

export async function approveRemoteAllowanceRequest(requestId: string) {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc("approve_allowance_request_entry", {
    target_request_id: requestId,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function cancelRemoteAllowanceRequest(requestId: string) {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc("cancel_allowance_request_entry", {
    target_request_id: requestId,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function rejectRemoteAllowanceRequest(requestId: string) {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.rpc("reject_allowance_request_entry", {
    target_request_id: requestId,
  });

  if (error) {
    throw error;
  }

  return data;
}

async function saveRemoteAllowanceRequestRow({
  amount,
  assignmentTemplateId,
  category,
  childRemoteMemberId,
  choreId,
  choreCompletionId,
  choreTitle,
  householdId,
  kind,
  note,
  occurrenceDate,
  requestId,
  requestedByRemoteMemberId,
}: SaveAllowanceRequestInput) {
  const supabase = createBrowserSupabaseClient();
  const normalizedAmount = normalizeCurrencyAmount(amount);

  if (!normalizedAmount) {
    throw new Error("Enter an amount greater than $0.00.");
  }

  const trimmedTitle = choreTitle.trim();

  if (!trimmedTitle) {
    throw new Error(kind === "debit" ? "Enter the reason for the debit." : "Enter the work that should be credited.");
  }

  const row = {
    household_id: householdId,
    household_member_id: childRemoteMemberId,
    ...(requestId ? {} : { requested_by_member_id: requestedByRemoteMemberId ?? null }),
    chore_id: kind === "credit" ? (choreId ?? null) : null,
    request_kind: kind,
    chore_title: trimmedTitle,
    category_id: kind === "credit" ? (category ?? null) : null,
    requested_amount_cents: toAllowanceCents(normalizedAmount),
    estimated_minutes: kind === "credit" ? 20 : null,
    occurrence_date: occurrenceDate,
    note: note?.trim() || null,
    metadata:
      kind === "credit"
        ? {
            ...(assignmentTemplateId ? { assignmentTemplateId } : {}),
            ...(choreCompletionId ? { choreCompletionId } : {}),
          }
        : {},
  };
  const query = requestId
    ? supabase
        .from("allowance_request_entries")
        .update(row)
        .eq("household_id", householdId)
        .eq("id", requestId)
        .eq("status", "pending")
    : supabase.from("allowance_request_entries").insert(row);
  const { data, error } = await query.select(allowanceRequestSelect).single<RemoteAllowanceRequestRow>();

  if (error) {
    throw error;
  }

  return mapRemoteAllowanceRequest(data);
}

function mapRemoteAllowanceRequest(row: RemoteAllowanceRequestRow): AllowanceRequest {
  return {
    id: row.id,
    childRemoteMemberId: row.household_member_id,
    requestedByRemoteMemberId: row.requested_by_member_id ?? undefined,
    approvedByRemoteMemberId: row.approved_by_member_id ?? undefined,
    choreId: row.chore_id ?? undefined,
    assignmentTemplateId: row.metadata?.assignmentTemplateId ?? undefined,
    choreCompletionId: row.metadata?.choreCompletionId ?? undefined,
    allowanceEntryId: row.allowance_entry_id ?? undefined,
    choreTitle: row.chore_title,
    kind: row.request_kind,
    category: row.request_kind === "credit" ? normalizeChoreCategory(row.category_id ?? undefined) : undefined,
    amount: fromAllowanceCents(row.requested_amount_cents),
    occurrenceDate: row.occurrence_date,
    note: row.note ?? undefined,
    status: row.status,
    requestedAt: row.requested_at,
    approvedAt: row.approved_at ?? undefined,
  };
}
