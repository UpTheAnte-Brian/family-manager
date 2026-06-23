import type { DayOfWeek, HouseholdMember } from "@/lib/planner/types";

type RoutineScheduleLike = {
  durationMinutes?: number | null;
  endTime?: string | null;
  offsetMinutes?: number | null;
  startTime?: string | null;
};

export function isClockTime(value?: string | null) {
  return Boolean(value && /^\d{2}:\d{2}$/.test(value));
}

export function timeToMinutes(value?: string | null) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  const [hours, minutes] = value.split(":").map(Number);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes: number) {
  const minutesPerDay = 24 * 60;
  const normalizedMinutes =
    ((Math.trunc(totalMinutes) % minutesPerDay) + minutesPerDay) % minutesPerDay;
  const hours = String(Math.floor(normalizedMinutes / 60)).padStart(2, "0");
  const minutes = String(normalizedMinutes % 60).padStart(2, "0");

  return `${hours}:${minutes}`;
}

export function addMinutesToTime(startTime: string, minutesToAdd: number) {
  const startMinutes = timeToMinutes(startTime);

  if (startMinutes === null) {
    return "";
  }

  return minutesToTime(startMinutes + minutesToAdd);
}

export function getDurationMinutes(startTime?: string | null, endTime?: string | null) {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  if (startMinutes === null || endMinutes === null) {
    return null;
  }

  return endMinutes >= startMinutes ? endMinutes - startMinutes : endMinutes + 24 * 60 - startMinutes;
}

export function normalizeDurationMinutes(value?: number | null) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

export function normalizeOffsetMinutes(value?: number | null) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export function formatDurationMinutes(value?: number | null) {
  const normalizedValue = normalizeDurationMinutes(value);

  if (!normalizedValue) {
    return "";
  }

  return `${normalizedValue} min`;
}

export function isWeekendDay(dayOfWeek: DayOfWeek) {
  return dayOfWeek === "SA" || dayOfWeek === "SU";
}

export function resolveMemberWakeUpTime(
  member: Pick<HouseholdMember, "weekdayWakeUpTime" | "weekendWakeUpTime"> | null | undefined,
  dayOfWeek: DayOfWeek,
) {
  if (!member) {
    return null;
  }

  const candidate = isWeekendDay(dayOfWeek) ? member.weekendWakeUpTime : member.weekdayWakeUpTime;

  return isClockTime(candidate) ? candidate : null;
}

export function resolveRoutineTiming({
  dayOfWeek,
  member,
  schedule,
}: {
  dayOfWeek: DayOfWeek;
  member?: Pick<HouseholdMember, "weekdayWakeUpTime" | "weekendWakeUpTime"> | null;
  schedule: RoutineScheduleLike;
}) {
  const durationMinutes =
    normalizeDurationMinutes(schedule.durationMinutes) ??
    getDurationMinutes(schedule.startTime, schedule.endTime);
  const offsetMinutes = normalizeOffsetMinutes(schedule.offsetMinutes);
  const explicitStartTime = isClockTime(schedule.startTime) ? schedule.startTime : "";
  const explicitEndTime = isClockTime(schedule.endTime) ? schedule.endTime : "";

  if (explicitStartTime && explicitEndTime) {
    return {
      durationMinutes,
      endTime: explicitEndTime,
      isWakeUpDerived: false,
      offsetMinutes,
      startTime: explicitStartTime,
    };
  }

  const wakeUpTime = resolveMemberWakeUpTime(member, dayOfWeek);

  if (!wakeUpTime || offsetMinutes === null || !durationMinutes) {
    return {
      durationMinutes,
      endTime: "",
      isWakeUpDerived: false,
      offsetMinutes,
      startTime: "",
    };
  }

  const resolvedDurationMinutes = durationMinutes;
  const startTime = addMinutesToTime(wakeUpTime, offsetMinutes);
  const endTime = addMinutesToTime(startTime, resolvedDurationMinutes);

  return {
    durationMinutes: resolvedDurationMinutes,
    endTime,
    isWakeUpDerived: true,
    offsetMinutes,
    startTime,
  };
}
