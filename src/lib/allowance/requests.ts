import { fromAllowanceCents, normalizeCurrencyAmount, toAllowanceCents } from "@/lib/allowance/storage";
import { normalizeChoreCategory, type ChoreCategoryId } from "@/lib/chores/categories";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type AllowanceRequest = {
  id: string;
  childRemoteMemberId: string;
  requestedByRemoteMemberId?: string;
  approvedByRemoteMemberId?: string;
  choreId?: string;
  allowanceEntryId?: string;
  choreTitle: string;
  category: ChoreCategoryId;
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
  chore_title: string;
  category_id: string | null;
  requested_amount_cents: number;
  estimated_minutes: number | null;
  occurrence_date: string;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  approved_at: string | null;
};

export async function createRemoteAllowanceRequest({
  amount,
  category,
  childRemoteMemberId,
  choreId,
  choreTitle,
  householdId,
  note,
  occurrenceDate,
  requestedByRemoteMemberId,
}: {
  amount: number;
  category: ChoreCategoryId;
  childRemoteMemberId: string;
  choreId?: string;
  choreTitle: string;
  householdId: string;
  note?: string;
  occurrenceDate: string;
  requestedByRemoteMemberId?: string;
}) {
  const supabase = createBrowserSupabaseClient();
  const normalizedAmount = normalizeCurrencyAmount(amount);

  if (!normalizedAmount) {
    throw new Error("Enter an amount greater than $0.00.");
  }

  const trimmedTitle = choreTitle.trim();

  if (!trimmedTitle) {
    throw new Error("Enter the work that should be credited.");
  }

  const { data, error } = await supabase
    .from("allowance_request_entries")
    .insert({
      household_id: householdId,
      household_member_id: childRemoteMemberId,
      requested_by_member_id: requestedByRemoteMemberId ?? null,
      chore_id: choreId ?? null,
      chore_title: trimmedTitle,
      category_id: category,
      requested_amount_cents: toAllowanceCents(normalizedAmount),
      estimated_minutes: 20,
      occurrence_date: occurrenceDate,
      note: note?.trim() || null,
    })
    .select(
      "id, household_member_id, requested_by_member_id, approved_by_member_id, chore_id, allowance_entry_id, chore_title, category_id, requested_amount_cents, estimated_minutes, occurrence_date, note, status, requested_at, approved_at",
    )
    .single<RemoteAllowanceRequestRow>();

  if (error) {
    throw error;
  }

  return mapRemoteAllowanceRequest(data);
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
    .select(
      "id, household_member_id, requested_by_member_id, approved_by_member_id, chore_id, allowance_entry_id, chore_title, category_id, requested_amount_cents, estimated_minutes, occurrence_date, note, status, requested_at, approved_at",
    )
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

function mapRemoteAllowanceRequest(row: RemoteAllowanceRequestRow): AllowanceRequest {
  return {
    id: row.id,
    childRemoteMemberId: row.household_member_id,
    requestedByRemoteMemberId: row.requested_by_member_id ?? undefined,
    approvedByRemoteMemberId: row.approved_by_member_id ?? undefined,
    choreId: row.chore_id ?? undefined,
    allowanceEntryId: row.allowance_entry_id ?? undefined,
    choreTitle: row.chore_title,
    category: normalizeChoreCategory(row.category_id ?? undefined),
    amount: fromAllowanceCents(row.requested_amount_cents),
    occurrenceDate: row.occurrence_date,
    note: row.note ?? undefined,
    status: row.status,
    requestedAt: row.requested_at,
    approvedAt: row.approved_at ?? undefined,
  };
}
