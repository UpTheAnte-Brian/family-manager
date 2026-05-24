import type { DayOfWeek, FixedEvent, ScheduleBlock } from "@/lib/planner/types";

export type DayType =
  | "school-day"
  | "school-year-weekend"
  | "summer-weekday"
  | "summer-weekend"
  | "no-school"
  | "holiday";

export type TodayContext = {
  date: string;
  dayOfWeek: DayOfWeek;
  dayType: DayType;
  dayTypeLabel: string;
  baseline: {
    id: string;
    label: string;
    source: "configured" | "missing";
    blocks: ScheduleBlock[];
  };
  fixedEvents: FixedEvent[];
};

export type LocalHouseholdItemKind = "task" | "reminder";

export type LocalHouseholdItem = {
  id: string;
  kind: LocalHouseholdItemKind;
  title: string;
  assigneeId: string;
  date: string;
  createdAt: string;
  completedAt?: string;
};
