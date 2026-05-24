import type { DayOfWeek, DayTemplate, PlannerData } from "@/lib/planner/types";
import type { DayType, TodayContext } from "./types";

const dayCodes: DayOfWeek[] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const weekendDays: DayOfWeek[] = ["SA", "SU"];

export function getTodayContext(now: Date, plannerData: PlannerData): TodayContext {
  const date = toDateKeyInTimeZone(now, plannerData.timezone);
  const dayOfWeek = getDayOfWeek(date);
  const fixedEvents = plannerData.fixedEvents.filter((event) => event.date === date);
  const dayType = classifyDay(date, dayOfWeek, fixedEvents, plannerData);
  const template = findTemplateForDate(date, dayOfWeek, plannerData.dayTemplates);

  return {
    date,
    dayOfWeek,
    dayType,
    dayTypeLabel: getDayTypeLabel(dayType),
    baseline: {
      id: template?.id ?? `missing-${dayType}`,
      label: template?.label ?? `No ${getDayTypeLabel(dayType).toLowerCase()} baseline configured`,
      source: template ? "configured" : "missing",
      blocks: template?.blocks ?? [],
    },
    fixedEvents,
  };
}

export function classifyDay(
  date: string,
  dayOfWeek: DayOfWeek,
  events: { title: string; category: string }[],
  plannerData: Pick<PlannerData, "season">,
): DayType {
  const allText = events.map((event) => `${event.title} ${event.category}`.toLowerCase()).join(" ");

  if (allText.includes("holiday") || allText.includes("labor day")) {
    return "holiday";
  }

  if (allText.includes("no school") || allText.includes("school closed")) {
    return "no-school";
  }

  const isWeekend = weekendDays.includes(dayOfWeek);
  const isSummer = date >= plannerData.season.startsOn && date <= plannerData.season.endsOn;

  if (isSummer) {
    return isWeekend ? "summer-weekend" : "summer-weekday";
  }

  return isWeekend ? "school-year-weekend" : "school-day";
}

export function getDayTypeLabel(dayType: DayType) {
  switch (dayType) {
    case "school-day":
      return "School day";
    case "school-year-weekend":
      return "School-year weekend";
    case "summer-weekday":
      return "Summer weekday";
    case "summer-weekend":
      return "Summer weekend";
    case "no-school":
      return "No-school day";
    case "holiday":
      return "Holiday";
  }
}

function findTemplateForDate(
  date: string,
  dayOfWeek: DayOfWeek,
  templates: DayTemplate[],
) {
  return templates.find((candidate) => {
    const range = candidate.appliesTo.dateRange;

    return (
      candidate.appliesTo.daysOfWeek.includes(dayOfWeek) &&
      date >= range.startsOn &&
      date <= range.endsOn
    );
  });
}

function getDayOfWeek(date: string): DayOfWeek {
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);

  return dayCodes[parsed.getDay()];
}

function toDateKeyInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}
