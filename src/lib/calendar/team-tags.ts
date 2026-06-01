import type { AppliedCalendarEvent, ImportedCalendarEvent } from "./types";

export type CalendarTeamAssignment = {
  teamKey: string;
  teamLabel: string;
  assignedMemberIds: string[];
};

type TeamTagInput = {
  description?: string;
  sourceId: string;
  teamId?: string;
  title: string;
};

const knownSportsEngineTeams: Record<string, string> = {
  "11ef80ea-d381-d21c-9316-4a0e92f31379": "FURY U8",
  "11f0c4a9-5d31-45bc-9423-6ad70687d3d4": "U9 Boys Select",
};

export function getCalendarEventTeamKey(event: ImportedCalendarEvent | AppliedCalendarEvent) {
  const teamLabel = event.teamLabel ?? inferSportsTeamLabel(event);

  if (teamLabel) {
    return `label:${normalizeTeamLabel(teamLabel)}`;
  }

  return event.teamId ? `sportsengine:${event.teamId}` : "";
}

export function getCalendarEventTeamLabel(event: ImportedCalendarEvent | AppliedCalendarEvent) {
  return event.teamLabel ?? inferSportsTeamLabel(event);
}

export function getSportsEngineTeamId(description: unknown) {
  if (!description) {
    return undefined;
  }

  const match = String(description).match(/team_id(?:%3D|=)([a-f0-9-]+)/i);

  return match?.[1]?.toLowerCase();
}

export function inferSportsTeamLabel(input: TeamTagInput) {
  const teamId = input.teamId ?? getSportsEngineTeamId(input.description);

  if (teamId && knownSportsEngineTeams[teamId]) {
    return knownSportsEngineTeams[teamId];
  }

  const normalizedTitle = input.title.toLowerCase();
  const normalizedSourceId = input.sourceId.toLowerCase();

  if (!normalizedSourceId.includes("sports") && !normalizedTitle.includes("sports")) {
    return undefined;
  }

  if (
    normalizedTitle.includes("fury u8") ||
    normalizedTitle.includes("fury aaa u8") ||
    normalizedTitle.includes("fury tryouts u8")
  ) {
    return "FURY U8";
  }

  if (normalizedTitle.includes("u9 boys select")) {
    return "U9 Boys Select";
  }

  if (normalizedTitle.includes("mite 2")) {
    return "MWHA Mite 2";
  }

  if (normalizedTitle.includes("jr orono")) {
    return "Jr Orono";
  }

  if (normalizedTitle.includes("2nd grade skill")) {
    return "2nd Grade Skills";
  }

  return undefined;
}

export function normalizeTeamLabel(teamLabel: string) {
  return teamLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function getCalendarTeamAssignment(
  assignments: CalendarTeamAssignment[],
  teamKey: string,
) {
  const exactAssignment = assignments.find((assignment) => assignment.teamKey === teamKey);

  if (exactAssignment) {
    return exactAssignment;
  }

  const legacyTeamKeys = new Set(getLegacyCalendarTeamKeys(teamKey));

  return assignments.find((assignment) => legacyTeamKeys.has(assignment.teamKey));
}

function getLegacyCalendarTeamKeys(teamKey: string) {
  if (teamKey === "label:u9-boys-select") {
    return [
      "label:u9-boys-select-2",
      "sportsengine:11f0c4a9-5d31-45bc-9423-6ad70687d3d4",
    ];
  }

  return [];
}
