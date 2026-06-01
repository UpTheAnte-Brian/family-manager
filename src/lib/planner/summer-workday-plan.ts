import type { FixedEvent, PlannerData } from "./types";

export const summerWorkdayPlanSourceId = "summer-workday-plan";
export const summerWorkdayPlanSourceLabel = "Summer Workday Plan";

const morningWindow = {
  startTime: "08:00",
  endTime: "11:00",
};

const plannedBlocks = [
  {
    id: "quiet-me-time",
    startTime: "08:00",
    endTime: "09:00",
    title: "Quiet me time: reading or pickup",
    category: "quiet-work",
  },
  {
    id: "away-activity",
    startTime: "09:00",
    endTime: "11:00",
    title: "Away activity: biking, soccer, park, or outing",
    category: "activity",
  },
  {
    id: "lunch",
    startTime: "11:30",
    endTime: "12:00",
    title: "Lunch",
    category: "meal",
  },
  {
    id: "at-home-outside-time",
    startTime: "12:00",
    endTime: "14:00",
    title: "At-home outside time",
    category: "activity",
  },
  {
    id: "toy-pickup-reset",
    startTime: "15:30",
    endTime: "16:00",
    title: "Toy pickup and house reset",
    category: "chores",
  },
] as const;

const substantiveActivityPattern =
  /\b(vbs|vacation bible|camp|school|class|lesson|practice|game|appointment|doctor|dentist|soccer|tennis|gymnastics|hockey)\b/i;
const reminderPattern = /\b(bring|pay|order|call|pack|register|sign up|signup|remind|renew)\b/i;

export function applySummerWorkdayPlan(plannerData: PlannerData): PlannerData {
  const childMemberIds = plannerData.household.members
    .filter((member) => member.role === "child")
    .map((member) => member.id);
  const existingEvents = plannerData.fixedEvents.filter(
    (event) => event.source !== summerWorkdayPlanSourceId,
  );
  const plannedEvents = buildSummerWorkdayPlanEvents({
    childMemberIds,
    existingEvents,
    endsOn: plannerData.season.endsOn,
    startsOn: plannerData.season.startsOn,
  });

  return {
    ...plannerData,
    calendarSources: upsertSummerWorkdayPlanSource(plannerData.calendarSources),
    fixedEvents: [...existingEvents, ...plannedEvents].sort(compareFixedEvents),
  };
}

export function buildSummerWorkdayPlanEvents({
  childMemberIds,
  existingEvents,
  endsOn,
  startsOn,
}: {
  childMemberIds: string[];
  existingEvents: FixedEvent[];
  endsOn: string;
  startsOn: string;
}) {
  const events: FixedEvent[] = [];

  for (const date of eachDate(startsOn, endsOn)) {
    if (!isWeekday(date)) {
      continue;
    }

    const dayConflicts = existingEvents.filter(
      (event) =>
        event.date === date &&
        isSubstantiveChildActivity(event) &&
        isRelevantToChildren(event, childMemberIds),
    );
    const skipMorning = dayConflicts.some((event) =>
      overlapsTimeRange(event, morningWindow.startTime, morningWindow.endTime),
    );

    for (const block of plannedBlocks) {
      if (skipMorning && block.startTime < morningWindow.endTime) {
        continue;
      }

      if (
        block.startTime >= morningWindow.endTime &&
        dayConflicts.some((event) => overlapsTimeRange(event, block.startTime, block.endTime))
      ) {
        continue;
      }

      events.push({
        id: `${summerWorkdayPlanSourceId}-${date}-${block.id}`,
        source: summerWorkdayPlanSourceId,
        sourceUid: `${date}-${block.id}`,
        date,
        startTime: block.startTime,
        endTime: block.endTime,
        title: block.title,
        category: block.category,
        calendarBehavior: "fixed",
        assignedMemberIds: childMemberIds,
      });
    }
  }

  return events;
}

export function isSubstantiveChildActivity(event: Pick<FixedEvent, "category" | "title">) {
  const searchableText = `${event.title} ${event.category}`;

  return substantiveActivityPattern.test(searchableText) && !reminderPattern.test(searchableText);
}

function isRelevantToChildren(event: Pick<FixedEvent, "assignedMemberIds">, childMemberIds: string[]) {
  if (!event.assignedMemberIds || event.assignedMemberIds.length === 0) {
    return true;
  }

  return event.assignedMemberIds.some((memberId) => childMemberIds.includes(memberId));
}

function upsertSummerWorkdayPlanSource(sources: PlannerData["calendarSources"]) {
  const source = {
    id: summerWorkdayPlanSourceId,
    label: summerWorkdayPlanSourceLabel,
    status: "active" as const,
    notes: "Generated from the summer workday plan script.",
  };

  if (sources.some((calendarSource) => calendarSource.id === summerWorkdayPlanSourceId)) {
    return sources.map((calendarSource) =>
      calendarSource.id === summerWorkdayPlanSourceId ? source : calendarSource,
    );
  }

  return [...sources, source];
}

function* eachDate(startsOn: string, endsOn: string) {
  const current = parseDateOnly(startsOn);
  const end = parseDateOnly(endsOn);

  while (current <= end) {
    yield formatDate(current);
    current.setDate(current.getDate() + 1);
  }
}

function isWeekday(date: string) {
  const day = parseDateOnly(date).getDay();

  return day >= 1 && day <= 5;
}

function overlapsTimeRange(event: Pick<FixedEvent, "endTime" | "startTime">, startTime: string, endTime: string) {
  return event.startTime < endTime && event.endTime > startTime;
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function compareFixedEvents(a: FixedEvent, b: FixedEvent) {
  return `${a.date} ${a.startTime} ${a.title}`.localeCompare(`${b.date} ${b.startTime} ${b.title}`);
}
