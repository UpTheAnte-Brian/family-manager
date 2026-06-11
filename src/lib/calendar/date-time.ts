export type CalendarEventIsoRange = {
  startsAt: string;
  endsAt: string;
  endDayOffset: number;
};

export function toCalendarEventIsoRange(
  date: string,
  startTime: string,
  endTime: string,
): CalendarEventIsoRange {
  const endDayOffset = getEndDayOffset(startTime, endTime);

  return {
    startsAt: toIsoDateTime(date, startTime),
    endsAt: toIsoDateTime(date, endTime, endDayOffset),
    endDayOffset,
  };
}

function getEndDayOffset(startTime: string, endTime: string) {
  if (startTime === "00:00" && endTime === "23:59") {
    return 0;
  }

  return parseClockMinutes(endTime) < parseClockMinutes(startTime) ? 1 : 0;
}

function toIsoDateTime(date: string, time: string, dayOffset = 0) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  return new Date(year, month - 1, day + dayOffset, hour, minute, 0).toISOString();
}

function parseClockMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);

  return hour * 60 + minute;
}
