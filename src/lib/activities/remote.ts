import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  fromActivitySponsorAmountCents,
  normalizeActivityTitleKey,
  normalizeActivityUnitLabel,
  normalizeActivitySponsorAmount,
  toActivitySponsorAmountCents,
} from "@/lib/activities/summary";
import type { ActivityDefinition, ActivityEntry } from "@/lib/activities/types";

type RemoteActivityDefinitionRow = {
  id: string;
  sponsor_amount_cents: number | null;
  status: "active" | "archived";
  title: string;
  title_key: string;
  unit_label: string;
};

type RemoteActivityEntryRow = {
  activity_definition_id: string;
  household_member_id: string;
  id: string;
  occurrence_date: string;
  quantity: number;
};

export function isMissingActivityTablesError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message = "message" in error ? error.message : undefined;
  const details = "details" in error ? error.details : undefined;
  const hint = "hint" in error ? error.hint : undefined;
  const status = "status" in error ? error.status : undefined;
  const text = [message, details, hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return (
    (typeof status === "number" && status === 404 && text.includes("activity")) ||
    text.includes("household_activity_definitions") ||
    text.includes("household_activity_entries")
  );
}

export async function loadRemoteActivityDefinitions(householdId: string) {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase
    .from("household_activity_definitions")
    .select("id, sponsor_amount_cents, status, title, title_key, unit_label")
    .eq("household_id", householdId)
    .order("title", { ascending: true })
    .returns<RemoteActivityDefinitionRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapRemoteActivityDefinition);
}

export async function loadRemoteActivityEntries({
  householdId,
  householdMemberId,
  memberId,
  startDate,
  endDate,
}: {
  endDate: string;
  householdId: string;
  householdMemberId: string;
  memberId: string;
  startDate: string;
}) {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase
    .from("household_activity_entries")
    .select("activity_definition_id, household_member_id, id, occurrence_date, quantity")
    .eq("household_id", householdId)
    .eq("household_member_id", householdMemberId)
    .gte("occurrence_date", startDate)
    .lte("occurrence_date", endDate)
    .returns<RemoteActivityEntryRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map((entry) => mapRemoteActivityEntry(entry, memberId));
}

export async function upsertRemoteActivityDefinition({
  householdId,
  sponsorAmount,
  title,
  unitLabel,
}: {
  householdId: string;
  sponsorAmount?: number;
  title: string;
  unitLabel: string;
}) {
  const supabase = createBrowserSupabaseClient();
  const normalizedSponsorAmount = normalizeActivitySponsorAmount(sponsorAmount);
  const { data, error } = await supabase
    .from("household_activity_definitions")
    .upsert(
      {
        household_id: householdId,
        sponsor_amount_cents: toActivitySponsorAmountCents(normalizedSponsorAmount),
        status: "active",
        title: title.trim().replace(/\s+/g, " "),
        unit_label: normalizeActivityUnitLabel(unitLabel),
      },
      {
        onConflict: "household_id,title_key",
      },
    )
    .select("id, sponsor_amount_cents, status, title, title_key, unit_label")
    .single<RemoteActivityDefinitionRow>();

  if (error) {
    throw error;
  }

  return mapRemoteActivityDefinition(data);
}

export async function updateRemoteActivityDefinition({
  activityId,
  householdId,
  sponsorAmount,
  status,
  title,
  unitLabel,
}: {
  activityId: string;
  householdId: string;
  sponsorAmount?: number;
  status?: "active" | "archived";
  title?: string;
  unitLabel?: string;
}) {
  const supabase = createBrowserSupabaseClient();
  const patch: {
    sponsor_amount_cents?: number | null;
    status?: "active" | "archived";
    title?: string;
    unit_label?: string;
  } = {};

  if (title !== undefined) {
    patch.title = title.trim().replace(/\s+/g, " ");
  }

  if (unitLabel !== undefined) {
    patch.unit_label = normalizeActivityUnitLabel(unitLabel);
  }

  if (sponsorAmount !== undefined) {
    patch.sponsor_amount_cents = toActivitySponsorAmountCents(
      normalizeActivitySponsorAmount(sponsorAmount),
    );
  }

  if (status !== undefined) {
    patch.status = status;
  }

  const { data, error } = await supabase
    .from("household_activity_definitions")
    .update(patch)
    .eq("household_id", householdId)
    .eq("id", activityId)
    .select("id, sponsor_amount_cents, status, title, title_key, unit_label")
    .single<RemoteActivityDefinitionRow>();

  if (error) {
    throw error;
  }

  return mapRemoteActivityDefinition(data);
}

export async function upsertRemoteActivityEntry({
  activityId,
  date,
  householdId,
  householdMemberId,
  memberId,
  quantity,
}: {
  activityId: string;
  date: string;
  householdId: string;
  householdMemberId: string;
  memberId: string;
  quantity: number;
}) {
  const supabase = createBrowserSupabaseClient();
  const normalizedQuantity = Math.max(0, Math.round(quantity));

  if (normalizedQuantity === 0) {
    const { error } = await supabase
      .from("household_activity_entries")
      .delete()
      .eq("household_id", householdId)
      .eq("activity_definition_id", activityId)
      .eq("household_member_id", householdMemberId)
      .eq("occurrence_date", date);

    if (error) {
      throw error;
    }

    return null;
  }

  const { data, error } = await supabase
    .from("household_activity_entries")
    .upsert(
      {
        activity_definition_id: activityId,
        household_id: householdId,
        household_member_id: householdMemberId,
        occurrence_date: date,
        quantity: normalizedQuantity,
      },
      {
        onConflict: "household_id,activity_definition_id,household_member_id,occurrence_date",
      },
    )
    .select("activity_definition_id, household_member_id, id, occurrence_date, quantity")
    .single<RemoteActivityEntryRow>();

  if (error) {
    throw error;
  }

  return mapRemoteActivityEntry(data, memberId);
}

export function mergeActivityDefinition(
  definitions: ActivityDefinition[],
  definition: ActivityDefinition,
) {
  const filteredDefinitions = definitions.filter((candidate) => candidate.id !== definition.id);

  return [...filteredDefinitions, definition].sort((first, second) => first.title.localeCompare(second.title));
}

export function mergeActivityEntry(entries: ActivityEntry[], entry: ActivityEntry) {
  const nextEntries = entries.filter(
    (candidate) => !(candidate.activityId === entry.activityId && candidate.date === entry.date),
  );

  return [...nextEntries, entry];
}

export function findMatchingActivityDefinition(
  definitions: ActivityDefinition[],
  title: string,
) {
  const titleKey = normalizeActivityTitleKey(title);

  return definitions.find((definition) => definition.titleKey === titleKey);
}

function mapRemoteActivityDefinition(activity: RemoteActivityDefinitionRow): ActivityDefinition {
  return {
    id: activity.id,
    sponsorAmount: fromActivitySponsorAmountCents(activity.sponsor_amount_cents),
    status: activity.status,
    title: activity.title,
    titleKey: activity.title_key,
    unitLabel: activity.unit_label,
  };
}

function mapRemoteActivityEntry(entry: RemoteActivityEntryRow, memberId: string): ActivityEntry {
  return {
    activityId: entry.activity_definition_id,
    date: entry.occurrence_date,
    id: entry.id,
    memberId,
    quantity: entry.quantity,
  };
}
