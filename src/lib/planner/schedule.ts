import plannerJson from "../../../data/summer-2026-planner.json";
import type {
  DayOfWeek,
  DayTemplate,
  HouseholdMember,
  PlannedDay,
  PlannerData,
  WeeklyChore,
} from "./types";

export const plannerData = plannerJson as PlannerData;

const dayCodes: DayOfWeek[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function parseLocalDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDayOfWeek(date: string): DayOfWeek {
  return dayCodes[parseLocalDate(date).getDay()];
}

function isWithinRange(date: string, startsOn: string, endsOn: string) {
  return date >= startsOn && date <= endsOn;
}

function findTemplateForDate(date: string): DayTemplate {
  const dayOfWeek = getDayOfWeek(date);
  const template = plannerData.dayTemplates.find((candidate) => {
    const range = candidate.appliesTo.dateRange;

    return (
      candidate.appliesTo.daysOfWeek.includes(dayOfWeek) &&
      isWithinRange(date, range.startsOn, range.endsOn)
    );
  });

  if (!template) {
    throw new Error(`No planner template found for ${date}`);
  }

  return template;
}

export function buildPlannedDays(limit?: number): PlannedDay[] {
  const days: PlannedDay[] = [];
  const current = parseLocalDate(plannerData.season.startsOn);
  const finalDate = parseLocalDate(plannerData.season.endsOn);

  while (current <= finalDate) {
    const date = toDateKey(current);
    const template = findTemplateForDate(date);

    days.push({
      date,
      dayOfWeek: getDayOfWeek(date),
      template: {
        id: template.id,
        label: template.label,
      },
      blocks: template.blocks,
      fixedEvents: plannerData.fixedEvents.filter((event) => event.date === date),
    });

    if (limit && days.length >= limit) {
      break;
    }

    current.setDate(current.getDate() + 1);
  }

  return days;
}

export function getScheduleStats() {
  const days = buildPlannedDays();
  const blockCount = days.reduce((total, day) => total + day.blocks.length, 0);
  const quietBlockCount = days.reduce(
    (total, day) =>
      total + day.blocks.filter((block) => block.noiseLevel === "low").length,
    0,
  );

  return {
    dayCount: days.length,
    blockCount,
    quietBlockCount,
    fixedEventCount: plannerData.fixedEvents.length,
  };
}

export function getChildMembers(): HouseholdMember[] {
  return plannerData.household.members.filter((member) => member.role === "child");
}

export function getWeeklyChoreSummary() {
  const choresById = new Map<string, WeeklyChore>(
    plannerData.chores.weeklyChores.map((chore) => [chore.id, chore]),
  );

  return getChildMembers().map((child) => {
    const assignments = plannerData.chores.weeklyAssignmentTemplates
      .filter((assignment) => assignment.childId === child.id)
      .map((assignment) => ({
        ...assignment,
        chore: choresById.get(assignment.choreId),
        completions: plannerData.chores.completions.filter(
          (completion) => completion.assignmentTemplateId === assignment.id,
        ),
      }));

    return {
      child,
      assignedCount: assignments.length,
      completedCount: assignments.filter((assignment) => assignment.completions.length > 0).length,
      targetCount: plannerData.chores.weeklyTargetPerChild,
      assignments,
    };
  });
}
