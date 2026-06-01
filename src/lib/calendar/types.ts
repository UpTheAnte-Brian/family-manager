export type CalendarSourceKind =
  | "ics-url"
  | "apple-calendar"
  | "sportsengine"
  | "school-calendar"
  | "manual-upload";

export type CalendarSource = {
  id: string;
  label: string;
  kind: CalendarSourceKind;
  url?: string;
  enabled: boolean;
  syncMode: "manual" | "scheduled";
  defaultVisibility: "family" | "parents" | "assigned-members";
  defaultMemberIds: string[];
  lastSyncedAt?: string;
  lastAppliedAt?: string;
  lastSyncStatus?: "success" | "error" | "never";
  lastSyncMessage?: string;
  notes?: string;
};

export type ImportedCalendarEvent = {
  sourceId: string;
  sourceUid?: string;
  teamId?: string;
  teamLabel?: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location?: string;
  category: string;
};

export type CalendarPreviewResult = {
  sourceId: string;
  eventCount: number;
  events: ImportedCalendarEvent[];
};

export type AppliedCalendarEvent = ImportedCalendarEvent & {
  sourceLabel: string;
  assignedMemberIds: string[];
  appliedAt: string;
};
