import type {
  ChoreCompletion,
  RoutineChore,
  WeeklyChore,
  WeeklyChoreAssignmentTemplate,
} from "@/lib/planner/types";

export const choreStorageKey = "family-manager:chores:v2";

export type ChoreStorageState = {
  routineChores: RoutineChore[];
  weeklyChores: WeeklyChore[];
  weeklyAssignmentTemplates: WeeklyChoreAssignmentTemplate[];
  completions: ChoreCompletion[];
};
