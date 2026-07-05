import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { groupTripPackingItems, normalizeTripPackingQuantity } from "@/lib/trip-packing/plans";
import type { TripPackingPlan, TripPackingPlanInput, TripPackingStoredItem } from "@/lib/trip-packing/types";

type RemoteTripPackingActionItemRow = {
  created_at: string;
  id: string;
  metadata: {
    assigneeExternalKey?: string;
    checklistStartsOn?: string;
    kind?: string;
    quantity?: number;
    showOnDashboard?: boolean;
    sourceItemId?: string;
    sourceKind?: "base" | "member";
    tripEndsOn?: string;
    tripName?: string;
    tripPlanId?: string;
    tripStartsOn?: string;
  };
  occurrence_date: string | null;
  title: string;
};

type RemoteTripPackingAssignmentRow = {
  assignable_id: string;
  household_member_id: string | null;
};

type RemoteTripPackingCompletionRow = {
  action_item_id: string;
  completed_at: string;
  occurrence_date: string;
};

type RemoteHouseholdMemberRow = {
  external_key: string;
  id: string;
};

export async function loadRemoteTripPackingPlans(householdId: string): Promise<{
  memberIdsByExternalKey: Record<string, string>;
  plans: TripPackingPlan[];
}> {
  const supabase = createBrowserSupabaseClient();
  const { data: members, error: membersError } = await supabase
    .from("household_members")
    .select("id, external_key")
    .eq("household_id", householdId)
    .eq("status", "active")
    .returns<RemoteHouseholdMemberRow[]>();

  if (membersError) {
    throw membersError;
  }

  const memberIdsByExternalKey = Object.fromEntries(
    (members ?? []).map((member) => [member.external_key, member.id]),
  );
  const externalKeysByMemberId = Object.fromEntries(
    (members ?? []).map((member) => [member.id, member.external_key]),
  );

  const { data: actionItems, error: actionItemsError } = await supabase
    .from("household_action_items")
    .select("id, title, occurrence_date, metadata, created_at")
    .eq("household_id", householdId)
    .eq("item_kind", "task")
    .eq("status", "active")
    .eq("metadata->>kind", "trip-packing-item")
    .returns<RemoteTripPackingActionItemRow[]>();

  if (actionItemsError) {
    throw actionItemsError;
  }

  const actionItemIds = (actionItems ?? []).map((item) => item.id);
  const { data: assignments, error: assignmentsError } =
    actionItemIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("household_assignments")
          .select("assignable_id, household_member_id")
          .eq("household_id", householdId)
          .eq("assignable_type", "action_item")
          .in("assignable_id", actionItemIds)
          .returns<RemoteTripPackingAssignmentRow[]>();

  if (assignmentsError) {
    throw assignmentsError;
  }

  const { data: completions, error: completionsError } =
    actionItemIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("household_action_item_completions")
          .select("action_item_id, occurrence_date, completed_at")
          .eq("household_id", householdId)
          .in("action_item_id", actionItemIds)
          .returns<RemoteTripPackingCompletionRow[]>();

  if (completionsError) {
    throw completionsError;
  }

  const memberIdByActionItemId = new Map(
    (assignments ?? [])
      .filter((assignment) => assignment.household_member_id)
      .map((assignment) => [assignment.assignable_id, assignment.household_member_id!]),
  );
  const latestCompletionByActionItemId = new Map<string, RemoteTripPackingCompletionRow>();

  for (const completion of completions ?? []) {
    const previousCompletion = latestCompletionByActionItemId.get(completion.action_item_id);

    if (!previousCompletion || previousCompletion.occurrence_date < completion.occurrence_date) {
      latestCompletionByActionItemId.set(completion.action_item_id, completion);
    }
  }

  const storedItems: TripPackingStoredItem[] = (actionItems ?? []).flatMap((item) => {
    const remoteMemberId = memberIdByActionItemId.get(item.id);
    const assigneeId = remoteMemberId ? externalKeysByMemberId[remoteMemberId] : undefined;
    const metadata = item.metadata ?? {};

    if (
      !assigneeId ||
      !metadata.tripPlanId ||
      !metadata.tripName ||
      !metadata.tripStartsOn ||
      !metadata.tripEndsOn ||
      !metadata.checklistStartsOn ||
      !metadata.sourceItemId ||
      !metadata.sourceKind
    ) {
      return [];
    }

    return [
      {
        actionItemId: item.id,
        assigneeId,
        checklistStartsOn: metadata.checklistStartsOn,
        completedAt: latestCompletionByActionItemId.get(item.id)?.completed_at,
        createdAt: item.created_at,
        quantity: normalizeTripPackingQuantity(Number(metadata.quantity ?? 1)),
        showOnDashboard: metadata.showOnDashboard ?? true,
        sourceItemId: metadata.sourceItemId,
        sourceKind: metadata.sourceKind,
        title: item.title,
        tripEndsOn: metadata.tripEndsOn,
        tripPlanId: metadata.tripPlanId,
        tripStartsOn: metadata.tripStartsOn,
        tripName: metadata.tripName,
      },
    ];
  });

  return {
    memberIdsByExternalKey,
    plans: groupTripPackingItems(storedItems),
  };
}

export async function saveRemoteTripPackingPlan({
  householdId,
  memberIdsByExternalKey,
  plan,
}: {
  householdId: string;
  memberIdsByExternalKey: Record<string, string>;
  plan: TripPackingPlanInput;
}) {
  const supabase = createBrowserSupabaseClient();
  const rows = plan.memberIds.flatMap((memberExternalKey) => {
    const baseRows = plan.baseItems.map((item) =>
      createRemoteTripPackingRow({
        assigneeExternalKey: memberExternalKey,
        householdId,
        item,
        plan,
        sourceKind: "base",
      }),
    );
    const memberRows = (plan.memberItems[memberExternalKey] ?? []).map((item) =>
      createRemoteTripPackingRow({
        assigneeExternalKey: memberExternalKey,
        householdId,
        item,
        plan,
        sourceKind: "member",
      }),
    );

    return [...baseRows, ...memberRows];
  });

  const { data: actionItems, error: actionItemsError } = await supabase
    .from("household_action_items")
    .insert(rows)
    .select("id, metadata")
    .returns<Array<{ id: string; metadata: { assigneeExternalKey?: string } }>>();

  if (actionItemsError) {
    throw actionItemsError;
  }

  const assignmentRows = (actionItems ?? []).map((actionItem) => {
    const memberExternalKey = actionItem.metadata.assigneeExternalKey;
    const householdMemberId = memberExternalKey ? memberIdsByExternalKey[memberExternalKey] : undefined;

    if (!householdMemberId) {
      throw new Error("Save household members in setup before assigning trip packing lists.");
    }

    return {
      household_id: householdId,
      assignable_type: "action_item",
      assignable_id: actionItem.id,
      assignee_type: "member",
      household_member_id: householdMemberId,
    };
  });

  const { error: assignmentsError } = await supabase
    .from("household_assignments")
    .insert(assignmentRows);

  if (assignmentsError) {
    await supabase
      .from("household_action_items")
      .delete()
      .eq("household_id", householdId)
      .in(
        "id",
        (actionItems ?? []).map((item) => item.id),
      );
    throw assignmentsError;
  }
}

export async function deleteRemoteTripPackingPlan({
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
  const { error: completionsError } = await supabase
    .from("household_action_item_completions")
    .delete()
    .eq("household_id", householdId)
    .in("action_item_id", actionItemIds);

  if (completionsError) {
    throw completionsError;
  }

  const { error: assignmentsError } = await supabase
    .from("household_assignments")
    .delete()
    .eq("household_id", householdId)
    .eq("assignable_type", "action_item")
    .in("assignable_id", actionItemIds);

  if (assignmentsError) {
    throw assignmentsError;
  }

  const { error: actionItemsError } = await supabase
    .from("household_action_items")
    .delete()
    .eq("household_id", householdId)
    .in("id", actionItemIds);

  if (actionItemsError) {
    throw actionItemsError;
  }
}

export async function clearRemoteTripPackingCompletions({
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
    .from("household_action_item_completions")
    .delete()
    .eq("household_id", householdId)
    .in("action_item_id", actionItemIds);

  if (error) {
    throw error;
  }
}

function createRemoteTripPackingRow({
  assigneeExternalKey,
  householdId,
  item,
  plan,
  sourceKind,
}: {
  assigneeExternalKey: string;
  householdId: string;
  item: TripPackingPlanInput["baseItems"][number];
  plan: TripPackingPlanInput;
  sourceKind: "base" | "member";
}) {
  return {
    household_id: householdId,
    item_kind: "task",
    title: item.title,
    source: "manual",
    occurrence_date: plan.checklistStartsOn,
    metadata: {
      assigneeExternalKey,
      kind: "trip-packing-item",
      checklistStartsOn: plan.checklistStartsOn,
      quantity: item.quantity,
      showOnDashboard: plan.showOnDashboard,
      sourceItemId: item.id,
      sourceKind,
      tripEndsOn: plan.tripEndsOn,
      tripName: plan.tripName,
      tripPlanId: plan.id,
      tripStartsOn: plan.tripStartsOn,
    },
  };
}
