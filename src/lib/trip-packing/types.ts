export type TripPackingItemDraft = {
  id: string;
  quantity: number;
  title: string;
};

export type TripPackingStoredItem = {
  actionItemId: string;
  assigneeId: string;
  checklistStartsOn: string;
  completedAt?: string;
  createdAt: string;
  quantity: number;
  showOnDashboard: boolean;
  sourceItemId: string;
  sourceKind: "base" | "member";
  title: string;
  tripEndsOn: string;
  tripPlanId: string;
  tripStartsOn: string;
  tripName: string;
};

export type TripPackingPlan = {
  actionItemIds: string[];
  baseItems: TripPackingItemDraft[];
  checklistStartsOn: string;
  id: string;
  itemsByMemberId: Record<string, TripPackingStoredItem[]>;
  memberIds: string[];
  memberItems: Record<string, TripPackingItemDraft[]>;
  showOnDashboard: boolean;
  tripEndsOn: string;
  tripStartsOn: string;
  tripName: string;
};

export type TripPackingPlanInput = {
  baseItems: TripPackingItemDraft[];
  checklistStartsOn: string;
  id: string;
  memberIds: string[];
  memberItems: Record<string, TripPackingItemDraft[]>;
  showOnDashboard: boolean;
  tripEndsOn: string;
  tripStartsOn: string;
  tripName: string;
};
