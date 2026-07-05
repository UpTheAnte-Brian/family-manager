import type { TripPackingItemDraft, TripPackingPlan, TripPackingStoredItem } from "@/lib/trip-packing/types";

export type TripPackingChecklistItem = {
  actionItemIds: string[];
  checked: boolean;
  completedAt?: string;
  id: string;
  quantity: number;
  sourceKinds: Array<TripPackingStoredItem["sourceKind"]>;
  title: string;
};

export function getTripDurationDays(tripStartsOn: string, tripEndsOn: string) {
  const start = Date.parse(`${tripStartsOn}T00:00:00Z`);
  const end = Date.parse(`${tripEndsOn}T00:00:00Z`);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 0;
  }

  return Math.floor((end - start) / 86_400_000) + 1;
}

export function mergeTripPackingItems(
  baseItems: TripPackingItemDraft[],
  memberItems: TripPackingItemDraft[],
): TripPackingItemDraft[] {
  const mergedItems = new Map<string, TripPackingItemDraft>();

  for (const item of [...baseItems, ...memberItems]) {
    const normalizedTitle = normalizeTripPackingTitle(item.title);
    const existingItem = mergedItems.get(normalizedTitle);

    if (!existingItem) {
      mergedItems.set(normalizedTitle, {
        ...item,
        quantity: normalizeTripPackingQuantity(item.quantity),
        title: item.title.trim(),
      });
      continue;
    }

    mergedItems.set(normalizedTitle, {
      ...existingItem,
      quantity:
        normalizeTripPackingQuantity(existingItem.quantity) +
        normalizeTripPackingQuantity(item.quantity),
    });
  }

  return [...mergedItems.values()].sort((first, second) =>
    compareStrings(`${first.title}-${first.id}`, `${second.title}-${second.id}`),
  );
}

export function groupTripPackingItems(items: TripPackingStoredItem[]): TripPackingPlan[] {
  const plans = new Map<
    string,
    {
      actionItemIds: Set<string>;
      assigneeIds: Set<string>;
      baseItemsById: Map<string, TripPackingItemDraft>;
      checklistStartsOn: string;
      itemsByMemberId: Map<string, TripPackingStoredItem[]>;
      memberItemsByMemberId: Map<string, Map<string, TripPackingItemDraft>>;
      showOnDashboard: boolean;
      tripEndsOn: string;
      tripName: string;
      tripStartsOn: string;
    }
  >();

  for (const item of items) {
    const existingPlan =
      plans.get(item.tripPlanId) ??
      {
        actionItemIds: new Set<string>(),
        assigneeIds: new Set<string>(),
        baseItemsById: new Map<string, TripPackingItemDraft>(),
        checklistStartsOn: item.checklistStartsOn,
        itemsByMemberId: new Map<string, TripPackingStoredItem[]>(),
        memberItemsByMemberId: new Map<string, Map<string, TripPackingItemDraft>>(),
        showOnDashboard: item.showOnDashboard,
        tripEndsOn: item.tripEndsOn,
        tripName: item.tripName,
        tripStartsOn: item.tripStartsOn,
      };

    existingPlan.actionItemIds.add(item.actionItemId);
    existingPlan.assigneeIds.add(item.assigneeId);
    existingPlan.itemsByMemberId.set(item.assigneeId, [
      ...(existingPlan.itemsByMemberId.get(item.assigneeId) ?? []),
      item,
    ]);

    if (item.sourceKind === "base") {
      if (!existingPlan.baseItemsById.has(item.sourceItemId)) {
        existingPlan.baseItemsById.set(item.sourceItemId, {
          id: item.sourceItemId,
          quantity: normalizeTripPackingQuantity(item.quantity),
          title: item.title,
        });
      }
    } else {
      const memberItems =
        existingPlan.memberItemsByMemberId.get(item.assigneeId) ?? new Map<string, TripPackingItemDraft>();

      if (!memberItems.has(item.sourceItemId)) {
        memberItems.set(item.sourceItemId, {
          id: item.sourceItemId,
          quantity: normalizeTripPackingQuantity(item.quantity),
          title: item.title,
        });
      }

      existingPlan.memberItemsByMemberId.set(item.assigneeId, memberItems);
    }

    plans.set(item.tripPlanId, existingPlan);
  }

  return [...plans.entries()]
    .map(([planId, plan]) => ({
      actionItemIds: [...plan.actionItemIds].sort(compareStrings),
      baseItems: [...plan.baseItemsById.values()].sort((first, second) =>
        compareStrings(`${first.title}-${first.id}`, `${second.title}-${second.id}`),
      ),
      checklistStartsOn: plan.checklistStartsOn,
      id: planId,
      itemsByMemberId: Object.fromEntries(
        [...plan.itemsByMemberId.entries()].map(([memberId, memberItems]) => [
          memberId,
          [...memberItems].sort((first, second) =>
            compareStrings(`${first.title}-${first.actionItemId}`, `${second.title}-${second.actionItemId}`),
          ),
        ]),
      ),
      memberIds: [...plan.assigneeIds].sort(compareStrings),
      memberItems: Object.fromEntries(
        [...plan.memberItemsByMemberId.entries()].map(([memberId, memberItems]) => [
          memberId,
          [...memberItems.values()].sort((first, second) =>
            compareStrings(`${first.title}-${first.id}`, `${second.title}-${second.id}`),
          ),
        ]),
      ),
      showOnDashboard: plan.showOnDashboard,
      tripEndsOn: plan.tripEndsOn,
      tripStartsOn: plan.tripStartsOn,
      tripName: plan.tripName,
    }))
    .sort((first, second) =>
      compareStrings(
        `${first.checklistStartsOn}-${first.tripStartsOn}-${first.tripName}`,
        `${second.checklistStartsOn}-${second.tripStartsOn}-${second.tripName}`,
      ),
    );
}

export function getVisibleTripPackingPlans(
  plans: TripPackingPlan[],
  memberId: string,
  date: string,
) {
  return plans.filter(
    (plan) =>
      plan.showOnDashboard &&
      plan.memberIds.includes(memberId) &&
      plan.checklistStartsOn <= date &&
      date <= plan.tripEndsOn,
  );
}

export function getTripPackingProgress(plan: TripPackingPlan, memberId: string) {
  const checklistItems = getTripPackingChecklistItems(plan, memberId);
  const completedCount = checklistItems.filter((item) => item.checked).length;

  return {
    completedCount,
    totalCount: checklistItems.length,
  };
}

export function getTripPackingChecklistItems(
  plan: TripPackingPlan,
  memberId: string,
): TripPackingChecklistItem[] {
  const checklistItems = new Map<string, TripPackingChecklistItem>();

  for (const item of plan.itemsByMemberId[memberId] ?? []) {
    const key = normalizeTripPackingTitle(item.title);
    const existingItem = checklistItems.get(key);

    if (!existingItem) {
      checklistItems.set(key, {
        actionItemIds: [item.actionItemId],
        checked: Boolean(item.completedAt),
        completedAt: item.completedAt,
        id: key || item.actionItemId,
        quantity: normalizeTripPackingQuantity(item.quantity),
        sourceKinds: [item.sourceKind],
        title: item.title,
      });
      continue;
    }

    checklistItems.set(key, {
      ...existingItem,
      actionItemIds: [...existingItem.actionItemIds, item.actionItemId],
      checked: existingItem.checked && Boolean(item.completedAt),
      completedAt: getLatestCompletion(existingItem.completedAt, item.completedAt),
      quantity: existingItem.quantity + normalizeTripPackingQuantity(item.quantity),
      sourceKinds: existingItem.sourceKinds.includes(item.sourceKind)
        ? existingItem.sourceKinds
        : [...existingItem.sourceKinds, item.sourceKind],
    });
  }

  return [...checklistItems.values()].sort((first, second) =>
    compareStrings(`${first.title}-${first.id}`, `${second.title}-${second.id}`),
  );
}

export function setTripPackingCompletionState(
  plans: TripPackingPlan[],
  actionItemIds: string[],
  completedAt?: string,
) {
  const actionItemIdSet = new Set(actionItemIds);

  return plans.map((plan) => ({
    ...plan,
    itemsByMemberId: Object.fromEntries(
      Object.entries(plan.itemsByMemberId).map(([memberId, items]) => [
        memberId,
        items.map((item) =>
          actionItemIdSet.has(item.actionItemId)
            ? {
                ...item,
                completedAt,
              }
            : item,
        ),
      ]),
    ),
  }));
}

export function normalizeTripPackingQuantity(quantity: number) {
  if (!Number.isFinite(quantity)) {
    return 1;
  }

  return Math.max(1, Math.floor(quantity));
}

export function normalizeTripPackingTitle(title: string) {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function compareStrings(first: string, second: string) {
  if (first < second) {
    return -1;
  }

  if (first > second) {
    return 1;
  }

  return 0;
}

function getLatestCompletion(first?: string, second?: string) {
  if (!first) {
    return second;
  }

  if (!second) {
    return first;
  }

  return first > second ? first : second;
}
