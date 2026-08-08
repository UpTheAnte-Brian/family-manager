export function formatClockTime(time: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);

  if (!match) {
    return time;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    return time;
  }

  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function formatTimeRange(startTime: string, endTime: string) {
  if (startTime === "00:00" && endTime === "23:59") {
    return "All day";
  }

  return `${formatClockTime(startTime)}–${formatClockTime(endTime)}`;
}
