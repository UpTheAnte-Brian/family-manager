export type ActivityDefinition = {
  id: string;
  title: string;
  titleKey: string;
  unitLabel: string;
  sponsorAmount?: number;
  status: "active" | "archived";
};

export type ActivityEntry = {
  id: string;
  activityId: string;
  memberId: string;
  date: string;
  quantity: number;
};

export type ActivitySummary = {
  activity: ActivityDefinition;
  selectedDateQuantity: number;
  currentWeekTotal: number;
  previousWeekTotal: number;
  currentWeekSponsoredAmount?: number;
  previousWeekSponsoredAmount?: number;
  isSponsored: boolean;
};
