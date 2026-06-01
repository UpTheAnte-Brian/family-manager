export type DayOfWeek = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

export type NoiseLevel = "low" | "medium" | "high" | "variable";

export type CalendarBehavior = "draft" | "fixed";

export type HouseholdMember = {
  id: string;
  preferredName: string;
  displayName: string;
  role: "parent" | "child";
  relationship: "dad" | "mom" | "son" | "daughter";
  birthDate?: string;
  workFromHome?: boolean;
  focusWindows?: {
    startTime: string;
    endTime: string;
  }[];
};

export type ScheduleBlock = {
  id: string;
  startTime: string;
  endTime: string;
  title: string;
  category: string;
  noiseLevel: NoiseLevel;
  location: "home" | "home-or-away" | "away";
  calendarBehavior: CalendarBehavior;
  futureLinks?: string[];
};

export type DayTemplate = {
  id: string;
  label: string;
  appliesTo: {
    daysOfWeek: DayOfWeek[];
    dateRange: {
      startsOn: string;
      endsOn: string;
    };
  };
  blocks: ScheduleBlock[];
};

export type FixedEvent = {
  id: string;
  source: string;
  sourceUid?: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  category: string;
  calendarBehavior: CalendarBehavior;
  assignedMemberIds?: string[];
  locationNote?: string;
};

export type RoutineChore = {
  id: string;
  title: string;
  category: "morning-routine";
  defaultAssigneeIds: string[];
  schedule: {
    daysOfWeek: DayOfWeek[];
    startTime: string;
    endTime: string;
  };
  countsTowardWeeklyTarget: boolean;
};

export type WeeklyChore = {
  id: string;
  title: string;
  category: string;
  estimatedMinutes: number;
  eligibleAssigneeIds: string[];
  requiresAdultCheck?: boolean;
};

export type WeeklyChoreAssignmentTemplate = {
  id: string;
  childId: string;
  choreId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
};

export type ChoreCompletion = {
  id: string;
  assignmentTemplateId: string;
  childId: string;
  choreId: string;
  completedAt: string;
  completedBy?: string;
  notes?: string;
};

export type PlannerData = {
  version: number;
  timezone: string;
  season: {
    id: string;
    label: string;
    startsOn: string;
    endsOn: string;
    schoolReturnsOn: string;
    notes: string[];
  };
  household: {
    members: HouseholdMember[];
  };
  chores: {
    weeklyTargetPerChild: number;
    routineChores: RoutineChore[];
    weeklyChores: WeeklyChore[];
    weeklyAssignmentTemplates: WeeklyChoreAssignmentTemplate[];
    completions: ChoreCompletion[];
  };
  calendarSources: {
    id: string;
    label: string;
    status: "pending-import" | "active";
    notes?: string;
  }[];
  dayTemplates: DayTemplate[];
  fixedEvents: FixedEvent[];
  futureModules: {
    id: string;
    label: string;
    status: "planned" | "active";
  }[];
};

export type PlannedDay = {
  date: string;
  dayOfWeek: DayOfWeek;
  template: Pick<DayTemplate, "id" | "label">;
  blocks: ScheduleBlock[];
  fixedEvents: FixedEvent[];
};
