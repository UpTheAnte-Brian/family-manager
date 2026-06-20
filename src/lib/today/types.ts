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

export type LocalRoutineItem = {
  id: string;
  title: string;
  assigneeId: string;
  daysOfWeek: DayOfWeek[];
  startTime: string;
  endTime: string;
  createdAt: string;
};

export type LocalResponsibilityItem = {
  id: string;
  title: string;
  category?: ResponsibilityCategory;
  configuredSourceId?: string;
  assigneeId: string;
  daysOfWeek: DayOfWeek[];
  startTime: string;
  endTime: string;
  createdAt: string;
};

export type LocalTemporaryRoutineOccurrence = {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  remoteActionItemId?: string;
};

export type LocalTemporaryRoutineItem = {
  id: string;
  title: string;
  category?: ResponsibilityCategory;
  assigneeId: string;
  startsOn: string;
  endsOn: string;
  occurrences: LocalTemporaryRoutineOccurrence[];
  createdAt: string;
};

export type ResponsibilityCategory =
  | "morning-routine"
  | "homework"
  | "chores"
  | "sports"
  | "personal-hygiene"
  | "work"
  | "personal"
  | "investments"
  | "family-planning"
  | "home-maintenance"
  | "finance";

export type LocalHouseholdItem = {
  id: string;
  kind: LocalHouseholdItemKind;
  title: string;
  assigneeId: string;
  date: string;
  createdAt: string;
  category?: ResponsibilityCategory;
  completedAt?: string;
  displayMode?: "dated" | "open-responsibility";
};
