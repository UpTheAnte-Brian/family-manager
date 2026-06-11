export type CalendarEventIsoRange = {
  startsAt: string;
  endsAt: string;
  endDayOffset: number;
};

export type CalendarDateTimeParts = {
  date: string;
  time: string;
};

export function toCalendarEventIsoRange(
  date: string,
  startTime: string,
  endTime: string,
  timeZone = "America/Chicago",
): CalendarEventIsoRange {
  const endDayOffset = getEndDayOffset(startTime, endTime);

  return {
    startsAt: toIsoDateTime(date, startTime, timeZone),
    endsAt: toIsoDateTime(date, endTime, timeZone, endDayOffset),
    endDayOffset,
  };
}

export function formatDateTimePartsInTimeZone(
  value: Date | string,
  timeZone: string,
): CalendarDateTimeParts {
  const date = value instanceof Date ? value : new Date(value);
  const parts = getZonedParts(date, timeZone);

  return {
    date: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
    time: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
  };
}

function getEndDayOffset(startTime: string, endTime: string) {
  if (startTime === "00:00" && endTime === "23:59") {
    return 0;
  }

  return parseClockMinutes(endTime) < parseClockMinutes(startTime) ? 1 : 0;
}

function toIsoDateTime(date: string, time: string, timeZone: string, dayOffset = 0) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const zonedWallTime = Date.UTC(year, month - 1, day + dayOffset, hour, minute, 0);
  const offset = getTimeZoneOffsetMs(new Date(zonedWallTime), timeZone);

  return new Date(zonedWallTime - offset).toISOString();
}

function parseClockMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);

  return hour * 60 + minute;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getZonedParts(date, timeZone);
  const zonedTime = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return zonedTime - date.getTime();
}

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    month: parts.month,
    second: parts.second,
    year: parts.year,
  };
}
