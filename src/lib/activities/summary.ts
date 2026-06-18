import { fromAllowanceCents, normalizeCurrencyAmount, roundCurrencyAmount, toAllowanceCents } from "@/lib/allowance/storage";
import type { ActivityDefinition, ActivityEntry, ActivitySummary } from "@/lib/activities/types";

export function normalizeActivityTitleKey(title: string) {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeActivityUnitLabel(unitLabel: string) {
  const normalized = unitLabel.trim().replace(/\s+/g, " ");

  return normalized || "count";
}

export function getActivityWeekWindow(referenceDate: string) {
  const currentWeekStart = getWeekStart(referenceDate);

  return {
    currentWeekEnd: shiftDateKey(currentWeekStart, 6),
    currentWeekStart,
    previousWeekEnd: shiftDateKey(currentWeekStart, -1),
    previousWeekStart: shiftDateKey(currentWeekStart, -7),
  };
}

export function buildActivitySummaries({
  activities,
  entries,
  referenceDate,
}: {
  activities: ActivityDefinition[];
  entries: ActivityEntry[];
  referenceDate: string;
}) {
  const { currentWeekEnd, currentWeekStart, previousWeekEnd, previousWeekStart } =
    getActivityWeekWindow(referenceDate);
  const quantitiesByActivityAndDate = new Map<string, number>();
  const currentWeekTotals = new Map<string, number>();
  const previousWeekTotals = new Map<string, number>();

  for (const entry of entries) {
    quantitiesByActivityAndDate.set(getActivityDateKey(entry.activityId, entry.date), entry.quantity);

    if (entry.date >= currentWeekStart && entry.date <= currentWeekEnd) {
      currentWeekTotals.set(entry.activityId, (currentWeekTotals.get(entry.activityId) ?? 0) + entry.quantity);
    }

    if (entry.date >= previousWeekStart && entry.date <= previousWeekEnd) {
      previousWeekTotals.set(entry.activityId, (previousWeekTotals.get(entry.activityId) ?? 0) + entry.quantity);
    }
  }

  return [...activities]
    .filter((activity) => activity.status === "active")
    .map((activity) => {
      const selectedDateQuantity = quantitiesByActivityAndDate.get(
        getActivityDateKey(activity.id, referenceDate),
      ) ?? 0;
      const currentWeekTotal = currentWeekTotals.get(activity.id) ?? 0;
      const previousWeekTotal = previousWeekTotals.get(activity.id) ?? 0;
      const isSponsored = Boolean(activity.sponsorAmount);

      return {
        activity,
        currentWeekSponsoredAmount: isSponsored
          ? roundCurrencyAmount(currentWeekTotal * (activity.sponsorAmount ?? 0))
          : undefined,
        currentWeekTotal,
        isSponsored,
        previousWeekSponsoredAmount: isSponsored
          ? roundCurrencyAmount(previousWeekTotal * (activity.sponsorAmount ?? 0))
          : undefined,
        previousWeekTotal,
        selectedDateQuantity,
      } satisfies ActivitySummary;
    })
    .sort((first, second) => {
      if (first.isSponsored !== second.isSponsored) {
        return first.isSponsored ? -1 : 1;
      }

      return first.activity.title.localeCompare(second.activity.title);
    });
}

export function normalizeActivitySponsorAmount(value: number | string | null | undefined) {
  return normalizeCurrencyAmount(value);
}

export function toActivitySponsorAmountCents(value: number | undefined) {
  return value ? toAllowanceCents(value) : null;
}

export function fromActivitySponsorAmountCents(value: number | null | undefined) {
  return value === null || value === undefined ? undefined : fromAllowanceCents(value);
}

function getActivityDateKey(activityId: string, date: string) {
  return `${activityId}:${date}`;
}

function getWeekStart(date: string) {
  const parsedDate = parseDateKey(date);
  const day = parsedDate.getDay();
  const offset = day === 0 ? -6 : 1 - day;

  parsedDate.setDate(parsedDate.getDate() + offset);

  return formatDateKey(parsedDate);
}

function shiftDateKey(date: string, amount: number) {
  const parsedDate = parseDateKey(date);

  parsedDate.setDate(parsedDate.getDate() + amount);

  return formatDateKey(parsedDate);
}

function parseDateKey(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
