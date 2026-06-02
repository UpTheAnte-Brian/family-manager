import type { CalendarSource } from "@/lib/calendar/types";
import type { FixedEvent } from "@/lib/planner/types";

const configuredSportsEngineSource = "sportsengine-calendar";

export function getConfiguredEventsAfterAppliedSourceReplacements(
  configuredEvents: FixedEvent[],
  sources: CalendarSource[],
) {
  if (!hasAppliedSportsEngineSource(sources)) {
    return configuredEvents;
  }

  return configuredEvents.filter((event) => event.source !== configuredSportsEngineSource);
}

function hasAppliedSportsEngineSource(sources: CalendarSource[]) {
  return sources.some(
    (source) =>
      source.kind === "sportsengine" &&
      Boolean(source.lastAppliedAt),
  );
}
